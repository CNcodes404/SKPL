-- Rollback for migrations/0025_tournaments.sql. Run in the SQL Editor.
--
-- WARNING: deletes every Bluelock (ROUNDS) season with its rounds, matches and
-- stats, then drops tournaments. SKCTF seasons are kept as plain seasons.
-- match_roster, add_match_substitute and save_owner_retentions go back to
-- their 0023 / 0011 versions.

delete from seasons where tournament_id in (select id from tournaments where format = 'ROUNDS');

drop trigger if exists trg_match_round on matches;
drop function if exists check_match_round();
alter table matches drop column if exists round_id;

create or replace function match_roster(p_match_id uuid)
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
  join match_substitutes s on s.match_id = m.id
  where m.id = p_match_id and m.season_id is not null
    and not exists (
      select 1 from season_rosters r
      where r.season_id = m.season_id and r.player_id = s.player_id and r.team_id in (m.team_a_id, m.team_b_id)
    )
  union all
  select s.player_id, s.team_id
  from matches m
  join match_player_stats s on s.match_id = m.id
  where m.id = p_match_id and m.season_id is null;
$$;
revoke execute on function match_roster(uuid) from public, anon, authenticated;

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
  if exists (
    select 1 from season_rosters
    where season_id = v_match.season_id
      and player_id = p_player_id
      and team_id in (v_match.team_a_id, v_match.team_b_id)
  ) then
    raise exception 'This player is already on one of the teams in this match.';
  end if;

  insert into match_substitutes (match_id, player_id, team_id)
  values (p_match_id, p_player_id, p_team_id)
  on conflict (match_id, player_id) do update set team_id = excluded.team_id;
end;
$$;

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

drop function if exists match_team_players(uuid);
drop function if exists set_round_lineup(uuid, uuid, uuid[]);
drop function if exists update_season_round(uuid, text, uuid[]);
drop function if exists create_season_round(uuid, text, uuid[]);
drop function if exists create_rounds_season(uuid, text, integer, date, date, integer, uuid[], jsonb);
drop function if exists copy_lineup_into_round(uuid, uuid);

drop table if exists round_rosters;
drop table if exists round_teams;
drop table if exists season_rounds;
drop table if exists team_tournaments;
drop function if exists check_round_team_in_season();

alter table seasons drop column if exists players_per_team;
alter table seasons drop column if exists tournament_id;
drop function if exists default_tournament_id();
drop table if exists tournaments;
