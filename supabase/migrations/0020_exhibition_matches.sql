-- Exhibition matches: matches that exist outside of any tournament season,
-- but whose stats can optionally be blended into player/team career stats.
--
-- ALTER TYPE ... ADD VALUE must not be combined in the same transaction as
-- statements that use the new value, so it is kept as the first statement
-- in this file and nothing else here references 'EXHIBITION' as data.
alter type match_type add value 'EXHIBITION';

-- ─────────────────────────────────────────────────────────────────────────
-- Exhibition matches have no season, so season_id becomes optional and the
-- team/season membership check is skipped for them.
-- ─────────────────────────────────────────────────────────────────────────

alter table matches alter column season_id drop not null;

create or replace function check_match_teams_in_season() returns trigger as $$
begin
  if new.season_id is null then
    return new;
  end if;

  if not exists (
    select 1 from season_teams where season_id = new.season_id and team_id = new.team_a_id
  ) or not exists (
    select 1 from season_teams where season_id = new.season_id and team_id = new.team_b_id
  ) then
    raise exception 'Both teams must belong to the season for this match.';
  end if;
  return new;
end;
$$ language plpgsql;

-- ─────────────────────────────────────────────────────────────────────────
-- Atomically create an exhibition match with its two team rosters seeded
-- as zero-stat match_player_stats rows (the same shape score entry already
-- expects for a regular match's roster).
-- ─────────────────────────────────────────────────────────────────────────

create function create_exhibition_match(
  p_team_a_id uuid,
  p_team_b_id uuid,
  p_scheduled_at timestamptz,
  p_team_a_players uuid[],
  p_team_b_players uuid[]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
begin
  if not is_admin() then
    raise exception 'Only administrators can create exhibition matches.';
  end if;

  insert into matches (season_id, team_a_id, team_b_id, scheduled_at, match_type, status)
  values (null, p_team_a_id, p_team_b_id, p_scheduled_at, 'EXHIBITION', 'SCHEDULED')
  returning id into v_match_id;

  insert into match_player_stats (match_id, player_id, team_id, kills, deaths, flags)
  select v_match_id, p, p_team_a_id, 0, 0, 0 from unnest(p_team_a_players) as p
  union all
  select v_match_id, p, p_team_b_id, 0, 0, 0 from unnest(p_team_b_players) as p;

  return v_match_id;
end;
$$;
