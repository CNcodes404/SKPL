-- Manual/Live team auction — Phase 1 (database foundation only).
--
-- Adds a second, human-driven bidding mode alongside the existing AI/
-- simulated auction (0008_player_auction.sql onward). The two modes are
-- distinguished by season_auctions.auction_mode and share every table
-- already used by the AI auction (season_teams, season_rosters,
-- season_auction_players, season_auction_bids, retentions, Realtime
-- publication). Nothing in this file alters an existing column's meaning,
-- an existing constraint, or the behavior of start_auction/
-- advance_auction_bid/admin_skip_player/pause_auction/resume_auction/
-- reset_season_auction for AI-mode rows — every new column is nullable or
-- carries a default that makes every pre-existing season_auctions row keep
-- behaving exactly as before (auction_mode defaults to 'AI').
--
-- No new tables: second-round tracking lives on season_auction_players
-- (attempt_no / first_attempt_outcome) rather than a separate queue table,
-- per the "prefer extending shared structures" direction. No RLS policy
-- changes: every new column lives on a table that already restricts all
-- mutation to security-definer RPCs (see 0008's comment at its RLS
-- section) — that policy shape covers new columns automatically. No
-- Realtime publication changes: `alter publication ... add table` already
-- covers whichever columns a table has, present or future.

-- ─────────────────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────────────────

create type auction_mode_type as enum ('AI', 'MANUAL');
create type player_draw_mode_type as enum ('AUTO', 'MANUAL');

-- ─────────────────────────────────────────────────────────────────────────
-- season_auctions: mode + manual bidding configuration + live timer state
-- ─────────────────────────────────────────────────────────────────────────

alter table season_auctions
  add column auction_mode auction_mode_type not null default 'AI',
  add column player_draw_mode player_draw_mode_type not null default 'AUTO',
  add column initial_bid_increment numeric check (initial_bid_increment is null or initial_bid_increment >= 0),
  add column increment_step_range numeric check (increment_step_range is null or increment_step_range > 0),
  add column increment_increase numeric check (increment_increase is null or increment_increase >= 0),
  add column bid_timer_seconds integer check (bid_timer_seconds is null or bid_timer_seconds > 0),
  add column bid_expires_at timestamptz,
  -- Set while PAUSED so resume can restore exactly how much time was left
  -- on the clock, instead of letting the original deadline keep expiring
  -- underneath the pause (see pause_manual_auction/resume_manual_auction).
  add column paused_bid_seconds_remaining numeric check (paused_bid_seconds_remaining is null or paused_bid_seconds_remaining >= 0);

