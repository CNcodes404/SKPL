-- Tournaments, and round-based seasons for the Smash Karts Bluelock League.
--
-- Until now a season was the top-level competition. Seasons now belong to a
-- tournament:
--   SKCTF League                  format LEAGUE — the existing round-robin +
--                                 playoffs seasons, unchanged
--   Smash Karts Bluelock League   format ROUNDS — admin-built rounds; teams are
--                                 eliminated round by round until the Final
--
-- New objects:
--   tournaments        the two tournaments above
--   team_tournaments   which tournaments a team is eligible for
--   season_rounds      Round 1, Round 2, … of a ROUNDS season
--   round_teams        teams still alive in a round (left out = eliminated)
--   round_rosters      each team's lineup for a round (one team per player)
--   seasons.tournament_id, seasons.players_per_team, matches.round_id
--
-- Every existing season and team is put in SKCTF League. Seasons created
-- without a tournament (the existing create_season_with_setup) default to it.
--
-- Replaced functions (same signatures): match_roster, add_match_substitute
-- (round matches use the round lineup instead of the season roster) and
-- save_owner_retentions (anchors to the previous season of the same
-- tournament only).
-- Rollback: supabase/backups/0025_tournaments_rollback.sql.

-- ─────────────────────────────────────────────────────────────────────────
-- Tournaments
-- ─────────────────────────────────────────────────────────────────────────

create table tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text not null,
  slug text not null unique,
  format text not null check (format in ('LEAGUE', 'ROUNDS')),
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into tournaments (name, short_name, slug, format, description, sort_order) values
  ('SKCTF League', 'SKCTF', 'skctf', 'LEAGUE', 'Round-robin league with playoffs.', 1),
  ('Smash Karts Bluelock League', 'Bluelock', 'bluelock', 'ROUNDS', 'Round-by-round knockout. Teams are eliminated until two meet in the Final.', 2);

create function default_tournament_id() returns uuid as $$
  select id from tournaments where slug = 'skctf';
$$ language sql stable;

alter table seasons
  add column tournament_id uuid references tournaments(id) on delete restrict default default_tournament_id(),
  add column players_per_team integer check (players_per_team is null or players_per_team > 0);

update seasons set tournament_id = default_tournament_id() where tournament_id is null;
alter table seasons alter column tournament_id set not null;

create index idx_seasons_tournament on seasons(tournament_id);

create table team_tournaments (
  team_id uuid not null references teams(id) on delete cascade,
  tournament_id uuid not null references tournaments(id) on delete cascade,
  primary key (team_id, tournament_id)
);

insert into team_tournaments (team_id, tournament_id)
select id, default_tournament_id() from teams;

-- ─────────────────────────────────────────────────────────────────────────
-- Rounds
-- ─────────────────────────────────────────────────────────────────────────

create table season_rounds (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  name text not null,
  created_at timestamptz not null default now(),
  unique (season_id, round_number)
);

create table round_teams (
  round_id uuid not null references season_rounds(id) on delete cascade,
  team_id uuid not null references teams(id) on delete restrict,
  primary key (round_id, team_id)
);

