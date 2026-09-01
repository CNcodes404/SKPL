-- Standalone re-apply block for 0015_manual_auction.sql's six functions +
-- grants only (no `create type` / `alter table`), so it can be pasted and
-- run on its own in the SQL editor without ever failing on "already
-- exists". Not a migration — supabase/migrations/0015_manual_auction.sql
-- remains the source of truth; this file exists purely so the fixed
-- function bodies (now using clock_timestamp() instead of now() for every
-- timer-critical read/write) can be re-applied on top of a database where
-- 0015's schema portion already ran, without re-running the whole file.

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
  p_player_indices jsonb default '{}'::jsonb
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

create or replace function draw_next_player(p_season_id uuid, p_player_id uuid default null) returns season_auctions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auction season_auctions%rowtype;
  v_row season_auction_players%rowtype;
begin
  if not is_admin() then
    raise exception 'Only administrators can draw a player.';
  end if;

  select * into v_auction from season_auctions where season_id = p_season_id for update;
  if not found then
    raise exception 'No auction found for this season.';
  end if;
  if v_auction.auction_mode <> 'MANUAL' then
    raise exception 'This auction is not a manual auction.';
  end if;
  if v_auction.status = 'PAUSED' then
    raise exception 'Auction is paused. Resume before drawing a player.';
  end if;
  if v_auction.status <> 'RUNNING' then
    raise exception 'Auction is not running (status: %).', v_auction.status;
  end if;
  if v_auction.current_player_id is not null then
    raise exception 'A player is already on the block.';
  end if;

  if not exists (
    select 1 from season_auction_players where season_id = p_season_id and status = 'PENDING' and attempt_no = 1
  ) then
    update season_auction_players
      set status = 'PENDING', attempt_no = 2, first_attempt_outcome = 'UNSOLD', base_price = round(base_price / 2)
      where season_id = p_season_id and status = 'UNSOLD' and attempt_no = 1;

    if not exists (select 1 from season_auction_players where season_id = p_season_id and status = 'PENDING') then
      update season_auctions set status = 'COMPLETED', completed_at = now() where season_id = p_season_id;
      select * into v_auction from season_auctions where season_id = p_season_id;
      return v_auction;
    end if;
  end if;

  if v_auction.player_draw_mode = 'MANUAL' then
    if p_player_id is null then
      raise exception 'A player must be selected in Manual Draw mode.';
    end if;
    select * into v_row from season_auction_players
      where season_id = p_season_id and player_id = p_player_id and status = 'PENDING'
      for update;
    if not found then
      raise exception 'That player is not eligible to be drawn right now.';
    end if;
  else
    if p_player_id is not null then
      raise exception 'Player selection is not allowed in Auto Draw mode.';
    end if;
    select * into v_row from season_auction_players
      where season_id = p_season_id and status = 'PENDING'
      order by attempt_no asc, order_no asc
      limit 1
      for update;
    if not found then
      raise exception 'No eligible player to draw.';
    end if;
  end if;

  update season_auction_players set status = 'ON_BLOCK' where id = v_row.id;

  update season_auctions set
    current_player_id = v_row.player_id,
    current_high_bid = v_row.base_price,
    current_high_team_id = null,
    bid_expires_at = clock_timestamp() + make_interval(secs => v_auction.bid_timer_seconds::double precision),
    round_no = round_no + 1
  where season_id = p_season_id;

  select * into v_auction from season_auctions where season_id = p_season_id;
  return v_auction;
end;
$$;

