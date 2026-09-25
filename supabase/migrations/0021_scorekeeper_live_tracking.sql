-- Live match tracking by scorekeepers (spectators).
--
-- A scorekeeper is a limited login: it can track a SCHEDULED match live and
-- submit its result, and nothing else. It has no write policy on any table —
-- every write goes through the security definer functions below, which check
-- the role, the match status and the rosters themselves.
--
-- This migration only adds new objects; it does not alter any existing table,
-- policy or function. 0021_scorekeeper_live_tracking_rollback.sql (in
-- supabase/backups/) removes everything added here.

-- ─────────────────────────────────────────────────────────────────────────
-- Scorekeeper role
-- ─────────────────────────────────────────────────────────────────────────

create table scorekeeper_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create function is_scorekeeper() returns boolean as $$
  select exists (select 1 from scorekeeper_profiles where user_id = auth.uid());
$$ language sql stable security definer set search_path = public;

alter table scorekeeper_profiles enable row level security;

create policy "scorekeeper_profiles_self_read" on scorekeeper_profiles
  for select using (auth.uid() = user_id or is_admin());

-- No INSERT/UPDATE/DELETE policies on purpose — scorekeepers are provisioned
-- manually via the SQL editor, the same way admins are (see README).

-- ─────────────────────────────────────────────────────────────────────────
-- Live tracking tables
-- ─────────────────────────────────────────────────────────────────────────

-- One tracking session per match. Acts as a lock so two spectators don't
-- track (and overwrite) the same match at the same time.
create table match_live_sessions (
  match_id uuid primary key references matches(id) on delete cascade,
  scorekeeper_id uuid references auth.users(id) on delete set null,
  status text not null default 'LIVE' check (status in ('LIVE', 'SUBMITTED')),
  started_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  submitted_at timestamptz
);

-- Per-player live stats. A reconnect in Smash Karts resets a player's stats
-- to 0, so earlier sessions are "banked" and the total is banked + current.
create table match_live_stats (
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete restrict,
  team_id uuid not null references teams(id) on delete restrict,
  banked_kills integer not null default 0,
  banked_deaths integer not null default 0,
  banked_flags integer not null default 0,
  cur_kills integer not null default 0,
  cur_deaths integer not null default 0,
  cur_flags integer not null default 0,
  sessions integer not null default 1,
  on_board boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (match_id, player_id),
  constraint live_stats_nonneg check (
    banked_kills >= 0 and banked_deaths >= 0 and banked_flags >= 0 and
    cur_kills >= 0 and cur_deaths >= 0 and cur_flags >= 0 and sessions >= 1
  )
);

-- Append-only audit log of every extraction (what the model read, when, by whom).
create table match_live_snapshots (
  id bigint generated always as identity primary key,
  match_id uuid not null references matches(id) on delete cascade,
  scorekeeper_id uuid references auth.users(id) on delete set null,
  source text not null check (source in ('LIVE', 'FINAL')),
  extracted jsonb not null,
  created_at timestamptz not null default now()
);

create index idx_live_snapshots_match on match_live_snapshots(match_id);

alter table match_live_sessions enable row level security;
alter table match_live_stats enable row level security;
alter table match_live_snapshots enable row level security;

create policy "match_live_sessions_public_read" on match_live_sessions for select using (true);
create policy "match_live_stats_public_read" on match_live_stats for select using (true);
create policy "match_live_snapshots_staff_read" on match_live_snapshots
  for select using (is_admin() or is_scorekeeper());

-- No write policies on any of these tables: writes only happen through the
-- functions below.

-- ─────────────────────────────────────────────────────────────────────────
-- Helpers
-- ─────────────────────────────────────────────────────────────────────────

-- The players eligible for a match, with the team each one plays for.
-- Season matches use the season roster; exhibitions use the rows that
-- create_exhibition_match seeds into match_player_stats.
create function match_roster(p_match_id uuid)
returns table (player_id uuid, team_id uuid)
language sql stable security definer set search_path = public
as $$
  select r.player_id, r.team_id
  from matches m
  join season_rosters r on r.season_id = m.season_id and r.team_id in (m.team_a_id, m.team_b_id)
  where m.id = p_match_id and m.season_id is not null
  union all
  select s.player_id, s.team_id
  from matches m
  join match_player_stats s on s.match_id = m.id
  where m.id = p_match_id and m.season_id is null;
$$;

-- Common guard for every scorekeeper action: role, match exists and is still
-- SCHEDULED, and (unless an admin) the caller holds the match's live lock.
create function assert_can_track(p_match_id uuid, p_require_lock boolean) returns matches
language plpgsql security definer set search_path = public
as $$
declare
  v_match matches%rowtype;
  v_session match_live_sessions%rowtype;
