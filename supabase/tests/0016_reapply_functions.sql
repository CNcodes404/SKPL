-- Standalone re-apply block for 0016_manual_auction_direct_assignment.sql's
-- start_manual_auction body + grant only, so it can be re-run on its own in
-- the SQL editor while iterating, without re-running the whole migration.
-- Not a migration — supabase/migrations/0016_manual_auction_direct_assignment.sql
-- remains the source of truth. Safe to run repeatedly: drops the prior
-- 14-arg signature first (a plain `create or replace` would instead create
-- a second, overloaded function, since the parameter list is changing).

drop function if exists start_manual_auction(
  uuid, numeric, integer, integer, text, player_draw_mode_type, numeric, numeric, numeric, integer, jsonb, numeric, jsonb, jsonb
);

create or replace function start_manual_auction(
  p_season_id uuid,
  p_purse_default numeric,
  p_min_squad_size integer,
  p_max_squad_size integer,
  p_order_strategy text,
  p_player_draw_mode player_draw_mode_type,
  p_initial_bid_increment numeric,
  p_increment_step_range numeric,
  p_increment_increase numeric,
  p_bid_timer_seconds integer,
  p_purse_overrides jsonb default '[]'::jsonb,
  p_base_price_default numeric default null,
  p_base_price_overrides jsonb default '{}'::jsonb,
  p_player_indices jsonb default '{}'::jsonb,
  p_direct_assignments jsonb default '[]'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auction season_auctions%rowtype;
  v_override jsonb;
  v_retention season_retentions%rowtype;
  v_assignment jsonb;
  v_assignment_team_id uuid;
  v_assignment_player_id uuid;
  v_assignment_price numeric;
  v_player_id uuid;
  v_aggregate_shortfall integer;
  v_pool_size integer;
begin
  if not is_admin() then
    raise exception 'Only administrators can start an auction.';
  end if;

  select * into v_auction from season_auctions where season_id = p_season_id for update;
  if not found then
    raise exception 'No auction has been configured for this season yet.';
  end if;
  if v_auction.status <> 'DRAFT' then
    raise exception 'This auction has already been started (status: %).', v_auction.status;
  end if;

  if p_min_squad_size > p_max_squad_size then
    raise exception 'Minimum squad size cannot exceed maximum squad size.';
  end if;
  if p_initial_bid_increment is null or p_initial_bid_increment < 0 then
    raise exception 'Initial bid increment must be zero or greater.';
  end if;
  if p_increment_step_range is null or p_increment_step_range <= 0 then
    raise exception 'Increment step range must be greater than zero.';
  end if;
  if p_increment_increase is null or p_increment_increase < 0 then
    raise exception 'Increment increase must be zero or greater.';
  end if;
  if p_bid_timer_seconds is null or p_bid_timer_seconds <= 0 then
    raise exception 'Bid timer must be greater than zero seconds.';
  end if;

  if exists (select 1 from season_teams where season_id = p_season_id and retention_submitted = false) then
    raise exception 'Not every team has submitted a retention decision yet.';
  end if;

  if exists (
    select 1 from season_retentions where season_id = p_season_id
    group by team_id having count(*) > v_auction.max_retentions_per_team
  ) then
    raise exception 'One or more teams have retained more players than the current cap allows; they must resubmit.';
  end if;

  if (select count(*) from jsonb_array_elements(coalesce(p_direct_assignments, '[]'::jsonb))) <>
     (select count(distinct value->>'team_id') from jsonb_array_elements(coalesce(p_direct_assignments, '[]'::jsonb))) then
    raise exception 'Only one direct player-owner assignment is allowed per team.';
  end if;

  if (select count(*) from jsonb_array_elements(coalesce(p_direct_assignments, '[]'::jsonb))) <>
     (select count(distinct value->>'player_id') from jsonb_array_elements(coalesce(p_direct_assignments, '[]'::jsonb))) then
    raise exception 'The same player cannot be directly assigned to more than one team.';
  end if;

  for v_assignment in select * from jsonb_array_elements(coalesce(p_direct_assignments, '[]'::jsonb)) loop
    v_assignment_player_id := (v_assignment->>'player_id')::uuid;
    v_assignment_price := (v_assignment->>'price')::numeric;

    if v_assignment_price is null or v_assignment_price < 0 then
      raise exception 'Direct assignment price must be zero or greater.';
    end if;

    if exists (select 1 from season_retentions where season_id = p_season_id and player_id = v_assignment_player_id) then
      raise exception 'A directly-assigned player cannot also be a retained player this season.';
    end if;
  end loop;

  update season_teams set purse_total = p_purse_default, purse_remaining = p_purse_default
    where season_id = p_season_id;

  for v_override in select * from jsonb_array_elements(coalesce(p_purse_overrides, '[]'::jsonb)) loop
    update season_teams
    set purse_total = (v_override->>'purse_total')::numeric,
        purse_remaining = (v_override->>'purse_total')::numeric
    where season_id = p_season_id and team_id = (v_override->>'team_id')::uuid;
  end loop;

  for v_retention in select * from season_retentions where season_id = p_season_id loop
    insert into season_rosters (season_id, team_id, player_id, price)
    values (p_season_id, v_retention.team_id, v_retention.player_id, v_retention.retention_price);

    update season_teams set purse_remaining = purse_remaining - v_retention.retention_price
      where season_id = p_season_id and team_id = v_retention.team_id;
  end loop;

  for v_assignment in select * from jsonb_array_elements(coalesce(p_direct_assignments, '[]'::jsonb)) loop
    v_assignment_team_id := (v_assignment->>'team_id')::uuid;
    v_assignment_player_id := (v_assignment->>'player_id')::uuid;
    v_assignment_price := (v_assignment->>'price')::numeric;

    insert into season_rosters (season_id, team_id, player_id, price)
    values (p_season_id, v_assignment_team_id, v_assignment_player_id, v_assignment_price);

    update season_teams set purse_remaining = purse_remaining - v_assignment_price
      where season_id = p_season_id and team_id = v_assignment_team_id;
  end loop;

  for v_player_id in
    select p.id from players p
    where p.is_active
      and not exists (select 1 from season_rosters sr where sr.season_id = p_season_id and sr.player_id = p.id)
  loop
    insert into season_auction_players (
      season_id, player_id, base_price, player_index, index_components, status, attempt_no
    )
    values (
      p_season_id,
      v_player_id,
      coalesce((p_base_price_overrides->>v_player_id::text)::numeric, p_base_price_default, 0),
      (p_player_indices->v_player_id::text->>'player_index')::numeric,
      p_player_indices->v_player_id::text->'index_components',
      'PENDING',
      1
    );
  end loop;

  if p_order_strategy = 'INDEX_DESC' then
    update season_auction_players sap set order_no = sub.rn
    from (
      select id, row_number() over (order by player_index desc nulls last) as rn
      from season_auction_players where season_id = p_season_id
    ) sub
    where sap.id = sub.id;
  elsif p_order_strategy = 'ROLE_GROUPED' then
    update season_auction_players sap set order_no = sub.rn
    from (
      select sap2.id, row_number() over (order by pl.role nulls last, random()) as rn
      from season_auction_players sap2
      join players pl on pl.id = sap2.player_id
      where sap2.season_id = p_season_id
    ) sub
    where sap.id = sub.id;
  else
    update season_auction_players sap set order_no = sub.rn
    from (
      select id, row_number() over (order by random()) as rn
      from season_auction_players where season_id = p_season_id
    ) sub
    where sap.id = sub.id;
  end if;

  select coalesce(sum(greatest(p_min_squad_size - cnt, 0)), 0) into v_aggregate_shortfall
  from (
    select st.team_id, count(sr.id) as cnt
    from season_teams st
    left join season_rosters sr on sr.season_id = p_season_id and sr.team_id = st.team_id
    where st.season_id = p_season_id
    group by st.team_id
  ) t;

  select count(*) into v_pool_size from season_auction_players where season_id = p_season_id;

  if v_aggregate_shortfall > v_pool_size then
    raise exception
      'Not enough players in the pool to guarantee every team reaches its minimum squad size (need %, have %).',
      v_aggregate_shortfall, v_pool_size;
  end if;

  update season_auctions set
    status = 'RUNNING',
    auction_mode = 'MANUAL',
    player_draw_mode = p_player_draw_mode,
    initial_bid_increment = p_initial_bid_increment,
    increment_step_range = p_increment_step_range,
    increment_increase = p_increment_increase,
    bid_timer_seconds = p_bid_timer_seconds,
    purse_default = p_purse_default,
    base_price_default = p_base_price_default,
    min_squad_size = p_min_squad_size,
    max_squad_size = p_max_squad_size,
    order_strategy = coalesce(p_order_strategy, 'RANDOM'),
    started_at = now(),
    started_by = auth.uid()
  where season_id = p_season_id;
end;
$$;

grant execute on function start_manual_auction(
  uuid, numeric, integer, integer, text, player_draw_mode_type, numeric, numeric, numeric, integer, jsonb, numeric, jsonb, jsonb, jsonb
) to authenticated;
