-- Team captain, tracked per season roster (a player's captaincy can change
-- between seasons, or if they switch teams). Purely additive: defaults to
-- false, nothing existing reads this column.

alter table season_rosters add column is_captain boolean not null default false;

-- At most one captain per team per season.
create unique index season_rosters_one_captain_per_team
  on season_rosters (season_id, team_id)
  where is_captain;
