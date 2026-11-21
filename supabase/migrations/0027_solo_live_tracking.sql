-- Live tracking of Solo League rounds by scorekeepers (spectators).
--
-- Same model as 0021 (team matches): a session per round acts as a lock, live
-- stats are saved as the scoreboard is read, and every write goes through the
-- security definer functions below. Differences for solo rounds:
--   - Kills can go DOWN (falling out of the map costs a kill), so live totals
--     are not forced to only go up.
--   - Every kills reading is kept in solo_kill_readings (the "versions"), with
--     what the tracker did with it: applied, a fall, held back as a suspicious
--     jump, confirmed, or a reconnect.
--   - Players with a fall, held jump or reconnect get needs_review = true; the
--     admin sees an alert on that round until it is marked reviewed.
--   - Ending the round writes the live totals into solo_round_results as a
--     draft. The round only counts once an admin completes it.
--
-- Rollback: supabase/backups/0027_solo_live_tracking_rollback.sql.

create table solo_live_sessions (
  round_id uuid primary key references solo_rounds(id) on delete cascade,
  scorekeeper_id uuid references auth.users(id) on delete set null,
  status text not null default 'LIVE' check (status in ('LIVE', 'ENDED')),
  started_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  ended_at timestamptz
);

-- Live state per player. A reconnect resets in-game stats to 0, so finished
-- sessions are banked: total = banked + current. Kills may be negative.
create table solo_live_stats (
  round_id uuid not null references solo_rounds(id) on delete cascade,
  player_id uuid not null references players(id) on delete restrict,
  banked_kills integer not null default 0,
  banked_deaths integer not null default 0 check (banked_deaths >= 0),
  cur_kills integer not null default 0,
  cur_deaths integer not null default 0 check (cur_deaths >= 0),
  deaths_seen boolean not null default false,
  sessions integer not null default 1 check (sessions >= 1),
  on_board boolean not null default true,
  last_read_kills integer,
  held_kills integer,
  held_count integer not null default 0,
  needs_review boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (round_id, player_id)
);

-- Every kills reading, oldest first: the version history the admin reviews.
create table solo_kill_readings (
  id bigint generated always as identity primary key,
  round_id uuid not null references solo_rounds(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  read_kills integer not null,
  read_deaths integer,
  outcome text not null check (outcome in ('FIRST', 'APPLIED', 'FALL', 'HELD', 'CONFIRMED', 'RECONNECT', 'UPLOAD')),
  total_kills integer not null,
  created_at timestamptz not null default now()
);

create index idx_solo_kill_readings_round on solo_kill_readings(round_id, player_id);

alter table solo_live_sessions enable row level security;
alter table solo_live_stats enable row level security;
alter table solo_kill_readings enable row level security;

create policy "solo_live_sessions_public_read" on solo_live_sessions for select using (true);
create policy "solo_live_stats_public_read" on solo_live_stats for select using (true);
create policy "solo_kill_readings_staff_read" on solo_kill_readings for select using (is_admin() or is_scorekeeper());

-- ─────────────────────────────────────────────────────────────────────────
-- Helpers
-- ─────────────────────────────────────────────────────────────────────────

-- Role, round exists and is not completed, season not completed, and (unless
-- an admin) the caller holds the round's live lock.
create function assert_can_track_solo(p_round_id uuid, p_require_lock boolean) returns solo_rounds
language plpgsql security definer set search_path = public
as $$
declare
  v_round solo_rounds%rowtype;
  v_session solo_live_sessions%rowtype;
begin
  if not (is_scorekeeper() or is_admin()) then
    raise exception 'Only scorekeepers can track rounds.';
  end if;
  select * into v_round from solo_rounds where id = p_round_id;
  if not found then
    raise exception 'Round not found.';
  end if;
  if v_round.status = 'COMPLETED' then
    raise exception 'This round is already completed, so it can no longer be tracked.';
  end if;
  if exists (select 1 from solo_seasons where id = v_round.season_id and status = 'COMPLETED') then
    raise exception 'This Solo League season is completed, so it can no longer be tracked.';
  end if;
  if p_require_lock and not is_admin() then
    select * into v_session from solo_live_sessions where round_id = p_round_id;
    if not found or v_session.scorekeeper_id is distinct from auth.uid() then
      raise exception 'Another scorekeeper is tracking this round. Claim it again to take over.';
    end if;
  end if;
  return v_round;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Scorekeeper RPCs
-- ─────────────────────────────────────────────────────────────────────────

-- Starts or resumes tracking a round. Fails if another scorekeeper sent an
-- update in the last 2 minutes.
create function claim_solo_round(p_round_id uuid) returns solo_live_sessions
language plpgsql security definer set search_path = public
as $$
declare
  v_session solo_live_sessions%rowtype;
begin
  perform assert_can_track_solo(p_round_id, false);

  select * into v_session from solo_live_sessions where round_id = p_round_id for update;
  if found and v_session.status = 'LIVE' and v_session.scorekeeper_id is distinct from auth.uid()
     and v_session.heartbeat_at > now() - interval '2 minutes' and not is_admin() then
    raise exception 'Another scorekeeper is already tracking this round.';
  end if;

  insert into solo_live_sessions (round_id, scorekeeper_id, status, started_at, heartbeat_at)
  values (p_round_id, auth.uid(), 'LIVE', now(), now())
  on conflict (round_id) do update
    set scorekeeper_id = auth.uid(), status = 'LIVE', heartbeat_at = now(), ended_at = null
  returning * into v_session;

  return v_session;
end;
$$;

-- Saves the live state after one scoreboard read.
-- p_stats: [{ player_id, banked_kills, banked_deaths, cur_kills, cur_deaths,
--   deaths_seen, sessions, on_board, last_read_kills, held_kills, held_count,
--   needs_review }]
-- p_readings: [{ player_id, read_kills, read_deaths, outcome, total_kills }]
-- needs_review is never switched off here — only an admin clears it.
create function record_solo_live(p_round_id uuid, p_stats jsonb, p_readings jsonb) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_round solo_rounds%rowtype;
  v_stat jsonb;
  v_player uuid;
begin
  v_round := assert_can_track_solo(p_round_id, true);

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_stats, '[]'::jsonb)) s
    where not exists (
      select 1 from solo_season_players sp
      where sp.season_id = v_round.season_id and sp.player_id = (s->>'player_id')::uuid
    )
  ) then
    raise exception 'A player is not registered for this Solo League season.';
  end if;

  for v_stat in select * from jsonb_array_elements(coalesce(p_stats, '[]'::jsonb)) loop
    v_player := (v_stat->>'player_id')::uuid;
    insert into solo_live_stats (
      round_id, player_id, banked_kills, banked_deaths, cur_kills, cur_deaths, deaths_seen,
      sessions, on_board, last_read_kills, held_kills, held_count, needs_review, updated_at
    ) values (
      p_round_id, v_player,
      coalesce((v_stat->>'banked_kills')::integer, 0),
      greatest(coalesce((v_stat->>'banked_deaths')::integer, 0), 0),
      coalesce((v_stat->>'cur_kills')::integer, 0),
      greatest(coalesce((v_stat->>'cur_deaths')::integer, 0), 0),
      coalesce((v_stat->>'deaths_seen')::boolean, false),
      greatest(coalesce((v_stat->>'sessions')::integer, 1), 1),
      coalesce((v_stat->>'on_board')::boolean, true),
      (v_stat->>'last_read_kills')::integer,
      (v_stat->>'held_kills')::integer,
      greatest(coalesce((v_stat->>'held_count')::integer, 0), 0),
      coalesce((v_stat->>'needs_review')::boolean, false),
      now()
    )
    on conflict (round_id, player_id) do update set
      banked_kills = excluded.banked_kills,
      banked_deaths = excluded.banked_deaths,
      cur_kills = excluded.cur_kills,
      cur_deaths = excluded.cur_deaths,
      deaths_seen = excluded.deaths_seen,
      sessions = excluded.sessions,
      on_board = excluded.on_board,
      last_read_kills = excluded.last_read_kills,
      held_kills = excluded.held_kills,
      held_count = excluded.held_count,
      needs_review = solo_live_stats.needs_review or excluded.needs_review,
      updated_at = now();
  end loop;

  insert into solo_kill_readings (round_id, player_id, read_kills, read_deaths, outcome, total_kills)
  select p_round_id, (r->>'player_id')::uuid, (r->>'read_kills')::integer, (r->>'read_deaths')::integer,
         r->>'outcome', (r->>'total_kills')::integer
  from jsonb_array_elements(coalesce(p_readings, '[]'::jsonb)) r
  where (r->>'player_id')::uuid in (select player_id from solo_live_stats where round_id = p_round_id);

  update solo_live_sessions set heartbeat_at = now() where round_id = p_round_id;