create or replace function place_bid(p_season_id uuid, p_team_id uuid, p_amount numeric) returns season_auctions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auction season_auctions%rowtype;
  v_pool season_auction_players%rowtype;
  v_increment numeric;
  v_minimum_next_bid numeric;
  v_roster_count integer;
  v_available_slots integer;
  v_spots_after integer;
  v_purse_remaining numeric;
  v_maximum_safe_bid numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Bid amount must be greater than zero.';
  end if;
  if not is_owner_of_team(p_team_id) then
    raise exception 'Only that team''s owner can place a bid.';
  end if;

  select * into v_auction from season_auctions where season_id = p_season_id for update;
  if not found then
    raise exception 'No auction found for this season.';
  end if;
  if v_auction.auction_mode <> 'MANUAL' then
    raise exception 'This auction is not a manual auction.';
  end if;
  if v_auction.status <> 'RUNNING' then
    raise exception 'Auction is not accepting bids right now (status: %).', v_auction.status;
  end if;
  if v_auction.current_player_id is null then
    raise exception 'No player is currently on the block.';
  end if;
  if v_auction.bid_expires_at is null or clock_timestamp() > v_auction.bid_expires_at + interval '1 second' then
    raise exception 'Bidding has closed for this player.';
  end if;
  if not exists (select 1 from season_teams where season_id = p_season_id and team_id = p_team_id) then
    raise exception 'Team is not part of this season.';
  end if;

  select * into v_pool from season_auction_players
    where season_id = p_season_id and player_id = v_auction.current_player_id
    for update;
  if not found or v_pool.status <> 'ON_BLOCK' then
    raise exception 'This player is no longer available for bidding.';
  end if;

  if v_auction.current_high_team_id = p_team_id then
    raise exception 'Your team already holds the highest bid.';
  end if;

  select count(*) into v_roster_count from season_rosters
    where season_id = p_season_id and team_id = p_team_id;
  if v_roster_count >= v_auction.max_squad_size then
    raise exception 'Team has already reached its maximum squad size.';
  end if;

  if v_auction.current_high_team_id is null then
    v_minimum_next_bid := v_pool.base_price;
  else
    v_increment := v_auction.initial_bid_increment
      + floor((v_auction.current_high_bid - v_pool.base_price) / v_auction.increment_step_range) * v_auction.increment_increase;
    v_minimum_next_bid := v_auction.current_high_bid + v_increment;
  end if;

  if p_amount < v_minimum_next_bid then
    raise exception 'Bid must be at least %.', v_minimum_next_bid;
  end if;

  select purse_remaining into v_purse_remaining from season_teams
    where season_id = p_season_id and team_id = p_team_id;

  v_available_slots := v_auction.max_squad_size - v_roster_count;
  v_spots_after := v_available_slots - 1;
  v_maximum_safe_bid := v_purse_remaining - (v_spots_after * v_pool.base_price);

  if p_amount > v_maximum_safe_bid then
    raise exception 'Bid exceeds the maximum safe bid of % for this team.', v_maximum_safe_bid;
  end if;

  update season_auctions set
    current_high_bid = p_amount,
    current_high_team_id = p_team_id,
    bid_expires_at = clock_timestamp() + make_interval(secs => v_auction.bid_timer_seconds::double precision)
  where season_id = p_season_id;

  insert into season_auction_bids (season_id, player_id, team_id, amount, round_no)
    values (p_season_id, v_auction.current_player_id, p_team_id, p_amount, v_auction.round_no);

  select * into v_auction from season_auctions where season_id = p_season_id;
  return v_auction;
end;
$$;

create or replace function resolve_expired_player(p_season_id uuid) returns season_auctions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auction season_auctions%rowtype;
  v_price numeric;
