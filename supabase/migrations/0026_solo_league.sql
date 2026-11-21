-- SKPL Solo League: free-for-all seasons where every player plays for themself.
--
-- Kept apart from tournaments/seasons/matches on purpose: those are built
-- around two teams per match, and solo numbers must never mix into team
-- standings or career stats.
--
-- New objects:
--   solo_seasons          one row per Solo League season, with its own points table
--   solo_season_players   who is registered for a season (max_players cap)
--   solo_rounds           Round 1, Round 2, … of a season (SCHEDULED / COMPLETED)
--   solo_round_results    one row per player per round: kills, deaths and the
--                         finishing position
--
-- Position is worked out from kills when results are saved and then stored, so
-- it never changes afterwards. Players with the same kills share a position and
-- the next player takes the next number (dense ranking: 1, 2, 2, 3).
-- Points are not stored: kills × points_per_kill + position_points[position].
--
-- Rollback: supabase/backups/0026_solo_league_rollback.sql.

create table solo_seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  season_number integer not null unique check (season_number > 0),
  status text not null default 'ACTIVE' check (status in ('DRAFT', 'ACTIVE', 'COMPLETED')),
  start_date date,
  max_players integer not null default 12 check (max_players >= 2),
  points_per_kill integer not null default 1 check (points_per_kill >= 0),
  -- position_points[1] is for 1st place; positions past the end score 0
  position_points integer[] not null default '{15,12,10,8,7,6,5,4,3,2,1,0}',
  created_at timestamptz not null default now()
);

