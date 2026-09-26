-- Substitute players for a single season match.
--
-- Any active player can be added to one side of a season match as an extra
-- player (they don't replace anyone; roster players keep their rows). Their
-- stats are saved in match_player_stats with team_id = the team they played
-- for, so they count towards that team's match totals and the player's own
-- career. Exhibitions don't need this: their players are already chosen per
-- match (create_exhibition_match).
--
-- Additive only. The one replaced function, match_roster (0021), keeps its
-- signature and simply also returns this match's substitutes, so live
-- tracking and scorekeeper submissions include them.
-- Rollback: supabase/backups/0023_match_substitutes_rollback.sql.

create table match_substitutes (
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete restrict,
  team_id uuid not null references teams(id) on delete restrict,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (match_id, player_id)
);

create index idx_match_substitutes_match on match_substitutes(match_id);

alter table match_substitutes enable row level security;
create policy "match_substitutes_public_read" on match_substitutes for select using (true);
-- No write policies: writes go through the two functions below.

grant select on match_substitutes to anon, authenticated;
grant all on match_substitutes to service_role;

-- Adds (or moves to the other side) a substitute. Admins can do this for
-- any season match; scorekeepers only while the match is still SCHEDULED.
create function add_match_substitute(p_match_id uuid, p_player_id uuid, p_team_id uuid) returns void
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

-- Removes a substitute. Their live-tracking row goes too; their saved match
-- stats (if the match was completed) are removed the next time the match is
-- saved from the admin page.
create function remove_match_substitute(p_match_id uuid, p_player_id uuid) returns void
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
    raise exception 'Only admins, or scorekeepers before the match is completed, can remove substitutes.';
  end if;

  delete from match_substitutes where match_id = p_match_id and player_id = p_player_id;
  delete from match_live_stats where match_id = p_match_id and player_id = p_player_id;
end;
$$;

revoke execute on function add_match_substitute(uuid, uuid, uuid) from public, anon;
revoke execute on function remove_match_substitute(uuid, uuid) from public, anon;
grant execute on function add_match_substitute(uuid, uuid, uuid) to authenticated;
grant execute on function remove_match_substitute(uuid, uuid) to authenticated;

-- Live tracking: a match's players are its season rosters plus its substitutes
-- (exhibitions are unchanged — their players are the seeded stats rows).
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
    -- a player who has since joined either roster is listed once, via the roster
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