create table round_rosters (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references season_rounds(id) on delete cascade,
  team_id uuid not null,
  player_id uuid not null references players(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (round_id, player_id),
  foreign key (round_id, team_id) references round_teams(round_id, team_id) on delete cascade
);

create index idx_round_rosters_round on round_rosters(round_id);

alter table matches add column round_id uuid references season_rounds(id) on delete cascade;
create index idx_matches_round on matches(round_id);

-- A round's teams must be part of its season.
create function check_round_team_in_season() returns trigger as $$
begin
  if not exists (
    select 1 from season_rounds r
    join season_teams st on st.season_id = r.season_id and st.team_id = new.team_id
    where r.id = new.round_id
  ) then
    raise exception 'That team is not part of this season.';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_round_team_in_season
  before insert or update on round_teams
  for each row execute function check_round_team_in_season();

-- A round match must belong to the round's season, and both teams must still
-- be in that round.
create function check_match_round() returns trigger as $$
begin
  if new.round_id is null then
    return new;
  end if;
  if not exists (select 1 from season_rounds where id = new.round_id and season_id = new.season_id) then
    raise exception 'The round does not belong to this match''s season.';
  end if;
  if not exists (select 1 from round_teams where round_id = new.round_id and team_id = new.team_a_id)
     or not exists (select 1 from round_teams where round_id = new.round_id and team_id = new.team_b_id) then
    raise exception 'Both teams must be in this round.';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_match_round
  before insert or update on matches
  for each row execute function check_match_round();

-- ─────────────────────────────────────────────────────────────────────────
-- RLS and grants
-- ─────────────────────────────────────────────────────────────────────────

alter table tournaments enable row level security;
alter table team_tournaments enable row level security;
alter table season_rounds enable row level security;
alter table round_teams enable row level security;
alter table round_rosters enable row level security;

create policy "tournaments_public_read" on tournaments for select using (true);
create policy "team_tournaments_public_read" on team_tournaments for select using (true);
create policy "season_rounds_public_read" on season_rounds for select using (true);
create policy "round_teams_public_read" on round_teams for select using (true);
create policy "round_rosters_public_read" on round_rosters for select using (true);

create policy "tournaments_admin_update" on tournaments for update using (is_admin()) with check (is_admin());

create policy "team_tournaments_admin_write" on team_tournaments for insert with check (is_admin());
create policy "team_tournaments_admin_delete" on team_tournaments for delete using (is_admin());

create policy "season_rounds_admin_write" on season_rounds for insert with check (is_admin());
create policy "season_rounds_admin_update" on season_rounds for update using (is_admin()) with check (is_admin());
create policy "season_rounds_admin_delete" on season_rounds for delete using (is_admin());

create policy "round_teams_admin_write" on round_teams for insert with check (is_admin());
create policy "round_teams_admin_delete" on round_teams for delete using (is_admin());

create policy "round_rosters_admin_write" on round_rosters for insert with check (is_admin());
create policy "round_rosters_admin_delete" on round_rosters for delete using (is_admin());

grant select on tournaments, team_tournaments, season_rounds, round_teams, round_rosters to anon, authenticated;
grant update on tournaments to authenticated;
grant insert, delete on team_tournaments, round_teams, round_rosters to authenticated;
grant insert, update, delete on season_rounds to authenticated;
grant all on tournaments, team_tournaments, season_rounds, round_teams, round_rosters to service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Round RPCs (admin only)
-- ─────────────────────────────────────────────────────────────────────────

-- Copies a team's lineup into a round: from the latest earlier round the team
-- played in, else from the season roster. Players already on another team in
-- the target round are skipped.
create function copy_lineup_into_round(p_round_id uuid, p_team_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_round season_rounds%rowtype;
  v_source uuid;
begin
  select * into v_round from season_rounds where id = p_round_id;

  select r.id into v_source
  from season_rounds r
  join round_teams rt on rt.round_id = r.id and rt.team_id = p_team_id
  where r.season_id = v_round.season_id and r.round_number < v_round.round_number
  order by r.round_number desc
  limit 1;

  if v_source is not null then
    insert into round_rosters (round_id, team_id, player_id)
    select p_round_id, p_team_id, player_id from round_rosters where round_id = v_source and team_id = p_team_id
    on conflict (round_id, player_id) do nothing;
  else
    insert into round_rosters (round_id, team_id, player_id)
    select p_round_id, p_team_id, player_id from season_rosters
    where season_id = v_round.season_id and team_id = p_team_id
    on conflict (round_id, player_id) do nothing;
  end if;
end;
$$;

-- Creates a ROUNDS-format season with its teams and default lineups, plus
-- Round 1 holding every team with those lineups.
create function create_rounds_season(
  p_tournament_id uuid,
  p_name text,
  p_season_number integer,
  p_start_date date,
  p_end_date date,
  p_players_per_team integer,
  p_team_ids uuid[],
  p_rosters jsonb
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_season_id uuid;
  v_round_id uuid;
  v_team_id uuid;
  v_count integer;
begin
  if not is_admin() then
    raise exception 'Only administrators can create seasons.';
  end if;
  if not exists (select 1 from tournaments where id = p_tournament_id and format = 'ROUNDS') then
    raise exception 'This tournament does not use rounds.';
  end if;
  if coalesce(array_length(p_team_ids, 1), 0) < 2 then
    raise exception 'Select at least two teams.';
  end if;
  if p_players_per_team is null or p_players_per_team < 1 then
    raise exception 'Players per team must be at least 1.';
  end if;

  foreach v_team_id in array p_team_ids loop
    select count(*) into v_count from jsonb_array_elements(p_rosters) r where (r->>'team_id')::uuid = v_team_id;
    if v_count <> p_players_per_team then
      raise exception 'Every team needs exactly % players.', p_players_per_team;
    end if;
  end loop;

  insert into seasons (tournament_id, name, season_number, start_date, end_date, players_per_team, status)
  values (p_tournament_id, p_name, p_season_number, p_start_date, p_end_date, p_players_per_team, 'ACTIVE')
  returning id into v_season_id;

  insert into season_teams (season_id, team_id) select v_season_id, t from unnest(p_team_ids) t;

  insert into season_rosters (season_id, team_id, player_id)
  select v_season_id, (r->>'team_id')::uuid, (r->>'player_id')::uuid from jsonb_array_elements(p_rosters) r;

  insert into season_rounds (season_id, round_number, name) values (v_season_id, 1, 'Round 1')
  returning id into v_round_id;

  insert into round_teams (round_id, team_id) select v_round_id, t from unnest(p_team_ids) t;

  insert into round_rosters (round_id, team_id, player_id)
  select v_round_id, team_id, player_id from season_rosters where season_id = v_season_id;

  return v_season_id;
end;
$$;

-- Adds the next round to a ROUNDS season with the teams going through. Each
-- team's lineup starts as its lineup from the previous round.
create function create_season_round(p_season_id uuid, p_name text, p_team_ids uuid[]) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_round_id uuid;
  v_number integer;
  v_team_id uuid;
begin
  if not is_admin() then
    raise exception 'Only administrators can create rounds.';
  end if;
  if not exists (
    select 1 from seasons s join tournaments t on t.id = s.tournament_id
    where s.id = p_season_id and t.format = 'ROUNDS'
  ) then
    raise exception 'This season does not use rounds.';
  end if;
  if coalesce(array_length(p_team_ids, 1), 0) < 2 then
    raise exception 'A round needs at least two teams.';
  end if;

  select coalesce(max(round_number), 0) + 1 into v_number from season_rounds where season_id = p_season_id;

  insert into season_rounds (season_id, round_number, name)
  values (p_season_id, v_number, coalesce(nullif(trim(p_name), ''), 'Round ' || v_number))
  returning id into v_round_id;

  foreach v_team_id in array p_team_ids loop
    insert into round_teams (round_id, team_id) values (v_round_id, v_team_id);
    perform copy_lineup_into_round(v_round_id, v_team_id);
  end loop;

  return v_round_id;
end;
$$;

-- Renames a round and changes which teams are in it. A team that already has
-- a match in this round can't be removed. Added teams get their previous
-- lineup.
create function update_season_round(p_round_id uuid, p_name text, p_team_ids uuid[]) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_team_id uuid;
begin
  if not is_admin() then
    raise exception 'Only administrators can edit rounds.';
  end if;
  if not exists (select 1 from season_rounds where id = p_round_id) then
    raise exception 'Round not found.';
  end if;
  if coalesce(array_length(p_team_ids, 1), 0) < 2 then
    raise exception 'A round needs at least two teams.';
  end if;

  if exists (
    select 1 from matches m
    where m.round_id = p_round_id
      and (not (m.team_a_id = any(p_team_ids)) or not (m.team_b_id = any(p_team_ids)))
  ) then
    raise exception 'A team with a match in this round can''t be removed. Delete its matches first.';
  end if;

  if nullif(trim(p_name), '') is not null then
    update season_rounds set name = trim(p_name) where id = p_round_id;
  end if;

  delete from round_teams where round_id = p_round_id and not (team_id = any(p_team_ids));

  foreach v_team_id in array p_team_ids loop
    if not exists (select 1 from round_teams where round_id = p_round_id and team_id = v_team_id) then
      insert into round_teams (round_id, team_id) values (p_round_id, v_team_id);
      perform copy_lineup_into_round(p_round_id, v_team_id);
    end if;
  end loop;
end;
$$;

-- Replaces one team's lineup for a round. A player already on another team in
-- this round is moved here. Saved stats of completed matches are untouched.
create function set_round_lineup(p_round_id uuid, p_team_id uuid, p_player_ids uuid[]) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Only administrators can edit lineups.';
  end if;
  if not exists (select 1 from round_teams where round_id = p_round_id and team_id = p_team_id) then
    raise exception 'That team is not in this round.';
  end if;

  delete from round_rosters
  where round_id = p_round_id
    and (team_id = p_team_id or player_id = any(coalesce(p_player_ids, '{}')));

  insert into round_rosters (round_id, team_id, player_id)
  select distinct p_round_id, p_team_id, p from unnest(coalesce(p_player_ids, '{}')) p;
end;
$$;

revoke execute on function copy_lineup_into_round(uuid, uuid) from public, anon, authenticated;
revoke execute on function create_rounds_season(uuid, text, integer, date, date, integer, uuid[], jsonb) from public, anon;
revoke execute on function create_season_round(uuid, text, uuid[]) from public, anon;
revoke execute on function update_season_round(uuid, text, uuid[]) from public, anon;
revoke execute on function set_round_lineup(uuid, uuid, uuid[]) from public, anon;
grant execute on function create_rounds_season(uuid, text, integer, date, date, integer, uuid[], jsonb) to authenticated;
grant execute on function create_season_round(uuid, text, uuid[]) to authenticated;
grant execute on function update_season_round(uuid, text, uuid[]) to authenticated;
grant execute on function set_round_lineup(uuid, uuid, uuid[]) to authenticated;
grant execute on function default_tournament_id() to anon, authenticated, service_role;
grant execute on function copy_lineup_into_round(uuid, uuid), create_rounds_season(uuid, text, integer, date, date, integer, uuid[], jsonb),
  create_season_round(uuid, text, uuid[]), update_season_round(uuid, text, uuid[]), set_round_lineup(uuid, uuid, uuid[])
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Match players: round matches use the round lineup
-- ─────────────────────────────────────────────────────────────────────────

-- The players on one team for a season match: the round lineup for a round
-- match, otherwise the season roster.
create function match_team_players(p_match_id uuid)
returns table (player_id uuid, team_id uuid)
language sql stable security definer set search_path = public
as $$
  select r.player_id, r.team_id
  from matches m
  join season_rosters r on r.season_id = m.season_id and r.team_id in (m.team_a_id, m.team_b_id)
  where m.id = p_match_id and m.season_id is not null and m.round_id is null
  union all
  select r.player_id, r.team_id
  from matches m
  join round_rosters r on r.round_id = m.round_id and r.team_id in (m.team_a_id, m.team_b_id)
  where m.id = p_match_id and m.round_id is not null;
$$;

create or replace function match_roster(p_match_id uuid)
returns table (player_id uuid, team_id uuid)
language sql stable security definer set search_path = public
as $$
  select t.player_id, t.team_id from match_team_players(p_match_id) t
  union all
  select s.player_id, s.team_id
  from matches m
  join match_substitutes s on s.match_id = m.id
  where m.id = p_match_id and m.season_id is not null
    -- a player who has since joined either lineup is listed once, via the lineup
    and not exists (select 1 from match_team_players(p_match_id) t where t.player_id = s.player_id)
  union all
  select s.player_id, s.team_id
  from matches m
  join match_player_stats s on s.match_id = m.id
  where m.id = p_match_id and m.season_id is null;
$$;

create or replace function add_match_substitute(p_match_id uuid, p_player_id uuid, p_team_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_match matches%rowtype;
begin
  select * into v_match from matches where id = p_match_id;
  if not found then
    raise exception 'Match not found.';
  end if;
  if not (is_admin() or (is_scorekeeper() and v_match.status = 'SCHEDULED')) then
    raise exception 'Only admins, or scorekeepers before the match is completed, can add substitutes.';
  end if;
  if v_match.season_id is null then
    raise exception 'Substitutes are only for season matches. For exhibitions, add the player to the match directly.';
  end if;
  if p_team_id not in (v_match.team_a_id, v_match.team_b_id) then
    raise exception 'The substitute must play for one of the two teams in this match.';
  end if;
  if not exists (select 1 from players where id = p_player_id and is_active) then
    raise exception 'Only active players can be substitutes.';
  end if;
  if exists (select 1 from match_team_players(p_match_id) t where t.player_id = p_player_id) then
    raise exception 'This player is already on one of the teams in this match.';
  end if;

  insert into match_substitutes (match_id, player_id, team_id)
  values (p_match_id, p_player_id, p_team_id)
  on conflict (match_id, player_id) do update set team_id = excluded.team_id;
end;
$$;

revoke execute on function match_team_players(uuid) from public, anon, authenticated;
revoke execute on function match_roster(uuid) from public, anon, authenticated;
grant execute on function match_team_players(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Retentions anchor to the same tournament's seasons only
-- ─────────────────────────────────────────────────────────────────────────

create or replace function save_owner_retentions(
  p_season_id uuid,
  p_team_id uuid,
  p_player_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap integer;
  v_pct numeric;
  v_player_id uuid;
  v_last_season_number integer;
  v_last_price numeric;
begin
  if not (is_admin() or is_owner_of_team(p_team_id)) then
    raise exception 'Only that team''s owner or an administrator can set retentions.';
  end if;

  select max_retentions_per_team, retention_price_increase_pct into v_cap, v_pct
    from season_auctions where season_id = p_season_id;
  if not found then
    raise exception 'This season does not have an auction configured.';
  end if;

  if array_length(p_player_ids, 1) is not null and array_length(p_player_ids, 1) > v_cap then
    raise exception 'Cannot retain more than % player(s).', v_cap;
  end if;

  delete from season_retentions where season_id = p_season_id and team_id = p_team_id;

  if p_player_ids is not null then
    foreach v_player_id in array p_player_ids loop
      select s.season_number, sr.price into v_last_season_number, v_last_price
      from season_rosters sr
      join seasons s on s.id = sr.season_id
      where sr.team_id = p_team_id and sr.player_id = v_player_id and sr.season_id <> p_season_id
        and s.tournament_id = (select tournament_id from seasons where id = p_season_id)
      order by s.season_number desc
      limit 1;

      if v_last_season_number is null or v_last_price is null then
        raise exception 'Player % was not on a priced roster for this team in their most recent season and cannot be retained.', v_player_id;
      end if;

      insert into season_retentions (season_id, team_id, player_id, retention_price)
      values (p_season_id, p_team_id, v_player_id, round(v_last_price * (1 + v_pct / 100.0), 2));
    end loop;
  end if;

  update season_teams set retention_submitted = true
  where season_id = p_season_id and team_id = p_team_id;
end;
$$;
