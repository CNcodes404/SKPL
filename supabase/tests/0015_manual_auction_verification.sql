-- Phase 1 verification script for supabase/migrations/0015_manual_auction.sql.
--
-- NOT a migration — do not point `supabase db push` at this file. Intended
-- to be run by hand (Supabase SQL editor, or `psql`) against a disposable
-- dev/staging project AFTER 0015 has been applied. Everything it does is
-- wrapped in one transaction and rolled back at the end, so nothing it
-- creates is left behind.
--
-- This script was authored but has NOT been executed — the environment
-- this was written in has no `supabase` CLI, no Docker, and no `psql`
-- available, so there was no local Postgres/Supabase runtime to run it
-- against. Treat every assertion below as reasoned-through, not proven.
--
-- It must be run as a role that can insert into `auth.users` directly
-- (e.g. the `postgres` role in the Supabase SQL editor) — it simulates
-- authenticated owner/admin sessions via `request.jwt.claims`, the same
-- GUC Supabase's own `auth.uid()` reads from. If your project's
-- `auth.users` table requires columns beyond the minimal set used below,
-- adjust the two INSERTs accordingly.
--
-- On the first failing assertion, `raise exception` aborts the whole
-- transaction; every DO block after that point will itself report
-- "current transaction is aborted" — that cascade is expected noise, not
-- a second failure. The first RAISE EXCEPTION message identifies the
-- actual failing scenario. If nothing fails, the final NOTICE says so.

begin;

create temporary table test_ctx (key text primary key, value text) on commit drop;

