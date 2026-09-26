-- Rollback for migrations/0023_match_substitutes.sql. Run in the SQL Editor.
--
-- Restores match_roster to its 0021 definition and drops the substitutes
-- table and functions. Stats already saved for substitutes stay in
-- match_player_stats (they're ordinary rows with the team they played for);
-- remove them from the admin match page if needed.

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
  join match_player_stats s on s.match_id = m.id
  where m.id = p_match_id and m.season_id is null;
$$;

revoke execute on function match_roster(uuid) from public, anon, authenticated;

drop function if exists remove_match_substitute(uuid, uuid);
drop function if exists add_match_substitute(uuid, uuid, uuid);
drop table if exists match_substitutes;
