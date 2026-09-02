-- ─────────────────────────────────────────────────────────────────────────
-- 0018: Don't force retention submissions when the season allows none.
--
-- start_auction/start_manual_auction both required every team to have
-- retention_submitted = true before starting, even when the admin set
-- max_retentions_per_team = 0 for the season — in which case there is
-- nothing meaningful for a team to submit, and the requirement was pure
-- friction. Both checks now skip entirely when the cap is 0.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function start_auction(
  p_season_id uuid,
  p_purse_default numeric,
  p_base_price_default numeric,
  p_min_squad_size integer,
  p_max_squad_size integer,
  p_order_strategy text,
  p_purse_overrides jsonb,
  p_base_price_overrides jsonb,
  p_player_indices jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auction season_auctions%rowtype;
  v_override jsonb;
  v_retention season_retentions%rowtype;
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

  if v_auction.max_retentions_per_team > 0
     and exists (select 1 from season_teams where season_id = p_season_id and retention_submitted = false) then
    raise exception 'Not every team has submitted a retention decision yet.';
  end if;

  if exists (
    select 1 from season_retentions where season_id = p_season_id
    group by team_id having count(*) > v_auction.max_retentions_per_team
  ) then
    raise exception 'One or more teams have retained more players than the current cap allows; they must resubmit.';
  end if;

  -- Purses: default for every team, then overrides
  update season_teams set purse_total = p_purse_default, purse_remaining = p_purse_default
    where season_id = p_season_id;

  for v_override in select * from jsonb_array_elements(coalesce(p_purse_overrides, '[]'::jsonb)) loop
    update season_teams
    set purse_total = (v_override->>'purse_total')::numeric,
        purse_remaining = (v_override->>'purse_total')::numeric
    where season_id = p_season_id and team_id = (v_override->>'team_id')::uuid;
  end loop;

  -- Realize retentions into season_rosters, deducting purse (the
  -- purse_remaining >= 0 check constraint rejects an unaffordable retention
  -- with no extra validation needed here)
  for v_retention in select * from season_retentions where season_id = p_season_id loop
    insert into season_rosters (season_id, team_id, player_id, price)
    values (p_season_id, v_retention.team_id, v_retention.player_id, v_retention.retention_price);

    update season_teams set purse_remaining = purse_remaining - v_retention.retention_price
      where season_id = p_season_id and team_id = v_retention.team_id;
  end loop;

  -- Seed the pool: every active player not already on this season's roster
  for v_player_id in
    select p.id from players p
    where p.is_active
      and not exists (select 1 from season_rosters sr where sr.season_id = p_season_id and sr.player_id = p.id)
  loop
    if not (p_player_indices ? v_player_id::text) then
      raise exception 'Missing computed player index for player %.', v_player_id;
    end if;

    insert into season_auction_players (season_id, player_id, base_price, player_index, index_components, status)
    values (
      p_season_id,
      v_player_id,
      coalesce((p_base_price_overrides->>v_player_id::text)::numeric, p_base_price_default),
      (p_player_indices->v_player_id::text->>'player_index')::numeric,
      p_player_indices->v_player_id::text->'index_components',
      'PENDING'
    );
  end loop;

  -- Order the pool
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

  -- Preflight: is it even possible for every team to reach the minimum?
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

  -- Lock strategies (neutral defaults for any team whose owner never configured one)
  insert into season_auction_strategies_locked (
    season_id, team_id, weight_kills, weight_deaths, weight_flags, weight_kd, weight_winrate, weight_mvp,
    weight_experience, weight_form, role_bonus_flagger, role_bonus_defender, role_bonus_all_rounder,
    aggressiveness, budget_discipline, persistence
  )
  select p_season_id, st.team_id,
    coalesce(tos.weight_kills, 12.5), coalesce(tos.weight_deaths, 12.5), coalesce(tos.weight_flags, 12.5),
    coalesce(tos.weight_kd, 12.5), coalesce(tos.weight_winrate, 12.5), coalesce(tos.weight_mvp, 12.5),
    coalesce(tos.weight_experience, 12.5), coalesce(tos.weight_form, 12.5),
    coalesce(tos.role_bonus_flagger, 1.0), coalesce(tos.role_bonus_defender, 1.0), coalesce(tos.role_bonus_all_rounder, 1.0),
    coalesce(tos.aggressiveness, 5), coalesce(tos.budget_discipline, 5), coalesce(tos.persistence, 5)
  from season_teams st
  left join team_owner_strategies tos on tos.team_id = st.team_id
  where st.season_id = p_season_id;

  update season_auctions set
    status = 'RUNNING',
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

  if v_auction.max_retentions_per_team > 0
     and exists (select 1 from season_teams where season_id = p_season_id and retention_submitted = false) then
    raise exception 'Not every team has submitted a retention decision yet.';
  end if;

  if exists (
    select 1 from season_retentions where season_id = p_season_id
    group by team_id having count(*) > v_auction.max_retentions_per_team
  ) then
    raise exception 'One or more teams have retained more players than the current cap allows; they must resubmit.';
  end if;

  -- Direct player-owner assignments: validate the whole batch before
  -- mutating anything (one per team, one team per player, valid price,
  -- and never a player who is also retained this season).
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

  -- Purses: default for every team, then overrides (identical to start_auction)
  update season_teams set purse_total = p_purse_default, purse_remaining = p_purse_default
    where season_id = p_season_id;

  for v_override in select * from jsonb_array_elements(coalesce(p_purse_overrides, '[]'::jsonb)) loop
    update season_teams
    set purse_total = (v_override->>'purse_total')::numeric,
        purse_remaining = (v_override->>'purse_total')::numeric
    where season_id = p_season_id and team_id = (v_override->>'team_id')::uuid;
  end loop;

  -- Realize retentions into season_rosters, deducting purse (identical to start_auction)
  for v_retention in select * from season_retentions where season_id = p_season_id loop
    insert into season_rosters (season_id, team_id, player_id, price)
    values (p_season_id, v_retention.team_id, v_retention.player_id, v_retention.retention_price);

    update season_teams set purse_remaining = purse_remaining - v_retention.retention_price
      where season_id = p_season_id and team_id = v_retention.team_id;
  end loop;

  -- Realize direct player-owner assignments the same way, at the admin's
  -- entered price rather than a season_retentions row.
  for v_assignment in select * from jsonb_array_elements(coalesce(p_direct_assignments, '[]'::jsonb)) loop
    v_assignment_team_id := (v_assignment->>'team_id')::uuid;
    v_assignment_player_id := (v_assignment->>'player_id')::uuid;
    v_assignment_price := (v_assignment->>'price')::numeric;

    insert into season_rosters (season_id, team_id, player_id, price)
    values (p_season_id, v_assignment_team_id, v_assignment_player_id, v_assignment_price);

    update season_teams set purse_remaining = purse_remaining - v_assignment_price
      where season_id = p_season_id and team_id = v_assignment_team_id;
  end loop;

  -- Seed the pool: every active player not already on this season's roster.
  -- Unlike start_auction, a missing player index is not an error — it is
  -- optional display-only data for this mode, never required for bidding.
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

  -- Order the pool (identical strategy set to start_auction)
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

  -- Preflight: is it even possible for every team to reach the minimum? (identical to start_auction)
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

  -- No strategy locking, no AI logic reachable from here — that is the
  -- entire difference from start_auction beyond the config columns below.
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
