-- SKPL — Smash Karts Premier League
-- Initial schema: tables, constraints, RLS, and helper functions.

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────────────────

create type season_status as enum ('DRAFT', 'ACTIVE', 'COMPLETED');

create type match_type as enum (
  'REGULAR_SEASON',
  'QUALIFIER',
  'ELIMINATOR',
  'QUARTER_FINAL',
  'SEMI_FINAL',
  'FINAL',
  'THIRD_PLACE',
  'TIE_BREAKER',
  'CUSTOM'
);

create type match_status as enum ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- ─────────────────────────────────────────────────────────────────────────
-- updated_at helper
-- ─────────────────────────────────────────────────────────────────────────

create function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ─────────────────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────────────────

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text not null,
  logo_url text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  season_number integer not null,
  start_date date,
  end_date date,
  status season_status not null default 'DRAFT',

  winning_points integer not null default 3,
  close_loss_enabled boolean not null default false,
  close_loss_points integer not null default 1,
  close_loss_max_difference integer not null default 2,
  playoff_team_count integer not null default 4,
  matches_per_opponent integer not null default 1,

  mvp_player_id uuid references players(id) on delete set null,
  champion_team_id uuid references teams(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint season_number_positive check (season_number > 0),
  constraint winning_points_nonneg check (winning_points >= 0),
  constraint close_loss_points_nonneg check (close_loss_points >= 0),
  constraint close_loss_max_diff_nonneg check (close_loss_max_difference >= 0),
  constraint playoff_team_count_nonneg check (playoff_team_count >= 0),
  constraint matches_per_opponent_positive check (matches_per_opponent > 0)
);

create table season_teams (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  team_id uuid not null references teams(id) on delete restrict,
  unique (season_id, team_id)
);

create table season_rosters (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  team_id uuid not null references teams(id) on delete restrict,
  player_id uuid not null references players(id) on delete restrict,
  unique (season_id, player_id)
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  team_a_id uuid not null references teams(id) on delete restrict,
  team_b_id uuid not null references teams(id) on delete restrict,
  scheduled_at timestamptz,
  match_type match_type not null default 'REGULAR_SEASON',
  status match_status not null default 'SCHEDULED',
  team_a_score integer,
  team_b_score integer,
  mvp_player_id uuid references players(id) on delete set null,
  stage_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint different_teams check (team_a_id <> team_b_id),
  constraint scores_nonneg check (
    (team_a_score is null or team_a_score >= 0) and
    (team_b_score is null or team_b_score >= 0)
  )
);

create index idx_matches_season on matches(season_id);
create index idx_matches_teams on matches(team_a_id, team_b_id);

create table match_player_stats (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete restrict,
  team_id uuid not null references teams(id) on delete restrict,
  kills integer not null default 0,
  deaths integer not null default 0,
  flags integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (match_id, player_id),
  constraint stats_nonneg check (kills >= 0 and deaths >= 0 and flags >= 0)
);

create index idx_mps_match on match_player_stats(match_id);
create index idx_mps_player on match_player_stats(player_id);

create table admin_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  is_admin boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- updated_at triggers
-- ─────────────────────────────────────────────────────────────────────────

create trigger trg_teams_updated_at before update on teams
  for each row execute function set_updated_at();
create trigger trg_players_updated_at before update on players
  for each row execute function set_updated_at();
create trigger trg_seasons_updated_at before update on seasons
  for each row execute function set_updated_at();
create trigger trg_matches_updated_at before update on matches
  for each row execute function set_updated_at();
create trigger trg_mps_updated_at before update on match_player_stats
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- Champion derivation for FINAL matches
-- ─────────────────────────────────────────────────────────────────────────

create function handle_final_match() returns trigger as $$
declare
  winner uuid;
begin
  if tg_op = 'DELETE' then
    if old.match_type = 'FINAL' then
      update seasons set champion_team_id = null where id = old.season_id;
    end if;
    return old;
  end if;

  if new.match_type = 'FINAL' and new.status = 'COMPLETED' then
    if new.team_a_score is null or new.team_b_score is null or new.team_a_score = new.team_b_score then
      raise exception 'A completed Final must have a decisive, non-tied score.';
    end if;
    winner := case when new.team_a_score > new.team_b_score then new.team_a_id else new.team_b_id end;
    update seasons set champion_team_id = winner where id = new.season_id;
  elsif tg_op = 'UPDATE' and old.match_type = 'FINAL'
        and (new.match_type <> 'FINAL' or new.status <> 'COMPLETED') then
    update seasons set champion_team_id = null where id = new.season_id;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_final_match
  after insert or update or delete on matches
  for each row execute function handle_final_match();

