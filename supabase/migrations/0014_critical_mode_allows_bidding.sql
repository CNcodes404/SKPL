-- Redesigns critical_mode: it used to mean "skip bidding, force-assign at
-- base price" — correct only when a league has real surplus above the
-- minimum requirement. In a "every player is always assigned to some team"
-- league, pool size always exactly equals total required slots, so the old
-- logic put the ENTIRE auction into forced-assignment from player #1,
-- eliminating bidding wars entirely.
--
-- critical_mode now means "eligibility is restricted to teams still below
-- their minimum" — not "skip bidding". Two or more still-needy teams can
-- still genuinely bid against each other with real escalating rounds; a
-- maxed-out/satisfied team just can't take a slot a short team needs. The
-- safety guarantee (nobody ends up short) is unchanged: resolution in
-- critical mode always goes to a still-under-minimum team either way. The
-- only remaining forced, no-bid-war assignment is the true last resort —
-- a player where not even one still-needy team is willing to raise the
-- first increment.

create or replace function advance_auction_bid(p_season_id uuid, p_driver_token uuid) returns season_auctions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auction season_auctions%rowtype;
  v_pool_remaining integer;
  v_aggregate_shortfall integer;
  v_critical boolean;
  v_next_player season_auction_players%rowtype;
  v_increment numeric;
  v_next_price numeric;
  v_eligible jsonb := '[]'::jsonb;
  v_rec record;
  v_chosen_team_id uuid;
  v_chosen_bid numeric;
  v_price numeric;
  v_base_price numeric;
  v_none uuid := '00000000-0000-0000-0000-000000000000'::uuid;
