-- Fixes a correctness bug in save_owner_retentions: it picked the most
-- recent season with a non-null price, which could skip past an
-- intervening manually-assigned season (no price) and reach back to a
-- stale, older price — potentially retaining a player at a team they'd
-- since moved off of. Retention must anchor to the team's single most
-- recent season, period; if that season has no price, the player simply
-- isn't retainable this cycle.

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