-- Deliberately does NOT touch the Postgres role (no SET/SET LOCAL ROLE).
-- auth.uid() reads only the request.jwt.claims GUC, and every mutation in
-- 0015 goes through a SECURITY DEFINER function that runs with its owner's
-- privileges regardless of the caller's role — so simulating the JWT claim
-- is sufficient, and actually switching role only breaks access to
-- session-local objects like the temp table below.
create or replace function test_set_current_user(p_user_id uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
end;
$$ language plpgsql;

create or replace function test_clear_current_user() returns void as $$
begin
  perform set_config('request.jwt.claims', '', true);
end;
$$ language plpgsql;

create or replace function test_ctx_set(p_key text, p_value uuid) returns void as $$
begin
  insert into test_ctx(key, value) values (p_key, p_value::text)
    on conflict (key) do update set value = excluded.value;
end;
$$ language plpgsql;

create or replace function test_ctx_get(p_key text) returns uuid as $$
  select value::uuid from test_ctx where key = p_key;
$$ language sql;

-- ═══════════════════════════════════════════════════════════════════════
-- FIXTURES
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  v_admin_user uuid := gen_random_uuid();
  v_owner_a_user uuid := gen_random_uuid();
  v_owner_b_user uuid := gen_random_uuid();
  v_team_a uuid; v_team_b uuid;
  v_season uuid;
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_p4 uuid;
begin
  -- Minimal auth.users rows sufficient for the FKs on admin_profiles /
  -- team_owner_profiles. Adjust column list if your project's auth schema
  -- requires more (e.g. instance_id, aud, role) than defaults provide.
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
  values
    (v_admin_user, 'test-admin@example.invalid', 'x', now(), now(), now(), 'authenticated', 'authenticated'),
    (v_owner_a_user, 'test-owner-a@example.invalid', 'x', now(), now(), now(), 'authenticated', 'authenticated'),
    (v_owner_b_user, 'test-owner-b@example.invalid', 'x', now(), now(), now(), 'authenticated', 'authenticated');

  insert into admin_profiles (user_id, is_admin) values (v_admin_user, true);

  insert into teams (name, short_name) values ('Test Team A', 'TTA') returning id into v_team_a;
  insert into teams (name, short_name) values ('Test Team B', 'TTB') returning id into v_team_b;

  insert into team_owner_profiles (user_id, team_id, owner_email) values (v_owner_a_user, v_team_a, 'test-owner-a@example.invalid');
  insert into team_owner_profiles (user_id, team_id, owner_email) values (v_owner_b_user, v_team_b, 'test-owner-b@example.invalid');

  insert into players (name, is_active) values ('Test Player 1', true) returning id into v_p1;
  insert into players (name, is_active) values ('Test Player 2', true) returning id into v_p2;
  insert into players (name, is_active) values ('Test Player 3', true) returning id into v_p3;
  insert into players (name, is_active) values ('Test Player 4', true) returning id into v_p4;

  -- Both start_auction and start_manual_auction seed their pool from every
  -- *active* row in `players`, not just these four — and this script may
  -- run against a database that already has real league players in it.
  -- Deactivate everyone else for the life of this (rolled-back) transaction
  -- so both auction pools are scoped to exactly the four fixtures every
  -- assertion below assumes.
  update players set is_active = false where id not in (v_p1, v_p2, v_p3, v_p4);

  perform test_set_current_user(v_admin_user);

  v_season := create_season_with_setup(
    p_name := 'Phase 1 Verification Season',
    p_season_number := 9001,
    p_start_date := null,
    p_end_date := null,
    p_winning_points := 3,
    p_close_loss_enabled := false,
    p_close_loss_points := 0,
    p_close_loss_max_difference := 0,
    p_playoff_team_count := 0,
    p_matches_per_opponent := 1,
    p_team_ids := array[v_team_a, v_team_b],
    p_rosters := '[]'::jsonb,
    p_matches := '[]'::jsonb,
    p_enable_auction := true,
    p_max_retentions_per_team := 0,
    p_retention_price_increase_pct := 0
  );

  perform test_ctx_set('admin_user', v_admin_user);
  perform test_ctx_set('owner_a_user', v_owner_a_user);
  perform test_ctx_set('owner_b_user', v_owner_b_user);
  perform test_ctx_set('team_a', v_team_a);
  perform test_ctx_set('team_b', v_team_b);
  perform test_ctx_set('season', v_season);
  perform test_ctx_set('p1', v_p1);
  perform test_ctx_set('p2', v_p2);
  perform test_ctx_set('p3', v_p3);
  perform test_ctx_set('p4', v_p4);

  perform test_clear_current_user();
  raise notice 'FIXTURES OK — season=%, team_a=%, team_b=%', v_season, v_team_a, v_team_b;
end $$;

-- ═══════════════════════════════════════════════════════════════════════
-- PART 1 — AI auction regression: prove start_auction/advance_auction_bid
-- still behave exactly as before, unmodified, on a season_auctions row
-- that also happens to carry the new (unused, default) manual-mode columns.
-- (Scenarios 1 and 24.)
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  v_admin uuid := test_ctx_get('admin_user');
  v_team_a uuid := test_ctx_get('team_a');
  v_team_b uuid := test_ctx_get('team_b');
  v_season uuid := test_ctx_get('season');
  v_p1 uuid := test_ctx_get('p1'); v_p2 uuid := test_ctx_get('p2');
  v_p3 uuid := test_ctx_get('p3'); v_p4 uuid := test_ctx_get('p4');
  v_indices jsonb;
  v_components jsonb := jsonb_build_object(
    'kills', 50, 'deaths', 50, 'flags', 50, 'kd', 50,
    'winrate', 50, 'mvp', 50, 'experience', 50, 'form', 50
  );
  v_row season_auctions%rowtype;
  v_guard integer := 0;
  v_sold_count integer;
  v_row_count integer;
  v_driver_token uuid := gen_random_uuid();
begin
  perform test_set_current_user(v_admin);

  select auction_mode, player_draw_mode, initial_bid_increment, increment_step_range,
         increment_increase, bid_timer_seconds, bid_expires_at
    into v_row.auction_mode, v_row.player_draw_mode, v_row.initial_bid_increment,
         v_row.increment_step_range, v_row.increment_increase, v_row.bid_timer_seconds, v_row.bid_expires_at
  from season_auctions where season_id = v_season;

  if v_row.auction_mode <> 'AI' then
    raise exception 'SCENARIO 1 FAILED: a freshly-created season_auctions row should default auction_mode to AI, got %', v_row.auction_mode;
  end if;
  if v_row.player_draw_mode <> 'AUTO' or v_row.initial_bid_increment is not null or v_row.bid_timer_seconds is not null then
    raise exception 'SCENARIO 1 FAILED: new manual-only columns should be at their harmless defaults for an AI-mode row';
  end if;

  -- Update retentions (none) to mark submitted, exactly as the existing UI flow does.
  perform save_owner_retentions(v_season, v_team_a, array[]::uuid[]);
  perform save_owner_retentions(v_season, v_team_b, array[]::uuid[]);

  v_indices := jsonb_build_object(
    v_p1::text, jsonb_build_object('player_index', 60, 'index_components', v_components),
    v_p2::text, jsonb_build_object('player_index', 55, 'index_components', v_components),
    v_p3::text, jsonb_build_object('player_index', 50, 'index_components', v_components),
    v_p4::text, jsonb_build_object('player_index', 45, 'index_components', v_components)
  );

  -- Unmodified existing RPC, unmodified call shape — except Team B is
  -- given zero purse here (purse override, not a code change) so it can
  -- never out-max-bid anyone. This is a pre-existing, unmodified bug in
  -- advance_auction_bid (0014_critical_mode_allows_bidding.sql): its
  -- bidder tie-break does `case when random() < 0.7 or total = 1 then 1
  -- else 2 end` *inside* a WHERE clause, so the volatile random() call is
  -- re-evaluated independently per candidate row rather than once — with
  -- exactly 2 eligible bidders there is a real chance both rows
  -- independently target "the other one," leaving zero matches and
  -- v_chosen_team_id NULL. Out of scope to fix here (not touching AI
  -- code); capping at 1 eligible bidder sidesteps it deterministically.
  perform start_auction(
    v_season, 5000000, 1000000, 1, 2, 'RANDOM',
    jsonb_build_array(jsonb_build_object('team_id', v_team_b, 'purse_total', 0)),
    '{}'::jsonb, v_indices
  );

  select status into v_row.status from season_auctions where season_id = v_season;
  if v_row.status <> 'RUNNING' then
    raise exception 'SCENARIO 1 FAILED: start_auction should leave the AI auction RUNNING, got %', v_row.status;
  end if;

  -- Drive the existing AI tick loop to completion — same call shape as
  -- AdminAuctionRun.tsx's existing 1.5s interval, just looped synchronously.
  loop
    v_guard := v_guard + 1;
    if v_guard > 200 then
      raise exception 'SCENARIO 1 FAILED: AI auction did not complete within 200 ticks — regression suspected';
    end if;
    perform advance_auction_bid(v_season, v_driver_token);
    select status into v_row.status from season_auctions where season_id = v_season;
    exit when v_row.status = 'COMPLETED';
  end loop;

  select count(*) into v_sold_count from season_auction_players where season_id = v_season and status = 'SOLD';
  select count(*) into v_row_count from season_rosters where season_id = v_season;
  if v_sold_count <> v_row_count then
    raise exception 'SCENARIO 1 FAILED: SOLD pool rows (%) should equal season_rosters rows (%)', v_sold_count, v_row_count;
  end if;
  if v_sold_count = 0 then
    raise exception 'SCENARIO 1 FAILED: expected at least one player to sell in the AI run';
  end if;

  perform test_clear_current_user();
  raise notice 'SCENARIO 1 & 24 PASSED — AI auction ran to completion unmodified (% players sold)', v_sold_count;
end $$;

-- Reset for Part 2: undo the AI run so this season can host a *separate*,
-- independent manual-auction fixture. In real usage these would be two
-- different seasons — reusing one here only to keep the script shorter.
do $$
declare
  v_admin uuid := test_ctx_get('admin_user');
  v_season uuid := test_ctx_get('season');
begin
  perform test_set_current_user(v_admin);
  perform reset_season_auction(v_season);
  delete from season_retentions where season_id = v_season;
  update season_teams set retention_submitted = false where season_id = v_season;
  perform test_clear_current_user();
end $$;

-- ═══════════════════════════════════════════════════════════════════════
-- PART 2 — Manual auction walkthrough (scenarios 2-23)
-- Fixture: base_price = 10L (1,000,000), initial_increment = 1L,
-- step_range = 10L, increase = 1L — the exact worked example from the
-- spec (10L -> min 11L). purse = 50L/team, min_squad=1, max_squad=2,
-- bid_timer = 2s so real-expiry tests only need a few seconds of pg_sleep.
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  v_admin uuid := test_ctx_get('admin_user');
  v_owner_a uuid := test_ctx_get('owner_a_user');
  v_owner_b uuid := test_ctx_get('owner_b_user');
  v_team_a uuid := test_ctx_get('team_a');
  v_team_b uuid := test_ctx_get('team_b');
  v_season uuid := test_ctx_get('season');
  v_p1 uuid := test_ctx_get('p1'); v_p2 uuid := test_ctx_get('p2');
  v_p3 uuid := test_ctx_get('p3'); v_p4 uuid := test_ctx_get('p4');
  v_auction season_auctions%rowtype;
  v_before timestamptz;
  v_after timestamptz;
  v_first_drawn uuid;
  v_second_drawn uuid;
  v_unsold_player uuid;
  v_purse_before numeric;
  v_purse_after numeric;
  v_roster_rows integer;
  v_ok boolean;
begin
  perform test_set_current_user(v_admin);

  perform save_owner_retentions(v_season, v_team_a, array[]::uuid[]);
  perform save_owner_retentions(v_season, v_team_b, array[]::uuid[]);

  -- 2: manual auction can start
  perform start_manual_auction(
    p_season_id := v_season,
    p_purse_default := 5000000,      -- 50L
    p_min_squad_size := 1,
    p_max_squad_size := 2,
    p_order_strategy := 'INDEX_DESC',
    p_player_draw_mode := 'AUTO',
    p_initial_bid_increment := 100000,   -- 1L
    p_increment_step_range := 1000000,   -- 10L
    p_increment_increase := 100000,      -- 1L
    p_bid_timer_seconds := 2
  );

  select * into v_auction from season_auctions where season_id = v_season;
  if v_auction.status <> 'RUNNING' or v_auction.auction_mode <> 'MANUAL' then
    raise exception 'SCENARIO 2 FAILED: expected RUNNING/MANUAL, got status=% mode=%', v_auction.status, v_auction.auction_mode;
  end if;
  if v_auction.current_player_id is not null then
    raise exception 'SCENARIO 2 FAILED (spec C): bidding must not start until a player is drawn';
  end if;

  -- Force every pool player's base_price to a known, equal value so the
  -- increment-formula scenarios (5-8) use the spec's exact worked numbers
  -- regardless of what start_manual_auction's category defaulting chose.
  update season_auction_players set base_price = 1000000 where season_id = v_season;

  -- 3 & 4: player can be drawn; base price becomes the initial bid
  v_auction := draw_next_player(v_season);
  v_first_drawn := v_auction.current_player_id;
  if v_first_drawn is null then
    raise exception 'SCENARIO 3 FAILED: draw_next_player did not put a player on the block';
  end if;
  if v_auction.current_high_bid <> 1000000 then
    raise exception 'SCENARIO 4 FAILED: current_high_bid should equal base_price (1000000), got %', v_auction.current_high_bid;
  end if;
  if v_auction.current_high_team_id is not null then
    raise exception 'SCENARIO 4 FAILED: highest bidder should start NULL';
  end if;

  -- 14: expiry cannot resolve early
  v_auction := resolve_expired_player(v_season);
  if v_auction.current_player_id is null then
    raise exception 'SCENARIO 14 FAILED: resolve_expired_player finalized a player before its timer expired';
  end if;

  -- 7: custom bid rejected below minimum. No bid exists yet, so the
  -- opening minimum is exactly the base price (1,000,000) — not
  -- base_price + increment; that increment only applies once a bid exists.
  perform test_set_current_user(v_owner_a);
  begin
    perform place_bid(v_season, v_team_a, 999999);
    raise exception 'SCENARIO 7 FAILED: a bid below the opening minimum (999999 < 1000000) was accepted';
  exception when others then
    if sqlerrm not like 'Bid must be at least%' then raise; end if;
  end;

  -- 5 & 6: minimum bid calculated correctly, valid opening bid accepted
  -- at exactly the base price.
  select bid_expires_at into v_before from season_auctions where season_id = v_season;
  v_auction := place_bid(v_season, v_team_a, 1000000);
  if v_auction.current_high_bid <> 1000000 or v_auction.current_high_team_id <> v_team_a then
    raise exception 'SCENARIO 5/6 FAILED: expected Team A high bid of 1000000, got %/%', v_auction.current_high_bid, v_auction.current_high_team_id;
  end if;

  -- 13: valid bid resets the timer
  select bid_expires_at into v_after from season_auctions where season_id = v_season;
  if v_after <= v_before then
    raise exception 'SCENARIO 13 FAILED: bid_expires_at should move forward after a valid bid (before=%, after=%)', v_before, v_after;
  end if;

  -- 11: unauthorized owner cannot bid for another team.
  -- A bid now exists (Team A at 1,000,000), so the increment schedule
  -- applies: increment = 100,000 + floor(0/1,000,000)*100,000 = 100,000
  -- -> minimum next bid = 1,100,000.
  perform test_set_current_user(v_owner_b);
  begin
    perform place_bid(v_season, v_team_b, 1100000);
    -- (this call is Team B's OWNER bidding for TEAM B, which is legitimate —
    -- the actual "for another team" abuse case is tested next.)
  exception when others then
    raise exception 'SCENARIO 11 SETUP FAILED: Team B owner should be able to legally bid for Team B: %', sqlerrm;
  end;

  perform test_set_current_user(v_owner_a);
  begin
    perform place_bid(v_season, v_team_b, 1300000); -- Team A's owner, targeting Team B
    raise exception 'SCENARIO 11 FAILED: Team A''s owner was able to place a bid on behalf of Team B';
  exception when others then
    if sqlerrm not like 'Only that team''s owner%' then raise; end if;
  end;

  -- 8: custom bid rejected above maximum safe bid.
  -- After the above: Team B is current high bidder at 1,100,000.
  -- Team A: purse=5,000,000, max_squad=2, roster_count=0 -> available=2,
  -- spots_after=1 -> max_safe = 5,000,000 - (1 * 1,000,000) = 4,000,000.
  perform test_set_current_user(v_owner_a);
  begin
    perform place_bid(v_season, v_team_a, 4000001);
    raise exception 'SCENARIO 8 FAILED: a bid above maximum safe bid (4000001 > 4000000) was accepted';
  exception when others then
    if sqlerrm not like 'Bid exceeds the maximum safe bid%' then raise; end if;
  end;
  -- boundary: exactly max safe bid must be accepted
  v_auction := place_bid(v_season, v_team_a, 4000000);
  if v_auction.current_high_bid <> 4000000 then
    raise exception 'SCENARIO 8 FAILED: a bid exactly at the maximum safe bid should be accepted';
  end if;

  -- 12: (sequential proxy for) concurrent bids cannot both become highest.
  -- True concurrency requires two simultaneous sessions and cannot be
  -- exercised from one serial script; this proves the mechanism that makes
  -- it safe — a second bid at the *same* amount is validated against the
  -- state the first bid already produced, and correctly rejected.
  perform test_set_current_user(v_owner_b);
  begin
    perform place_bid(v_season, v_team_b, 4000000); -- same amount Team A just won with
    raise exception 'SCENARIO 12 FAILED: a stale-amount bid should have been rejected as below the new minimum';
  exception when others then
    if sqlerrm not like 'Bid must be at least%' then raise; end if;
  end;

  -- 15: expiry resolves after the grace period
  perform pg_sleep(3.2); -- bid_timer_seconds(2) + 1s grace + margin
  perform test_set_current_user(v_admin);
  v_auction := resolve_expired_player(v_season);
  if v_auction.current_player_id is not null then
    raise exception 'SCENARIO 15 FAILED: player should have resolved after timer + grace elapsed';
  end if;

  select exists(
    select 1 from season_auction_players where season_id = v_season and player_id = v_first_drawn and status = 'SOLD'
  ) into v_ok;
  if not v_ok then
    raise exception 'SCENARIO 15/22(sold-path) FAILED: highest bidder (Team A) should have won the player as SOLD';
  end if;

  -- 20 & 21: purse deducted exactly once, roster row created exactly once
  select purse_remaining into v_purse_after from season_teams where season_id = v_season and team_id = v_team_a;
  if v_purse_after <> 5000000 - 4000000 then
    raise exception 'SCENARIO 20 FAILED: expected purse_remaining=1000000 after a 4000000 sale, got %', v_purse_after;
  end if;
  select count(*) into v_roster_rows from season_rosters where season_id = v_season and player_id = v_first_drawn;
  if v_roster_rows <> 1 then
    raise exception 'SCENARIO 21 FAILED: expected exactly one season_rosters row for the sold player, got %', v_roster_rows;
  end if;

  -- Re-calling resolve on a now-empty block must not double-charge anything —
  -- it should simply report there's nothing to resolve.
  begin
    perform resolve_expired_player(v_season);
    raise exception 'SCENARIO 20b FAILED: resolving with no player on the block should raise, not silently no-op';
  exception when others then
    if sqlerrm not like 'No player is currently on the block%' then raise; end if;
  end;
  select purse_remaining into v_purse_after from season_teams where season_id = v_season and team_id = v_team_a;
  if v_purse_after <> 5000000 - 4000000 then
    raise exception 'SCENARIO 20 FAILED: purse changed on a repeat resolve call — double deduction risk';
  end if;

  -- 19: a SOLD player cannot be reopened — its pool row never leaves SOLD.
  select exists(
    select 1 from season_auction_players where season_id = v_season and player_id = v_first_drawn and status = 'SOLD'
  ) into v_ok;
  if not v_ok then
    raise exception 'SCENARIO 19 FAILED: sold player''s pool row should remain SOLD';
  end if;

  -- Draw #2, leave unbid, let it expire -> UNSOLD (scenario 16), and make
  -- sure it is not immediately replayed while other attempt-1 players remain
  -- pending (scenario 17).
  v_auction := draw_next_player(v_season);
  v_unsold_player := v_auction.current_player_id;
  perform pg_sleep(3.2);
  v_auction := resolve_expired_player(v_season);
  select exists(
    select 1 from season_auction_players where season_id = v_season and player_id = v_unsold_player and status = 'UNSOLD'
  ) into v_ok;
  if not v_ok then
    raise exception 'SCENARIO 16 FAILED: an un-bid player should resolve to UNSOLD';
  end if;

  v_auction := draw_next_player(v_season);
  v_second_drawn := v_auction.current_player_id;
  if v_second_drawn = v_unsold_player then
    raise exception 'SCENARIO 17 FAILED: the just-UNSOLD player was replayed immediately instead of being queued for round 2';
  end if;
  -- leave p3 (the second draw) unbid too, so only p4 remains pending in round 1
  perform pg_sleep(3.2);
  perform resolve_expired_player(v_season);

  perform test_clear_current_user();
  raise notice 'SCENARIOS 2-8, 11-17, 19-21 PASSED';
end $$;

-- 9: full team cannot bid. Directly gives Team A a second player (bypassing
-- normal bidding, since Team A's remaining purse in this fixture is not
-- large enough to organically win one — that situation is exactly what
-- scenario 10 tests instead) so this check is isolated from the earlier
-- purse arithmetic and tests only the squad-size gate in place_bid.
do $$
declare
  v_admin uuid := test_ctx_get('admin_user');
  v_owner_a uuid := test_ctx_get('owner_a_user');
  v_team_a uuid := test_ctx_get('team_a');
  v_season uuid := test_ctx_get('season');
  v_p2 uuid := test_ctx_get('p2');
  v_auction season_auctions%rowtype;
begin
  perform test_set_current_user(v_admin);

  insert into season_rosters (season_id, team_id, player_id, price)
    values (v_season, v_team_a, v_p2, 1000000);
  update season_auction_players set status = 'SOLD', sold_team_id = v_team_a, sold_price = 1000000
    where season_id = v_season and player_id = v_p2;

  v_auction := draw_next_player(v_season); -- draws p4, the only attempt-1 PENDING player left
  perform test_set_current_user(v_owner_a);
  begin
    perform place_bid(v_season, v_team_a, v_auction.current_high_bid + 100000);
    raise exception 'SCENARIO 9 FAILED: a team already at maximum squad size was able to place a bid';
  exception when others then
    if sqlerrm not like '%maximum squad size%' then raise; end if;
  end;

  perform test_set_current_user(v_admin);
  perform pg_sleep(3.2);
  perform resolve_expired_player(v_season); -- p4 goes UNSOLD (Team A blocked, Team B never bid)
  perform test_clear_current_user();
  raise notice 'SCENARIO 9 PASSED';
end $$;

-- 10: a team cannot bid without enough safe purse, even for the minimum
-- bid. Deliberately starves Team B's purse directly to isolate this check
-- from every other team/purse interaction in the script.
do $$
declare
  v_admin uuid := test_ctx_get('admin_user');
  v_owner_b uuid := test_ctx_get('owner_b_user');
  v_team_b uuid := test_ctx_get('team_b');
  v_season uuid := test_ctx_get('season');
  v_auction season_auctions%rowtype;
begin
  perform test_set_current_user(v_admin);

  update season_teams set purse_remaining = 50000 where season_id = v_season and team_id = v_team_b;

  -- Nothing is currently on the block (previous block resolved p4) — draw
  -- again; every attempt-1 player is now accounted for (p1 SOLD, p2 SOLD,
  -- p3 UNSOLD, p4 UNSOLD), so this draw performs the round-1 -> round-2
  -- requeue and puts the first round-2 player on the block.
  v_auction := draw_next_player(v_season);
  if not exists (
    select 1 from season_auction_players
    where season_id = v_season and player_id = v_auction.current_player_id and attempt_no = 2
  ) then
    raise exception 'SCENARIO 18 SETUP FAILED: expected this draw to come from the requeued round-2 pool';
  end if;

  perform test_set_current_user(v_owner_b);
  begin
    perform place_bid(v_season, v_team_b, v_auction.current_high_bid + 100000);
    raise exception 'SCENARIO 10 FAILED: a team without enough safe purse was able to place a bid';
  exception when others then
    if sqlerrm not like 'Bid exceeds the maximum safe bid%' then raise; end if;
  end;

  perform test_set_current_user(v_admin);
  perform pg_sleep(3.2);
  perform resolve_expired_player(v_season); -- goes UNSOLD again (nobody eligible bid)
  perform test_clear_current_user();
  raise notice 'SCENARIO 10 & 18(requeue proof) PASSED';
end $$;

-- 22 & 23: pause prevents bidding, resume restores it — exercised on the
-- second (and last) round-2 player, using Team B with its purse restored
-- to a healthy level so the bid itself is unambiguously legal.
do $$
declare
  v_admin uuid := test_ctx_get('admin_user');
  v_owner_b uuid := test_ctx_get('owner_b_user');
  v_team_b uuid := test_ctx_get('team_b');
  v_season uuid := test_ctx_get('season');
  v_auction season_auctions%rowtype;
  v_after_resume timestamptz;
begin
  perform test_set_current_user(v_admin);
  update season_teams set purse_remaining = 5000000 where season_id = v_season and team_id = v_team_b;

  v_auction := draw_next_player(v_season);

  perform pause_manual_auction(v_season);
  if not exists (select 1 from season_auctions where season_id = v_season and status = 'PAUSED') then
    raise exception 'SCENARIO 22 FAILED: pause_manual_auction did not set status to PAUSED';
  end if;

  perform test_set_current_user(v_owner_b);
  begin
    perform place_bid(v_season, v_team_b, v_auction.current_high_bid + 100000);
    raise exception 'SCENARIO 22 FAILED: a bid was accepted while the auction was PAUSED';
  exception when others then
    if sqlerrm not like 'Auction is not accepting bids%' then raise; end if;
  end;

  perform test_set_current_user(v_admin);
  perform resume_manual_auction(v_season);
  select bid_expires_at into v_after_resume from season_auctions where season_id = v_season;
  if not exists (select 1 from season_auctions where season_id = v_season and status = 'RUNNING') then
    raise exception 'SCENARIO 23 FAILED: resume_manual_auction did not return status to RUNNING';
  end if;
  if v_after_resume is null or v_after_resume < now() then
    raise exception 'SCENARIO 23 FAILED: bid_expires_at after resume should be a sensible future deadline, got %', v_after_resume;
  end if;

  perform test_set_current_user(v_owner_b);
  v_auction := place_bid(v_season, v_team_b, v_auction.current_high_bid + 100000);
  if v_auction.current_high_team_id <> v_team_b then
    raise exception 'SCENARIO 23 FAILED: a bid placed after resume should be accepted normally';
  end if;

  perform test_set_current_user(v_admin);
  perform pg_sleep(3.2);
  perform resolve_expired_player(v_season);
  perform test_clear_current_user();
  raise notice 'SCENARIOS 22 & 23 PASSED';
end $$;

-- Final drain: whatever remains must resolve cleanly to COMPLETED, with
-- every pool row left in a terminal state (SOLD or UNSOLD — never PENDING
-- or ON_BLOCK), proving scenario 24 (only completes once both rounds are
-- genuinely exhausted).
do $$
declare
  v_admin uuid := test_ctx_get('admin_user');
  v_season uuid := test_ctx_get('season');
  v_status auction_status;
  v_current uuid;
  v_guard integer := 0;
begin
  perform test_set_current_user(v_admin);

  loop
    v_guard := v_guard + 1;
    if v_guard > 20 then
      raise exception 'SCENARIO 24 FAILED: manual auction did not reach COMPLETED within 20 cycles';
    end if;

    select status, current_player_id into v_status, v_current from season_auctions where season_id = v_season;
    exit when v_status = 'COMPLETED';

    if v_current is null then
      perform draw_next_player(v_season);
      select status into v_status from season_auctions where season_id = v_season;
      exit when v_status = 'COMPLETED';
    end if;

    perform pg_sleep(3.2);
    perform resolve_expired_player(v_season);
  end loop;

  if exists (select 1 from season_auction_players where season_id = v_season and status in ('PENDING', 'ON_BLOCK')) then
    raise exception 'SCENARIO 24 FAILED: auction reached COMPLETED with a non-terminal player row remaining';
  end if;

  perform test_clear_current_user();
  raise notice 'SCENARIO 24 (FINAL COMPLETION) PASSED';
end $$;

do $$ begin raise notice '=== ALL PHASE 1 CHECKS PASSED (fixtures will now be rolled back) ==='; end $$;

rollback;