end;
$$;

-- Ends live tracking: writes every tracked player's live totals into the
-- round's results (positions by kills, dense ranking; negative kills count as
-- 0) and leaves the round not completed for an admin to review and complete.
create function end_solo_live_round(p_round_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform assert_can_track_solo(p_round_id, true);
  if not exists (select 1 from solo_live_stats where round_id = p_round_id) then
    raise exception 'Nothing has been tracked in this round yet.';
  end if;

  delete from solo_round_results where round_id = p_round_id;
  insert into solo_round_results (round_id, player_id, kills, deaths, position)
  select p_round_id, x.player_id, x.kills, x.deaths, dense_rank() over (order by x.kills desc)
  from (
    select player_id, greatest(banked_kills + cur_kills, 0) as kills, banked_deaths + cur_deaths as deaths
    from solo_live_stats where round_id = p_round_id
  ) x;

  update solo_live_sessions set status = 'ENDED', ended_at = now(), heartbeat_at = now()
  where round_id = p_round_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Admin RPCs
-- ─────────────────────────────────────────────────────────────────────────

-- Clears a player's review alert for a round.
create function resolve_solo_review(p_round_id uuid, p_player_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Only administrators can review Solo League alerts.';
  end if;
  update solo_live_stats set needs_review = false where round_id = p_round_id and player_id = p_player_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Grants and Realtime
-- ─────────────────────────────────────────────────────────────────────────

grant select on solo_live_sessions, solo_live_stats to anon, authenticated;
grant select on solo_kill_readings to authenticated;
grant all on solo_live_sessions, solo_live_stats, solo_kill_readings to service_role;

revoke execute on function assert_can_track_solo(uuid, boolean) from public, anon, authenticated;
revoke execute on function claim_solo_round(uuid) from public, anon;
revoke execute on function record_solo_live(uuid, jsonb, jsonb) from public, anon;
revoke execute on function end_solo_live_round(uuid) from public, anon;
revoke execute on function resolve_solo_review(uuid, uuid) from public, anon;
grant execute on function claim_solo_round(uuid), record_solo_live(uuid, jsonb, jsonb),
  end_solo_live_round(uuid), resolve_solo_review(uuid, uuid) to authenticated;
grant execute on function assert_can_track_solo(uuid, boolean), claim_solo_round(uuid),
  record_solo_live(uuid, jsonb, jsonb), end_solo_live_round(uuid), resolve_solo_review(uuid, uuid) to service_role;

-- The public Solo League page and the navbar LIVE pill follow these over Realtime.
alter publication supabase_realtime add table solo_live_stats;
alter publication supabase_realtime add table solo_live_sessions;