-- ─────────────────────────────────────────────────────────────────────────
-- Roster integrity: a player can only belong to one team per season, and
-- must be selected for a team that is actually part of that season.
-- ─────────────────────────────────────────────────────────────────────────

create function check_roster_team_in_season() returns trigger as $$
begin
  if not exists (
    select 1 from season_teams
    where season_id = new.season_id and team_id = new.team_id
  ) then
    raise exception 'Team % is not part of season %.', new.team_id, new.season_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_roster_team_in_season
  before insert or update on season_rosters
  for each row execute function check_roster_team_in_season();

create function check_match_teams_in_season() returns trigger as $$
begin
  if not exists (
    select 1 from season_teams where season_id = new.season_id and team_id = new.team_a_id
  ) or not exists (
    select 1 from season_teams where season_id = new.season_id and team_id = new.team_b_id
  ) then
    raise exception 'Both teams must belong to season %.', new.season_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_match_teams_in_season
  before insert or update on matches
  for each row execute function check_match_teams_in_season();

-- ─────────────────────────────────────────────────────────────────────────
-- Auth helper
-- ─────────────────────────────────────────────────────────────────────────

create function is_admin() returns boolean as $$
  select exists (
    select 1 from admin_profiles
    where user_id = auth.uid() and is_admin = true
  );
$$ language sql stable security definer set search_path = public;

-- ─────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────

alter table teams enable row level security;
alter table players enable row level security;
alter table seasons enable row level security;
alter table season_teams enable row level security;
alter table season_rosters enable row level security;
alter table matches enable row level security;
alter table match_player_stats enable row level security;
alter table admin_profiles enable row level security;

-- Public read access
create policy "teams_public_read" on teams for select using (true);
create policy "players_public_read" on players for select using (true);
create policy "seasons_public_read" on seasons for select using (true);
create policy "season_teams_public_read" on season_teams for select using (true);
create policy "season_rosters_public_read" on season_rosters for select using (true);
create policy "matches_public_read" on matches for select using (true);
create policy "match_player_stats_public_read" on match_player_stats for select using (true);

-- Admin write access
create policy "teams_admin_write" on teams for insert with check (is_admin());
create policy "teams_admin_update" on teams for update using (is_admin()) with check (is_admin());
create policy "teams_admin_delete" on teams for delete using (is_admin());

create policy "players_admin_write" on players for insert with check (is_admin());
create policy "players_admin_update" on players for update using (is_admin()) with check (is_admin());
create policy "players_admin_delete" on players for delete using (is_admin());

create policy "seasons_admin_write" on seasons for insert with check (is_admin());
create policy "seasons_admin_update" on seasons for update using (is_admin()) with check (is_admin());
create policy "seasons_admin_delete" on seasons for delete using (is_admin());

create policy "season_teams_admin_write" on season_teams for insert with check (is_admin());
create policy "season_teams_admin_update" on season_teams for update using (is_admin()) with check (is_admin());
create policy "season_teams_admin_delete" on season_teams for delete using (is_admin());

create policy "season_rosters_admin_write" on season_rosters for insert with check (is_admin());
create policy "season_rosters_admin_update" on season_rosters for update using (is_admin()) with check (is_admin());
create policy "season_rosters_admin_delete" on season_rosters for delete using (is_admin());

create policy "matches_admin_write" on matches for insert with check (is_admin());
create policy "matches_admin_update" on matches for update using (is_admin()) with check (is_admin());
create policy "matches_admin_delete" on matches for delete using (is_admin());

create policy "mps_admin_write" on match_player_stats for insert with check (is_admin());
create policy "mps_admin_update" on match_player_stats for update using (is_admin()) with check (is_admin());
create policy "mps_admin_delete" on match_player_stats for delete using (is_admin());

-- admin_profiles: a user may read their own row; admins may read all.
create policy "admin_profiles_self_read" on admin_profiles
  for select using (auth.uid() = user_id or is_admin());

-- No public/admin INSERT/UPDATE/DELETE policies are defined for admin_profiles
-- on purpose — admins are provisioned manually via the SQL editor (see README).

-- ─────────────────────────────────────────────────────────────────────────
-- RPCs
-- ─────────────────────────────────────────────────────────────────────────