begin
  if not (is_scorekeeper() or is_admin()) then
    raise exception 'Only scorekeepers can track matches.';
  end if;

  select * into v_match from matches where id = p_match_id;
  if not found then
    raise exception 'Match not found.';
  end if;
  if v_match.status <> 'SCHEDULED' then
    raise exception 'This match is already %, so it can no longer be tracked.', lower(v_match.status::text);
  end if;

  if p_require_lock and not is_admin() then
    select * into v_session from match_live_sessions where match_id = p_match_id;
    if not found or v_session.scorekeeper_id is distinct from auth.uid() then
      raise exception 'Another scorekeeper is tracking this match. Claim it again to take over.';
    end if;
  end if;

  return v_match;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Scorekeeper RPCs
-- ─────────────────────────────────────────────────────────────────────────

-- Starts (or resumes) tracking a match. Fails if another scorekeeper has sent
-- an update in the last 2 minutes, so an abandoned lock frees itself.
create function claim_live_match(p_match_id uuid) returns match_live_sessions
language plpgsql security definer set search_path = public
as $$
declare
  v_session match_live_sessions%rowtype;
begin
  perform assert_can_track(p_match_id, false);

  select * into v_session from match_live_sessions where match_id = p_match_id for update;

  if found and v_session.scorekeeper_id is distinct from auth.uid()
     and v_session.heartbeat_at > now() - interval '2 minutes'
     and not is_admin() then
    raise exception 'Another scorekeeper is already tracking this match.';
  end if;

  insert into match_live_sessions (match_id, scorekeeper_id, status, started_at, heartbeat_at)
  values (p_match_id, auth.uid(), 'LIVE', now(), now())
  on conflict (match_id) do update
    set scorekeeper_id = auth.uid(), status = 'LIVE', heartbeat_at = now()
  returning * into v_session;

  return v_session;
end;
$$;

-- Saves the merged live stats for a match. p_stats is an array of
-- { player_id, banked_kills, banked_deaths, banked_flags, cur_kills,
--   cur_deaths, cur_flags, sessions, on_board }.
-- The team always comes from the roster, and a player's total
-- (banked + current) may never go down, so a bad update can't wipe stats.
create function record_live_stats(p_match_id uuid, p_stats jsonb, p_extracted jsonb) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_stat jsonb;
  v_player uuid;
  v_team uuid;
  v_old match_live_stats%rowtype;
  v_new match_live_stats%rowtype;
begin
  perform assert_can_track(p_match_id, true);

  for v_stat in select * from jsonb_array_elements(p_stats) loop
    v_player := (v_stat->>'player_id')::uuid;

    select r.team_id into v_team from match_roster(p_match_id) r where r.player_id = v_player;
    if v_team is null then
      raise exception 'Player % is not on either team for this match.', v_player;
    end if;

    v_new.banked_kills := coalesce((v_stat->>'banked_kills')::integer, 0);
    v_new.banked_deaths := coalesce((v_stat->>'banked_deaths')::integer, 0);
    v_new.banked_flags := coalesce((v_stat->>'banked_flags')::integer, 0);
    v_new.cur_kills := coalesce((v_stat->>'cur_kills')::integer, 0);
    v_new.cur_deaths := coalesce((v_stat->>'cur_deaths')::integer, 0);
    v_new.cur_flags := coalesce((v_stat->>'cur_flags')::integer, 0);

    select * into v_old from match_live_stats where match_id = p_match_id and player_id = v_player;
    if found and (
      v_new.banked_kills + v_new.cur_kills < v_old.banked_kills + v_old.cur_kills or
      v_new.banked_deaths + v_new.cur_deaths < v_old.banked_deaths + v_old.cur_deaths or
      v_new.banked_flags + v_new.cur_flags < v_old.banked_flags + v_old.cur_flags
    ) then
      raise exception 'Live totals can only go up (player %).', v_player;
    end if;

    insert into match_live_stats (
      match_id, player_id, team_id,
      banked_kills, banked_deaths, banked_flags, cur_kills, cur_deaths, cur_flags,
      sessions, on_board, updated_at
    ) values (
      p_match_id, v_player, v_team,
      v_new.banked_kills, v_new.banked_deaths, v_new.banked_flags,
      v_new.cur_kills, v_new.cur_deaths, v_new.cur_flags,
      greatest(coalesce((v_stat->>'sessions')::integer, 1), 1),
      coalesce((v_stat->>'on_board')::boolean, true),
      now()
    )
    on conflict (match_id, player_id) do update set
      team_id = excluded.team_id,
      banked_kills = excluded.banked_kills,
      banked_deaths = excluded.banked_deaths,
      banked_flags = excluded.banked_flags,
      cur_kills = excluded.cur_kills,
      cur_deaths = excluded.cur_deaths,
      cur_flags = excluded.cur_flags,
      sessions = excluded.sessions,
      on_board = excluded.on_board,
      updated_at = now();
  end loop;

  if p_extracted is not null then
    insert into match_live_snapshots (match_id, scorekeeper_id, source, extracted)
    values (p_match_id, auth.uid(), 'LIVE', p_extracted);
  end if;

  update match_live_sessions set heartbeat_at = now() where match_id = p_match_id;