-- A manual auction can't legally start without a complete bidding-rules
-- config; an AI auction never needs these columns at all. Both facts are
-- expressed by one constraint so it's impossible to end up with a MANUAL
-- row missing part of its config, at any point in time.
alter table season_auctions
  add constraint season_auctions_manual_config_required check (
    auction_mode <> 'MANUAL' or (
      initial_bid_increment is not null
      and increment_step_range is not null
      and increment_increase is not null
      and bid_timer_seconds is not null
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- season_auction_players: first/second-round ("attempt") tracking
--
-- attempt_no is which pass this pool row is currently queued/was drawn in
-- (1 = first round, 2 = second round). status/sold_team_id/sold_price keep
-- their existing meaning unchanged; a player requeued into round 2 has its
-- *same* row's status flipped back from UNSOLD to PENDING with attempt_no
-- bumped to 2 — first_attempt_outcome freezes what happened the first time
-- (SOLD or UNSOLD) so that history survives the requeue. A player who ends
-- up SOLD never has this row touched again by anything, in either mode.
-- ─────────────────────────────────────────────────────────────────────────

alter table season_auction_players
  add column attempt_no integer not null default 1 check (attempt_no in (1, 2)),
  add column first_attempt_outcome auction_player_status
    check (first_attempt_outcome is null or first_attempt_outcome in ('SOLD', 'UNSOLD'));

-- No new index: idx_sap_season_status(season_id, status) already narrows
-- "find eligible players" to a handful of rows per season; auction pools
-- are tens of rows, not thousands, so filtering attempt_no on top of that
-- needs no dedicated composite index. Revisit only if real usage proves
-- otherwise.

-- ─────────────────────────────────────────────────────────────────────────
-- start_manual_auction: the Manual-mode sibling of start_auction.
--
-- Deliberately a *separate* function rather than a modified start_auction,
-- so the AI path (including its strategy-locking step) carries zero risk
-- from this change. Shares the same retention-realization / purse-init /
-- pool-seeding / min-squad-feasibility-preflight logic as start_auction
-- (same math, independently duplicated here rather than factored into a
-- shared helper, to avoid touching the existing function at all right
-- now). Never inserts into season_auction_strategies_locked and never
-- calls compute_team_max_bid — no AI logic is reachable from this path.
-- p_player_indices is accepted (and stored, same as start_auction) purely
-- so a later phase's Team Strength display has Player Index to read; it is
-- never required and never used for anything bid-legality-related.
-- ─────────────────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────────────────
-- draw_next_player: reveals the next player (AUTO) or validates and reveals
-- an admin-chosen one (MANUAL draw mode). Also owns the attempt-1 -> attempt-2
-- requeue transition and auction completion, mirroring where
-- advance_auction_bid's STEP 1 already does the equivalent AI-mode reveal.
-- ─────────────────────────────────────────────────────────────────────────

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

  -- Attempt-1 pool exhausted? Requeue attempt-1 UNSOLD players into attempt
  -- 2, once, the moment nothing is left pending in attempt 1 — never before
  -- every player has had a first opportunity.
  if not exists (
    select 1 from season_auction_players where season_id = p_season_id and status = 'PENDING' and attempt_no = 1
  ) then
    -- Returning (Round-1 UNSOLD) players re-enter Round 2 at half their
    -- original base price.
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

-- ─────────────────────────────────────────────────────────────────────────
-- place_bid: the only entry point through which a human bid is ever
-- recorded. Never accepts current bid, current bidder, purse, roster
-- count, squad size, minimum/maximum bid, or expiry from the client —
-- every one of those is read fresh, inside the lock, from the database.
-- ─────────────────────────────────────────────────────────────────────────

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

  -- The opening bid on a freshly-drawn player is allowed at exactly the
  -- base price — the increment schedule only applies once a bid actually
  -- exists (current_high_team_id is not null). Anchored to this player's
  -- own starting price (base_price), exactly the agreed formula:
  --   increment = initial_increment + floor((current_bid - starting_price) / step_range) * increment_increase
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

  -- Maximum safe bid: purse_remaining reserved against every remaining
  -- slot (after this purchase) at this player's base price.
  v_available_slots := v_auction.max_squad_size - v_roster_count;
  v_spots_after := v_available_slots - 1;
  v_maximum_safe_bid := v_purse_remaining - (v_spots_after * v_pool.base_price);

  if p_amount > v_maximum_safe_bid then
    raise exception 'Bid exceeds the maximum safe bid of % for this team.', v_maximum_safe_bid;
  end if;

  -- Do NOT touch season_teams here — purse is only ever deducted at SOLD
  -- resolution (resolve_expired_player), never at bid placement.
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

-- ─────────────────────────────────────────────────────────────────────────
-- resolve_expired_player: Admin-triggered, but Postgres-verified, expiry
-- resolution. A call before the deadline (+ grace) is a safe, idempotent
-- no-op — this is what makes it safe for an admin's browser to call
-- speculatively, and safe to call again after a disconnect/reconnect.
-- ─────────────────────────────────────────────────────────────────────────

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
    -- Not actually expired yet — return unchanged rather than erroring, so
    -- a client can call this speculatively without special-casing "too early".
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

-- ─────────────────────────────────────────────────────────────────────────
-- pause_manual_auction / resume_manual_auction: deliberately new functions
-- rather than reusing pause_auction/resume_auction, because Manual mode
-- needs timer-preserving semantics (freeze and later restore the remaining
-- countdown) that the generic AI-mode pause/resume have no reason to know
-- about. pause_auction/resume_auction are untouched and still exclusively
-- serve the AI path.
-- ─────────────────────────────────────────────────────────────────────────

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

-- complete_manual_auction() was evaluated and deliberately not created —
-- completion is a natural terminal branch inside draw_next_player (both
-- attempt pools empty), mirroring how advance_auction_bid already reaches
-- COMPLETED from inside its own reveal step rather than a separate RPC.

-- admin_emergency_reassign_player() (the minimum-squad recovery action) is
-- intentionally deferred out of Phase 1 — it is an admin-recovery feature,
-- not part of the core bidding loop, and Phase 1 scope is the bidding
-- foundation only. Flagged here so it isn't forgotten before go-live.

-- ─────────────────────────────────────────────────────────────────────────
-- Grants
--
-- Matches the existing pattern (0002_grants.sql, 0008_player_auction.sql):
-- explicit `authenticated` grants only, no `anon` grants for any mutating
-- RPC. service_role is not granted explicitly here, following the same
-- precedent 0008 relied on (its comment at 0008_player_auction.sql:1049-1051
-- states the project's standing `grant execute on all functions in schema
-- public to service_role` already covers new functions) — this assumption
-- is inherited, not independently re-verified against the live project in
-- this change.
-- ─────────────────────────────────────────────────────────────────────────

grant execute on function start_manual_auction(
  uuid, numeric, integer, integer, text, player_draw_mode_type, numeric, numeric, numeric, integer, jsonb, numeric, jsonb, jsonb
) to authenticated;
grant execute on function draw_next_player(uuid, uuid) to authenticated;
grant execute on function place_bid(uuid, uuid, numeric) to authenticated;
grant execute on function resolve_expired_player(uuid) to authenticated;
grant execute on function pause_manual_auction(uuid) to authenticated;
grant execute on function resume_manual_auction(uuid) to authenticated;