-- Atomically creates a season, its participating teams, rosters and the
-- generated regular-season schedule so the wizard never leaves partial data.
create function create_season_with_setup(
  p_name text,
  p_season_number integer,
  p_start_date date,
  p_end_date date,
  p_winning_points integer,
  p_close_loss_enabled boolean,
  p_close_loss_points integer,
  p_close_loss_max_difference integer,
  p_playoff_team_count integer,
  p_matches_per_opponent integer,
  p_team_ids uuid[],
  p_rosters jsonb,
  p_matches jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id uuid;
  v_team_id uuid;
  v_roster jsonb;
  v_match jsonb;
begin
  if not is_admin() then
    raise exception 'Only administrators can create seasons.';
  end if;

  insert into seasons (
    name, season_number, start_date, end_date,
    winning_points, close_loss_enabled, close_loss_points, close_loss_max_difference,
    playoff_team_count, matches_per_opponent, status
  ) values (
    p_name, p_season_number, p_start_date, p_end_date,
    p_winning_points, p_close_loss_enabled, p_close_loss_points, p_close_loss_max_difference,
    p_playoff_team_count, p_matches_per_opponent, 'ACTIVE'
  ) returning id into v_season_id;

  foreach v_team_id in array p_team_ids loop
    insert into season_teams (season_id, team_id) values (v_season_id, v_team_id);
  end loop;

  for v_roster in select * from jsonb_array_elements(p_rosters) loop
    insert into season_rosters (season_id, team_id, player_id)
    values (
      v_season_id,
      (v_roster->>'team_id')::uuid,
      (v_roster->>'player_id')::uuid
    );
  end loop;

  for v_match in select * from jsonb_array_elements(p_matches) loop
    insert into matches (season_id, team_a_id, team_b_id, scheduled_at, match_type, status)
    values (
      v_season_id,
      (v_match->>'team_a_id')::uuid,
      (v_match->>'team_b_id')::uuid,
      (v_match->>'scheduled_at')::timestamptz,
      'REGULAR_SEASON',
      'SCHEDULED'
    );
  end loop;

  return v_season_id;
end;
$$;

-- Deletes every match (and cascaded stats) for a season, leaving the
-- season, teams, players and rosters untouched.
create function delete_season_schedule(p_season_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Only administrators can delete a season schedule.';
  end if;

  delete from matches where season_id = p_season_id;
end;
$$;

-- Atomically saves a completed match's score, per-player stats and MVP.
-- Re-validates the flags-equal-score rule server-side as a safety net.
create function save_match_result(
  p_match_id uuid,
  p_team_a_score integer,
  p_team_b_score integer,
  p_mvp_player_id uuid,
  p_stats jsonb,
  p_status match_status
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match matches%rowtype;
  v_stat jsonb;
  v_sum_a integer := 0;
  v_sum_b integer := 0;
begin
  if not is_admin() then
    raise exception 'Only administrators can enter match results.';
  end if;

  select * into v_match from matches where id = p_match_id;
  if not found then
    raise exception 'Match not found.';
  end if;

  if p_status = 'COMPLETED' then
    for v_stat in select * from jsonb_array_elements(p_stats) loop
      if (v_stat->>'team_id')::uuid = v_match.team_a_id then
        v_sum_a := v_sum_a + (v_stat->>'flags')::integer;
      elsif (v_stat->>'team_id')::uuid = v_match.team_b_id then
        v_sum_b := v_sum_b + (v_stat->>'flags')::integer;
      end if;
    end loop;

    if v_sum_a <> p_team_a_score or v_sum_b <> p_team_b_score then
      raise exception 'Team score must equal the sum of that team''s player flags.';
    end if;
  end if;

  delete from match_player_stats where match_id = p_match_id;

  for v_stat in select * from jsonb_array_elements(p_stats) loop
    insert into match_player_stats (match_id, player_id, team_id, kills, deaths, flags)
    values (
      p_match_id,
      (v_stat->>'player_id')::uuid,
      (v_stat->>'team_id')::uuid,
      (v_stat->>'kills')::integer,
      (v_stat->>'deaths')::integer,
      (v_stat->>'flags')::integer
    );
  end loop;

  update matches set
    team_a_score = p_team_a_score,
    team_b_score = p_team_b_score,
    mvp_player_id = p_mvp_player_id,
    status = p_status
  where id = p_match_id;
end;
$$;