begin
  if not is_admin() then
    raise exception 'Only administrators can resolve auction expiry.';
  end if;

  select * into v_auction from season_auctions where season_id = p_season_id for update;
  if not found then
    raise exception 'No auction found for this season.';
  end if;
  if v_auction.auction_mode <> 'MANUAL' then
    raise exception 'This auction is not a manual auction.';
  end if;
  if v_auction.status <> 'RUNNING' then
    raise exception 'Auction is not running (status: %).', v_auction.status;
  end if;
  if v_auction.current_player_id is null then
    raise exception 'No player is currently on the block.';
  end if;

  if v_auction.bid_expires_at is null or clock_timestamp() <= v_auction.bid_expires_at + interval '1 second' then
    return v_auction;
  end if;

  if v_auction.current_high_team_id is not null then
    v_price := v_auction.current_high_bid;

    insert into season_rosters (season_id, team_id, player_id, price)
      values (p_season_id, v_auction.current_high_team_id, v_auction.current_player_id, v_price);
    update season_teams set purse_remaining = purse_remaining - v_price
      where season_id = p_season_id and team_id = v_auction.current_high_team_id;
    update season_auction_players set
      status = 'SOLD',
      sold_team_id = v_auction.current_high_team_id,
      sold_price = v_price,
      first_attempt_outcome = case when attempt_no = 1 then 'SOLD' else first_attempt_outcome end
    where season_id = p_season_id and player_id = v_auction.current_player_id;
  else
    update season_auction_players set
      status = 'UNSOLD',
      first_attempt_outcome = case when attempt_no = 1 then 'UNSOLD' else first_attempt_outcome end
    where season_id = p_season_id and player_id = v_auction.current_player_id;
  end if;

  update season_auctions set
    current_player_id = null,
    current_high_bid = null,
    current_high_team_id = null,
    bid_expires_at = null
  where season_id = p_season_id;

  select * into v_auction from season_auctions where season_id = p_season_id;
  return v_auction;
end;
$$;

create or replace function pause_manual_auction(p_season_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auction season_auctions%rowtype;
  v_remaining numeric;
begin
  if not is_admin() then
    raise exception 'Only administrators can pause the auction.';
  end if;

  select * into v_auction from season_auctions where season_id = p_season_id for update;
  if not found then
    raise exception 'No auction found for this season.';
  end if;
  if v_auction.auction_mode <> 'MANUAL' then
    raise exception 'This auction is not a manual auction.';
  end if;
  if v_auction.status <> 'RUNNING' then
    raise exception 'Auction is not currently running.';
  end if;

  if v_auction.current_player_id is not null and v_auction.bid_expires_at is not null then
    v_remaining := greatest(0, extract(epoch from (v_auction.bid_expires_at - clock_timestamp())));
  else
    v_remaining := null;
  end if;

  update season_auctions set
    status = 'PAUSED',
    paused_bid_seconds_remaining = v_remaining,
    bid_expires_at = null
  where season_id = p_season_id;
end;
$$;

create or replace function resume_manual_auction(p_season_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auction season_auctions%rowtype;
begin
  if not is_admin() then
    raise exception 'Only administrators can resume the auction.';
  end if;

  select * into v_auction from season_auctions where season_id = p_season_id for update;
  if not found then
    raise exception 'No auction found for this season.';
  end if;
  if v_auction.auction_mode <> 'MANUAL' then
    raise exception 'This auction is not a manual auction.';
  end if;
  if v_auction.status <> 'PAUSED' then
    raise exception 'Auction is not currently paused.';
  end if;

  update season_auctions set
    status = 'RUNNING',
    bid_expires_at = case
      when v_auction.current_player_id is not null and v_auction.paused_bid_seconds_remaining is not null
        then clock_timestamp() + make_interval(secs => v_auction.paused_bid_seconds_remaining::double precision)
      else null
    end,
    paused_bid_seconds_remaining = null
  where season_id = p_season_id;
end;
$$;

grant execute on function start_manual_auction(
  uuid, numeric, integer, integer, text, player_draw_mode_type, numeric, numeric, numeric, integer, jsonb, numeric, jsonb, jsonb
) to authenticated;
grant execute on function draw_next_player(uuid, uuid) to authenticated;
grant execute on function place_bid(uuid, uuid, numeric) to authenticated;
grant execute on function resolve_expired_player(uuid) to authenticated;
grant execute on function pause_manual_auction(uuid) to authenticated;
grant execute on function resume_manual_auction(uuid) to authenticated;