begin
  if not is_admin() then
    raise exception 'Only administrators can drive the auction.';
  end if;

  select * into v_auction from season_auctions where season_id = p_season_id for update;
  if not found then
    raise exception 'No auction found for this season.';
  end if;
  if v_auction.status <> 'RUNNING' then
    raise exception 'Auction is not running (status: %).', v_auction.status;
  end if;

  if v_auction.driver_token is not null and v_auction.driver_token <> p_driver_token
     and v_auction.driver_heartbeat_at > now() - interval '10 seconds' then
    raise exception 'Another session is currently driving this auction.';
  end if;
  update season_auctions set driver_token = p_driver_token, driver_heartbeat_at = now()
    where season_id = p_season_id;

  -- STEP 1: reveal the next player if none is currently on the block
  if v_auction.current_player_id is null then
    select count(*) into v_pool_remaining from season_auction_players
      where season_id = p_season_id and status = 'PENDING';

    if v_pool_remaining = 0 then
      update season_auctions set status = 'COMPLETED', completed_at = now() where season_id = p_season_id;
      select * into v_auction from season_auctions where season_id = p_season_id;
      return v_auction;
    end if;

    select coalesce(sum(greatest(v_auction.min_squad_size - cnt, 0)), 0) into v_aggregate_shortfall
    from (
      select st.team_id, count(sr.id) as cnt
      from season_teams st
      left join season_rosters sr on sr.season_id = p_season_id and sr.team_id = st.team_id
      where st.season_id = p_season_id
      group by st.team_id
    ) t;

    v_critical := v_pool_remaining <= v_aggregate_shortfall;

    select * into v_next_player from season_auction_players
      where season_id = p_season_id and status = 'PENDING'
      order by order_no asc limit 1;

    update season_auction_players set status = 'ON_BLOCK' where id = v_next_player.id;

    update season_auctions set
      current_player_id = v_next_player.player_id,
      current_high_bid = v_next_player.base_price,
      current_high_team_id = null,
      contested_rounds = '{}'::jsonb,
      critical_mode = v_critical,
      round_no = round_no + 1
    where season_id = p_season_id;

    select * into v_auction from season_auctions where season_id = p_season_id;
    return v_auction;
  end if;

  -- Resolve one bidding round. critical_mode restricts *who may bid* to
  -- teams still below their minimum — it does not skip competitive bidding.
  v_increment := greatest(1, round(v_auction.current_high_bid * 0.05));
  v_next_price := v_auction.current_high_bid + v_increment;

  for v_rec in
    select st.team_id,
      compute_team_max_bid(p_season_id, st.team_id, v_auction.current_player_id) as max_bid,
      coalesce((v_auction.contested_rounds->>st.team_id::text)::integer, 0) as rounds,
      coalesce(sasl.persistence, 5) as persistence
    from season_teams st
    left join season_auction_strategies_locked sasl
      on sasl.season_id = p_season_id and sasl.team_id = st.team_id
    where st.season_id = p_season_id
      and st.team_id <> coalesce(v_auction.current_high_team_id, v_none)
      and (select count(*) from season_rosters sr where sr.season_id = p_season_id and sr.team_id = st.team_id) < v_auction.max_squad_size
      and (
        not v_auction.critical_mode
        or (select count(*) from season_rosters sr where sr.season_id = p_season_id and sr.team_id = st.team_id) < v_auction.min_squad_size
      )
  loop
    if v_rec.max_bid >= v_next_price and v_rec.rounds < v_rec.persistence then
      v_eligible := v_eligible || jsonb_build_object('team_id', v_rec.team_id, 'max_bid', v_rec.max_bid);
    end if;
  end loop;

  if jsonb_array_length(v_eligible) = 0 then
    if v_auction.current_high_team_id is not null then
      -- at least one round already happened (including possibly a single
      -- critical-mode bid) — sell to whoever is currently leading.
      v_price := v_auction.current_high_bid;
      insert into season_rosters (season_id, team_id, player_id, price)
        values (p_season_id, v_auction.current_high_team_id, v_auction.current_player_id, v_price);
      update season_teams set purse_remaining = purse_remaining - v_price
        where season_id = p_season_id and team_id = v_auction.current_high_team_id;
      update season_auction_players set status = 'SOLD', sold_team_id = v_auction.current_high_team_id, sold_price = v_price
        where season_id = p_season_id and player_id = v_auction.current_player_id;

      update season_auctions set
        current_player_id = null, current_high_bid = null, current_high_team_id = null,
        contested_rounds = '{}'::jsonb, critical_mode = false
      where season_id = p_season_id;
    elsif v_auction.critical_mode then
      -- Nobody has bid even once and we're in the danger zone: true last
      -- resort — force-assign to whichever still-under-minimum team values
      -- this player most, at base price (purse-capped).
      select st.team_id, least(compute_team_max_bid(p_season_id, st.team_id, v_auction.current_player_id), st.purse_remaining)
        into v_chosen_team_id, v_chosen_bid
      from season_teams st
      where st.season_id = p_season_id
        and (select count(*) from season_rosters sr where sr.season_id = p_season_id and sr.team_id = st.team_id) < v_auction.min_squad_size
      order by 2 desc
      limit 1;

      select base_price into v_base_price from season_auction_players
        where season_id = p_season_id and player_id = v_auction.current_player_id;

      select least(v_base_price, purse_remaining) into v_price
        from season_teams where season_id = p_season_id and team_id = v_chosen_team_id;

      insert into season_rosters (season_id, team_id, player_id, price)
        values (p_season_id, v_chosen_team_id, v_auction.current_player_id, v_price);
      update season_teams set purse_remaining = purse_remaining - v_price
        where season_id = p_season_id and team_id = v_chosen_team_id;
      update season_auction_players set status = 'SOLD', sold_team_id = v_chosen_team_id, sold_price = v_price
        where season_id = p_season_id and player_id = v_auction.current_player_id;
      insert into season_auction_bids (season_id, player_id, team_id, amount, round_no)
        values (p_season_id, v_auction.current_player_id, v_chosen_team_id, v_price, v_auction.round_no);

      update season_auctions set
        current_player_id = null, current_high_bid = null, current_high_team_id = null,
        contested_rounds = '{}'::jsonb, critical_mode = false
      where season_id = p_season_id;
    else
      -- normal mode, nobody ever bid: unsold
      update season_auction_players set status = 'UNSOLD'
        where season_id = p_season_id and player_id = v_auction.current_player_id;

      update season_auctions set
        current_player_id = null, current_high_bid = null, current_high_team_id = null, contested_rounds = '{}'::jsonb
      where season_id = p_season_id;
    end if;
  else
    with ranked as (
      select (elem->>'team_id')::uuid as team_id,
        row_number() over (order by (elem->>'max_bid')::numeric desc, random()) as rn,
        count(*) over () as total
      from jsonb_array_elements(v_eligible) elem
    )
    select team_id into v_chosen_team_id from ranked
      where rn = (case when random() < 0.7 or total = 1 then 1 else 2 end)
      limit 1;

    update season_auctions set
      current_high_bid = v_next_price,
      current_high_team_id = v_chosen_team_id,
      contested_rounds = jsonb_set(
        contested_rounds, array[v_chosen_team_id::text],
        to_jsonb(coalesce((contested_rounds->>v_chosen_team_id::text)::integer, 0) + 1)
      )
    where season_id = p_season_id;

    insert into season_auction_bids (season_id, player_id, team_id, amount, round_no)
      values (p_season_id, v_auction.current_player_id, v_chosen_team_id, v_next_price, v_auction.round_no);
  end if;

  select * into v_auction from season_auctions where season_id = p_season_id;
  return v_auction;
end;
$$;