end;
$$;

-- Submits the final result of a tracked match and marks it COMPLETED.
-- p_stats is an array of { player_id, kills, deaths, flags } (final totals).
-- Every roster player gets a row (0 if they didn't play), matching what the
-- admin score entry saves. Team scores are the sum of each team's flags.
-- MVP is left empty for an admin to set later.
create function submit_live_result(p_match_id uuid, p_stats jsonb, p_extracted jsonb) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_match matches%rowtype;
  v_stat jsonb;
  v_player uuid;
  v_roster jsonb;
  v_sum_a integer := 0;
  v_sum_b integer := 0;
begin
  v_match := assert_can_track(p_match_id, true);

  -- Reject players who aren't on the roster before touching anything.
  for v_stat in select * from jsonb_array_elements(p_stats) loop
    v_player := (v_stat->>'player_id')::uuid;
    if not exists (select 1 from match_roster(p_match_id) r where r.player_id = v_player) then
      raise exception 'Player % is not on either team for this match.', v_player;
    end if;
    if coalesce((v_stat->>'kills')::integer, 0) < 0
       or coalesce((v_stat->>'deaths')::integer, 0) < 0
       or coalesce((v_stat->>'flags')::integer, 0) < 0 then
      raise exception 'Stats cannot be negative.';
    end if;
  end loop;

  -- Only this SCHEDULED match's rows are replaced (for exhibitions, these are
  -- the zero-stat placeholder rows). The roster is read before the delete
  -- because an exhibition's roster *is* those rows.
  select coalesce(jsonb_agg(jsonb_build_object('player_id', player_id, 'team_id', team_id)), '[]'::jsonb)
  into v_roster
  from match_roster(p_match_id);

  delete from match_player_stats where match_id = p_match_id;

  insert into match_player_stats (match_id, player_id, team_id, kills, deaths, flags)
  select
    p_match_id,
    r.player_id,
    r.team_id,
    coalesce((s.value->>'kills')::integer, 0),
    coalesce((s.value->>'deaths')::integer, 0),
    coalesce((s.value->>'flags')::integer, 0)
  from jsonb_to_recordset(v_roster) as r(player_id uuid, team_id uuid)
  left join lateral (
    select value from jsonb_array_elements(p_stats) where (value->>'player_id')::uuid = r.player_id limit 1
  ) s on true;

  select
    coalesce(sum(flags) filter (where team_id = v_match.team_a_id), 0),
    coalesce(sum(flags) filter (where team_id = v_match.team_b_id), 0)
  into v_sum_a, v_sum_b
  from match_player_stats
  where match_id = p_match_id;

  update matches set
    team_a_score = v_sum_a,
    team_b_score = v_sum_b,
    mvp_player_id = null,
    status = 'COMPLETED'
  where id = p_match_id;

  if p_extracted is not null then
    insert into match_live_snapshots (match_id, scorekeeper_id, source, extracted)
    values (p_match_id, auth.uid(), 'FINAL', p_extracted);
  end if;

  update match_live_sessions set status = 'SUBMITTED', submitted_at = now(), heartbeat_at = now()
  where match_id = p_match_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────────────

grant select on scorekeeper_profiles to authenticated;
grant select on match_live_sessions, match_live_stats to anon, authenticated;
grant select on match_live_snapshots to authenticated;

-- Internal helpers are not callable from the API.
revoke execute on function match_roster(uuid) from public, anon, authenticated;
revoke execute on function assert_can_track(uuid, boolean) from public, anon, authenticated;

grant execute on function is_scorekeeper() to anon, authenticated;
revoke execute on function claim_live_match(uuid) from public, anon;
revoke execute on function record_live_stats(uuid, jsonb, jsonb) from public, anon;
revoke execute on function submit_live_result(uuid, jsonb, jsonb) from public, anon;
grant execute on function claim_live_match(uuid) to authenticated;
grant execute on function record_live_stats(uuid, jsonb, jsonb) to authenticated;
grant execute on function submit_live_result(uuid, jsonb, jsonb) to authenticated;

grant all on scorekeeper_profiles, match_live_sessions, match_live_stats, match_live_snapshots to service_role;
grant execute on function match_roster(uuid), assert_can_track(uuid, boolean) to service_role;

-- Public match pages subscribe to live stats (and the session turning
-- SUBMITTED) over Realtime.
alter publication supabase_realtime add table match_live_stats;
alter publication supabase_realtime add table match_live_sessions;