create table solo_season_players (
  season_id uuid not null references solo_seasons(id) on delete cascade,
  player_id uuid not null references players(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (season_id, player_id)
);

create index idx_solo_season_players_player on solo_season_players(player_id);

create table solo_rounds (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references solo_seasons(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  name text not null,
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED', 'COMPLETED')),
  played_at timestamptz,
  created_at timestamptz not null default now(),
  unique (season_id, round_number)
);

create table solo_round_results (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references solo_rounds(id) on delete cascade,
  player_id uuid not null references players(id) on delete restrict,
  position integer not null check (position > 0),
  kills integer not null default 0 check (kills >= 0),
  deaths integer not null default 0 check (deaths >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, player_id)
);

create index idx_solo_round_results_player on solo_round_results(player_id);

create trigger trg_solo_round_results_updated_at
  before update on solo_round_results
  for each row execute function set_updated_at();

-- A result's player must be registered for the round's season.
create function check_solo_result_player() returns trigger as $$
begin
  if not exists (
    select 1 from solo_rounds r
    join solo_season_players p on p.season_id = r.season_id and p.player_id = new.player_id
    where r.id = new.round_id
  ) then
    raise exception 'That player is not registered for this Solo League season.';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_solo_result_player
  before insert or update on solo_round_results
  for each row execute function check_solo_result_player();

-- ─────────────────────────────────────────────────────────────────────────
-- RLS and grants: everyone reads, admins write
-- ─────────────────────────────────────────────────────────────────────────

alter table solo_seasons enable row level security;
alter table solo_season_players enable row level security;
alter table solo_rounds enable row level security;
alter table solo_round_results enable row level security;

create policy "solo_seasons_public_read" on solo_seasons for select using (true);
create policy "solo_season_players_public_read" on solo_season_players for select using (true);
create policy "solo_rounds_public_read" on solo_rounds for select using (true);
create policy "solo_round_results_public_read" on solo_round_results for select using (true);

create policy "solo_seasons_admin_update" on solo_seasons for update using (is_admin()) with check (is_admin());
create policy "solo_seasons_admin_delete" on solo_seasons for delete using (is_admin());

create policy "solo_rounds_admin_insert" on solo_rounds for insert with check (is_admin());
create policy "solo_rounds_admin_update" on solo_rounds for update using (is_admin()) with check (is_admin());
create policy "solo_rounds_admin_delete" on solo_rounds for delete using (is_admin());

grant select on solo_seasons, solo_season_players, solo_rounds, solo_round_results to anon, authenticated;
grant update, delete on solo_seasons to authenticated;
grant insert, update, delete on solo_rounds to authenticated;
grant all on solo_seasons, solo_season_players, solo_rounds, solo_round_results to service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- RPCs (admin only)
-- ─────────────────────────────────────────────────────────────────────────

-- Creates a season with its players and Round 1 … Round p_rounds.
create function create_solo_season(
  p_name text,
  p_season_number integer,
  p_start_date date,
  p_rounds integer,
  p_max_players integer,
  p_points_per_kill integer,
  p_position_points integer[],
  p_player_ids uuid[]
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_season_id uuid;
  v_count integer := coalesce(array_length(p_player_ids, 1), 0);
begin
  if not is_admin() then
    raise exception 'Only administrators can create Solo League seasons.';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception 'Enter a season name.';
  end if;
  if p_rounds is null or p_rounds < 1 or p_rounds > 20 then
    raise exception 'Rounds must be between 1 and 20.';
  end if;
  if p_max_players is null or p_max_players < 2 then
    raise exception 'Max players must be at least 2.';
  end if;
  if v_count > p_max_players then
    raise exception 'This season allows at most % players.', p_max_players;
  end if;
  if exists (select 1 from solo_seasons where season_number = p_season_number) then
    raise exception 'Solo League season % already exists.', p_season_number;
  end if;
  if exists (select 1 from unnest(coalesce(p_position_points, '{}')) v where v < 0) then
    raise exception 'Position points cannot be negative.';
  end if;

  insert into solo_seasons (name, season_number, start_date, max_players, points_per_kill, position_points, status)
  values (
    trim(p_name), p_season_number, p_start_date, p_max_players,
    greatest(coalesce(p_points_per_kill, 1), 0), coalesce(p_position_points, '{}'), 'ACTIVE'
  )
  returning id into v_season_id;

  insert into solo_season_players (season_id, player_id)
  select distinct v_season_id, p from unnest(coalesce(p_player_ids, '{}')) p;

  insert into solo_rounds (season_id, round_number, name)
  select v_season_id, n, 'Round ' || n from generate_series(1, p_rounds) n;

  return v_season_id;
end;
$$;

-- Replaces a season's players. A player with saved results can't be removed.
create function set_solo_season_players(p_season_id uuid, p_player_ids uuid[]) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_max integer;
  v_ids uuid[] := array(select distinct p from unnest(coalesce(p_player_ids, '{}')) p);
begin
  if not is_admin() then
    raise exception 'Only administrators can edit Solo League players.';
  end if;
  select max_players into v_max from solo_seasons where id = p_season_id;
  if not found then
    raise exception 'Solo League season not found.';
  end if;
  if coalesce(array_length(v_ids, 1), 0) > v_max then
    raise exception 'This season allows at most % players.', v_max;
  end if;
  if exists (
    select 1 from solo_round_results res
    join solo_rounds r on r.id = res.round_id
    where r.season_id = p_season_id and not (res.player_id = any(v_ids))
  ) then
    raise exception 'A player with saved round results can''t be removed. Remove them from those rounds first.';
  end if;

  delete from solo_season_players where season_id = p_season_id and not (player_id = any(v_ids));
  insert into solo_season_players (season_id, player_id)
  select p_season_id, p from unnest(v_ids) p
  on conflict do nothing;
end;
$$;

-- Saves one round: p_results is [{ player_id, kills, deaths }] for every player
-- who played (anyone left out did not play). Positions are worked out from
-- kills with dense ranking and stored. p_status is SCHEDULED or COMPLETED.
create function save_solo_round_results(p_round_id uuid, p_results jsonb, p_status text) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_round solo_rounds%rowtype;
begin
  if not is_admin() then
    raise exception 'Only administrators can save Solo League results.';
  end if;
  select * into v_round from solo_rounds where id = p_round_id;
  if not found then
    raise exception 'Round not found.';
  end if;
  if p_status not in ('SCHEDULED', 'COMPLETED') then
    raise exception 'Status must be SCHEDULED or COMPLETED.';
  end if;
  if jsonb_typeof(coalesce(p_results, '[]'::jsonb)) <> 'array' then
    raise exception 'Results must be a list.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) r
    group by r->>'player_id' having count(*) > 1
  ) then
    raise exception 'A player is listed more than once.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) r
    where coalesce((r->>'kills')::integer, 0) < 0 or coalesce((r->>'deaths')::integer, 0) < 0
  ) then
    raise exception 'Kills and deaths cannot be negative.';
  end if;
  if p_status = 'COMPLETED' and jsonb_array_length(coalesce(p_results, '[]'::jsonb)) = 0 then
    raise exception 'Enter at least one player''s result before completing the round.';
  end if;

  delete from solo_round_results where round_id = p_round_id;

  insert into solo_round_results (round_id, player_id, kills, deaths, position)
  select p_round_id, x.player_id, x.kills, x.deaths, dense_rank() over (order by x.kills desc)
  from (
    select (r->>'player_id')::uuid as player_id,
           coalesce((r->>'kills')::integer, 0) as kills,
           coalesce((r->>'deaths')::integer, 0) as deaths
    from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) r
  ) x;

  update solo_rounds
  set status = p_status,
      played_at = case when p_status = 'COMPLETED' then coalesce(played_at, now()) else played_at end
  where id = p_round_id;
end;
$$;

revoke execute on function create_solo_season(text, integer, date, integer, integer, integer, integer[], uuid[]) from public, anon;
revoke execute on function set_solo_season_players(uuid, uuid[]) from public, anon;
revoke execute on function save_solo_round_results(uuid, jsonb, text) from public, anon;
grant execute on function create_solo_season(text, integer, date, integer, integer, integer, integer[], uuid[]) to authenticated, service_role;
grant execute on function set_solo_season_players(uuid, uuid[]) to authenticated, service_role;
grant execute on function save_solo_round_results(uuid, jsonb, text) to authenticated, service_role;
