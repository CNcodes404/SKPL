-- AI-simulated player auction: retention, owner-configured bidding
-- strategies, and a plpgsql-driven simulation engine that never exposes a
-- team's strategy weights to the client — only the resulting bids.
-- See supabase/README.md and the project plan for the full design rationale.

-- ─────────────────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────────────────

create type auction_player_status as enum ('PENDING', 'ON_BLOCK', 'SOLD', 'UNSOLD');
create type auction_status as enum ('DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED');
create type player_skill_tier as enum ('BEGINNER', 'INTERMEDIATE', 'EXPERT');

-- ─────────────────────────────────────────────────────────────────────────
-- Alterations to existing tables
-- ─────────────────────────────────────────────────────────────────────────

alter table season_teams
  add column purse_total numeric not null default 0 check (purse_total >= 0),
  add column purse_remaining numeric not null default 0 check (purse_remaining >= 0),
  add column retention_submitted boolean not null default false;

alter table season_rosters
  add column price numeric check (price is null or price >= 0),
  add column created_at timestamptz not null default now();

alter table players
  add column skill_tier player_skill_tier,
  add column comparable_player_id uuid references players(id) on delete set null;

-- ─────────────────────────────────────────────────────────────────────────
-- New tables
-- ─────────────────────────────────────────────────────────────────────────

-- Exactly one login per team.
create table team_owner_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  team_id uuid not null unique references teams(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Standing strategy an owner edits anytime. The running auction never reads
-- this table directly — only the immutable per-season snapshot below.
create table team_owner_strategies (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null unique references teams(id) on delete cascade,
  weight_kills numeric not null default 12.5 check (weight_kills between 0 and 100),
  weight_deaths numeric not null default 12.5 check (weight_deaths between 0 and 100),
  weight_flags numeric not null default 12.5 check (weight_flags between 0 and 100),
  weight_kd numeric not null default 12.5 check (weight_kd between 0 and 100),
  weight_winrate numeric not null default 12.5 check (weight_winrate between 0 and 100),
  weight_mvp numeric not null default 12.5 check (weight_mvp between 0 and 100),
  weight_experience numeric not null default 12.5 check (weight_experience between 0 and 100),
  weight_form numeric not null default 12.5 check (weight_form between 0 and 100),
  role_bonus_flagger numeric not null default 1.0 check (role_bonus_flagger between 0.5 and 2.0),
  role_bonus_defender numeric not null default 1.0 check (role_bonus_defender between 0.5 and 2.0),
  role_bonus_all_rounder numeric not null default 1.0 check (role_bonus_all_rounder between 0.5 and 2.0),
  aggressiveness numeric not null default 5 check (aggressiveness between 0 and 10),
  budget_discipline numeric not null default 5 check (budget_discipline between 0 and 10),
  persistence integer not null default 5 check (persistence between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Immutable per-season snapshot, written once by start_auction and never
-- updated again — this is what makes "weights lock at auction start" a real
-- guarantee rather than a UI-level one. Admin-readable only, forever.
create table season_auction_strategies_locked (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  team_id uuid not null references teams(id) on delete restrict,
  weight_kills numeric not null,
  weight_deaths numeric not null,
  weight_flags numeric not null,
  weight_kd numeric not null,
  weight_winrate numeric not null,
  weight_mvp numeric not null,
  weight_experience numeric not null,
  weight_form numeric not null,
  role_bonus_flagger numeric not null,
  role_bonus_defender numeric not null,
  role_bonus_all_rounder numeric not null,
  aggressiveness numeric not null,
  budget_discipline numeric not null,
  persistence integer not null,
  locked_at timestamptz not null default now(),
  unique (season_id, team_id)
);

-- The auction pool for one season, seeded from active players not already
-- on that season's roster (via manual assignment, retention, or a prior
-- auction run — no special-casing needed, it's just "not in season_rosters").
create table season_auction_players (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  player_id uuid not null references players(id) on delete restrict,
  base_price numeric not null check (base_price >= 0),
  player_index numeric,
  index_components jsonb,
  order_no integer,
  status auction_player_status not null default 'PENDING',
  sold_team_id uuid references teams(id),
  sold_price numeric,
  created_at timestamptz not null default now(),
  unique (season_id, player_id)
);

create index idx_sap_season_status on season_auction_players(season_id, status);

-- Bid ticker, also the source of truth advance_auction_bid reads "current
-- highest bid" from indirectly (season_auctions.current_high_bid mirrors it).
create table season_auction_bids (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  player_id uuid not null references players(id) on delete restrict,
  team_id uuid not null references teams(id) on delete restrict,
  amount numeric not null check (amount >= 0),
  round_no integer not null,
  created_at timestamptz not null default now()
);

create index idx_sab_ticker on season_auction_bids(season_id, created_at desc);

-- Owner retention picks, staged before start_auction realizes them into
-- season_rosters. Kept even across a reset so owners don't have to redo them.
create table season_retentions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  player_id uuid not null references players(id) on delete restrict,
  retention_price numeric not null check (retention_price >= 0),
  created_at timestamptz not null default now(),
  unique (season_id, player_id)
);

create index idx_sar_season_team on season_retentions(season_id, team_id);

-- One control row per season. Created in DRAFT at season-creation time when
-- "auction-based roster" is chosen (unlocking owner retention decisions
-- immediately); start_auction later activates it; reset_season_auction
-- returns it to DRAFT without losing retention config/picks.
create table season_auctions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null unique references seasons(id) on delete cascade,
  status auction_status not null default 'DRAFT',
  max_retentions_per_team integer not null default 0 check (max_retentions_per_team >= 0),
  retention_price_increase_pct numeric not null default 0 check (retention_price_increase_pct >= 0),
  purse_default numeric,
  base_price_default numeric,
  min_squad_size integer,
  max_squad_size integer,
  order_strategy text,
  current_player_id uuid references players(id),
  current_high_bid numeric,
  current_high_team_id uuid references teams(id),
  round_no integer not null default 0,
  -- how many times each team has raised for the CURRENT on-block player,
  -- keyed by team_id text; reset to '{}' every time a new player is revealed
  contested_rounds jsonb not null default '{}'::jsonb,
  critical_mode boolean not null default false,
  driver_token uuid,
  driver_heartbeat_at timestamptz,
  started_at timestamptz,
  started_by uuid references auth.users(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint season_auctions_squad_bounds
    check (min_squad_size is null or max_squad_size is null or min_squad_size <= max_squad_size)
);

-- ─────────────────────────────────────────────────────────────────────────
-- Triggers
-- ─────────────────────────────────────────────────────────────────────────

create trigger trg_team_owner_strategies_updated_at before update on team_owner_strategies
  for each row execute function set_updated_at();
create trigger trg_season_auctions_updated_at before update on season_auctions
  for each row execute function set_updated_at();

create function create_default_owner_strategy() returns trigger as $$
begin
  insert into team_owner_strategies (team_id) values (new.team_id)
  on conflict (team_id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_owner_profile_default_strategy
  after insert on team_owner_profiles
  for each row execute function create_default_owner_strategy();

-- ─────────────────────────────────────────────────────────────────────────
-- Auth helper
-- ─────────────────────────────────────────────────────────────────────────

create function is_owner_of_team(p_team_id uuid) returns boolean as $$
  select exists (
    select 1 from team_owner_profiles
    where user_id = auth.uid() and team_id = p_team_id
  );
$$ language sql stable security definer set search_path = public;

-- ─────────────────────────────────────────────────────────────────────────
-- Valuation helper: how much a team is willing to pay for a player right
-- now, given its locked strategy, the player's frozen index, and live
-- roster/purse state. Shared by both normal and critical-mode resolution
-- in advance_auction_bid. Never exposed to clients — only called internally.
-- ─────────────────────────────────────────────────────────────────────────

create function compute_team_max_bid(p_season_id uuid, p_team_id uuid, p_player_id uuid) returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_strategy season_auction_strategies_locked%rowtype;
  v_pool season_auction_players%rowtype;
  v_role player_role;
  v_components jsonb;
  v_stat_score numeric;
  v_team_role_count integer;
  v_team_total_count integer;
  v_pool_role_count integer;
  v_pool_total_count integer;
  v_role_bonus numeric;
  v_role_multiplier numeric;
  v_role_adjusted numeric;
  v_fair_value numeric;
  v_max_willing numeric;
  v_purse_remaining numeric;
  v_max_squad_size integer;
  v_slots_remaining integer;
  v_discipline_reserve numeric := 0;
begin
  select * into v_strategy from season_auction_strategies_locked
    where season_id = p_season_id and team_id = p_team_id;
  if not found then
    return 0;
  end if;

  select * into v_pool from season_auction_players
    where season_id = p_season_id and player_id = p_player_id;
  if not found then
    return 0;
  end if;
  v_components := v_pool.index_components;

  select role into v_role from players where id = p_player_id;

  v_stat_score :=
    coalesce((v_components->>'kills')::numeric, 50) * v_strategy.weight_kills / 100 +
    coalesce((v_components->>'deaths')::numeric, 50) * v_strategy.weight_deaths / 100 +
    coalesce((v_components->>'flags')::numeric, 50) * v_strategy.weight_flags / 100 +
    coalesce((v_components->>'kd')::numeric, 50) * v_strategy.weight_kd / 100 +
    coalesce((v_components->>'winrate')::numeric, 50) * v_strategy.weight_winrate / 100 +
    coalesce((v_components->>'mvp')::numeric, 50) * v_strategy.weight_mvp / 100 +
    coalesce((v_components->>'experience')::numeric, 50) * v_strategy.weight_experience / 100 +
    coalesce((v_components->>'form')::numeric, 50) * v_strategy.weight_form / 100;

  if v_role is null then
    v_role_multiplier := 1.0;
  else
    select count(*) into v_team_total_count from season_rosters
      where season_id = p_season_id and team_id = p_team_id;
    select count(*) into v_team_role_count from season_rosters sr
      join players pl on pl.id = sr.player_id
      where sr.season_id = p_season_id and sr.team_id = p_team_id and pl.role = v_role;

    select count(*) into v_pool_total_count from season_auction_players
      where season_id = p_season_id and status = 'PENDING';
    select count(*) into v_pool_role_count from season_auction_players sap
      join players pl on pl.id = sap.player_id
      where sap.season_id = p_season_id and sap.status = 'PENDING' and pl.role = v_role;

    v_role_bonus := case v_role
      when 'FLAGGER' then v_strategy.role_bonus_flagger
      when 'DEFENDER' then v_strategy.role_bonus_defender
      when 'ALL_ROUNDER' then v_strategy.role_bonus_all_rounder
    end;

    v_role_multiplier := v_role_bonus * (1 + greatest(-1, least(1,
      (v_pool_role_count::numeric / greatest(1, v_pool_total_count)) -
      (v_team_role_count::numeric / greatest(1, v_team_total_count))
    )));
  end if;

  v_role_adjusted := v_stat_score * v_role_multiplier;
  v_fair_value := v_pool.base_price * (0.5 + v_role_adjusted / 50);
  v_max_willing := v_fair_value * (1 + v_strategy.aggressiveness / 10 * 0.8);

  select purse_remaining into v_purse_remaining from season_teams
    where season_id = p_season_id and team_id = p_team_id;
  select max_squad_size into v_max_squad_size from season_auctions where season_id = p_season_id;
  select count(*) into v_team_total_count from season_rosters
    where season_id = p_season_id and team_id = p_team_id;
  v_slots_remaining := v_max_squad_size - v_team_total_count;

  if v_slots_remaining > 1 then
    v_discipline_reserve := v_strategy.budget_discipline / 10 * v_purse_remaining
      * (v_slots_remaining - 1)::numeric / v_slots_remaining;
  end if;

  return greatest(0, least(v_max_willing, v_purse_remaining - v_discipline_reserve));
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- RPCs
-- ─────────────────────────────────────────────────────────────────────────

-- Extends create_season_with_setup with an optional auction path. Dropped
-- and recreated (not CREATE OR REPLACE) because Postgres treats an added
-- parameter as a different signature — replacing avoids a confusing
-- same-name overload existing alongside the original.
drop function if exists create_season_with_setup(
  text, integer, date, date, integer, boolean, integer, integer, integer, integer, uuid[], jsonb, jsonb
);

create function create_season_with_setup(
  p_name text,
  p_season_number integer,
  p_start_date date,
  p_end_date date,
  p_winning_points integer,
  p_close_loss_enabled boolean,
  p_close_loss_points integer,
  p_close_loss_max_difference integer,
  p_playoff_team_count integer,
  p_matches_per_opponent integer,
  p_team_ids uuid[],
  p_rosters jsonb,
  p_matches jsonb,
  p_enable_auction boolean default false,
  p_max_retentions_per_team integer default 0,
  p_retention_price_increase_pct numeric default 0
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id uuid;
  v_team_id uuid;
  v_roster jsonb;
  v_match jsonb;
begin
  if not is_admin() then
    raise exception 'Only administrators can create seasons.';
  end if;

  insert into seasons (
    name, season_number, start_date, end_date,
    winning_points, close_loss_enabled, close_loss_points, close_loss_max_difference,
    playoff_team_count, matches_per_opponent, status
  ) values (
    p_name, p_season_number, p_start_date, p_end_date,
    p_winning_points, p_close_loss_enabled, p_close_loss_points, p_close_loss_max_difference,
    p_playoff_team_count, p_matches_per_opponent, 'ACTIVE'
  ) returning id into v_season_id;

  foreach v_team_id in array p_team_ids loop
    insert into season_teams (season_id, team_id) values (v_season_id, v_team_id);
  end loop;

  for v_roster in select * from jsonb_array_elements(p_rosters) loop
    insert into season_rosters (season_id, team_id, player_id)
    values (
      v_season_id,
      (v_roster->>'team_id')::uuid,
      (v_roster->>'player_id')::uuid
    );
  end loop;

  for v_match in select * from jsonb_array_elements(p_matches) loop
    insert into matches (season_id, team_a_id, team_b_id, scheduled_at, match_type, status)
    values (
      v_season_id,
      (v_match->>'team_a_id')::uuid,
      (v_match->>'team_b_id')::uuid,
      (v_match->>'scheduled_at')::timestamptz,
      'REGULAR_SEASON',
      'SCHEDULED'
    );
  end loop;

  if p_enable_auction then
    insert into season_auctions (season_id, max_retentions_per_team, retention_price_increase_pct)
    values (v_season_id, p_max_retentions_per_team, p_retention_price_increase_pct);
  end if;

  return v_season_id;
end;
$$;

-- Owner (or admin) sets their team's bidding-strategy weights. Weights are
-- normalized to sum to 100 server-side so the client never has to.
create function save_owner_strategy(
  p_team_id uuid,
  p_weights jsonb,
  p_role_bonuses jsonb,
  p_aggressiveness numeric,
  p_budget_discipline numeric,
  p_persistence integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sum numeric;
  v_scale numeric;
begin
  if not (is_admin() or is_owner_of_team(p_team_id)) then
    raise exception 'Only that team''s owner or an administrator can update this strategy.';
  end if;

  v_sum := coalesce((p_weights->>'kills')::numeric, 0) + coalesce((p_weights->>'deaths')::numeric, 0)
         + coalesce((p_weights->>'flags')::numeric, 0) + coalesce((p_weights->>'kd')::numeric, 0)
         + coalesce((p_weights->>'winrate')::numeric, 0) + coalesce((p_weights->>'mvp')::numeric, 0)
         + coalesce((p_weights->>'experience')::numeric, 0) + coalesce((p_weights->>'form')::numeric, 0);

  if v_sum <= 0 then
    raise exception 'At least one weight must be greater than zero.';
  end if;
  v_scale := 100.0 / v_sum;

  insert into team_owner_strategies (
    team_id, weight_kills, weight_deaths, weight_flags, weight_kd, weight_winrate, weight_mvp,
    weight_experience, weight_form, role_bonus_flagger, role_bonus_defender, role_bonus_all_rounder,
    aggressiveness, budget_discipline, persistence
  ) values (
    p_team_id,
    coalesce((p_weights->>'kills')::numeric, 0) * v_scale,
    coalesce((p_weights->>'deaths')::numeric, 0) * v_scale,
    coalesce((p_weights->>'flags')::numeric, 0) * v_scale,
    coalesce((p_weights->>'kd')::numeric, 0) * v_scale,
    coalesce((p_weights->>'winrate')::numeric, 0) * v_scale,
    coalesce((p_weights->>'mvp')::numeric, 0) * v_scale,
    coalesce((p_weights->>'experience')::numeric, 0) * v_scale,
    coalesce((p_weights->>'form')::numeric, 0) * v_scale,
    coalesce((p_role_bonuses->>'flagger')::numeric, 1.0),
    coalesce((p_role_bonuses->>'defender')::numeric, 1.0),
    coalesce((p_role_bonuses->>'all_rounder')::numeric, 1.0),
    p_aggressiveness, p_budget_discipline, p_persistence
  )
  on conflict (team_id) do update set
    weight_kills = excluded.weight_kills,
    weight_deaths = excluded.weight_deaths,
    weight_flags = excluded.weight_flags,
    weight_kd = excluded.weight_kd,
    weight_winrate = excluded.weight_winrate,
    weight_mvp = excluded.weight_mvp,
    weight_experience = excluded.weight_experience,
    weight_form = excluded.weight_form,
    role_bonus_flagger = excluded.role_bonus_flagger,
    role_bonus_defender = excluded.role_bonus_defender,
    role_bonus_all_rounder = excluded.role_bonus_all_rounder,
    aggressiveness = excluded.aggressiveness,
    budget_discipline = excluded.budget_discipline,
    persistence = excluded.persistence,
    updated_at = now();
end;
$$;

-- Owner (or admin) submits which prior-season players to retain (or an
-- empty/null array to explicitly retain none). Always resubmittable until
-- start_auction realizes the picks.
create function save_owner_retentions(
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
      select sr.price into v_last_price
      from season_rosters sr
      join seasons s on s.id = sr.season_id
      where sr.team_id = p_team_id and sr.player_id = v_player_id
        and sr.price is not null and sr.season_id <> p_season_id
      order by s.season_number desc
      limit 1;

      if v_last_price is null then
        raise exception 'Player % has no prior-season price on this team and cannot be retained.', v_player_id;
      end if;

      insert into season_retentions (season_id, team_id, player_id, retention_price)
      values (p_season_id, p_team_id, v_player_id, round(v_last_price * (1 + v_pct / 100.0), 2));
    end loop;
  end if;

  update season_teams set retention_submitted = true
  where season_id = p_season_id and team_id = p_team_id;
end;
$$;

-- Activates a DRAFT season_auctions row: realizes retentions, seeds the
-- pool, locks strategies, and flips to RUNNING. See the plan's "why this
-- can't deadlock" note for the min-squad-size preflight check below.
create function start_auction(
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

  if exists (select 1 from season_teams where season_id = p_season_id and retention_submitted = false) then
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

-- One atomic simulation step: reveal the next player, or resolve one
-- bidding round for the player currently on the block. See the plan for
-- the full state-machine description and the critical-mode invariant proof.
create function advance_auction_bid(p_season_id uuid, p_driver_token uuid) returns season_auctions
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

  -- CRITICAL MODE: only teams still below minimum are eligible, one MUST win
  if v_auction.critical_mode then
    select st.team_id, least(compute_team_max_bid(p_season_id, st.team_id, v_auction.current_player_id), st.purse_remaining)
      into v_chosen_team_id, v_chosen_bid
    from season_teams st
    where st.season_id = p_season_id
      and st.team_id <> coalesce(v_auction.current_high_team_id, v_none)
      and (select count(*) from season_rosters sr where sr.season_id = p_season_id and sr.team_id = st.team_id) < v_auction.min_squad_size
    order by 2 desc
    limit 1;

    if v_chosen_team_id is null then
      v_chosen_team_id := v_auction.current_high_team_id;
    end if;

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

    select * into v_auction from season_auctions where season_id = p_season_id;
    return v_auction;
  end if;

  -- NORMAL MODE
  v_increment := case
    when v_auction.current_high_bid < 100 then 5
    when v_auction.current_high_bid < 300 then 10
    when v_auction.current_high_bid < 600 then 20
    else 50
  end;
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
  loop
    if v_rec.max_bid >= v_next_price and v_rec.rounds < v_rec.persistence then
      v_eligible := v_eligible || jsonb_build_object('team_id', v_rec.team_id, 'max_bid', v_rec.max_bid);
    end if;
  end loop;

  if jsonb_array_length(v_eligible) = 0 then
    if v_auction.current_high_team_id is not null then
      v_price := v_auction.current_high_bid;
      insert into season_rosters (season_id, team_id, player_id, price)
        values (p_season_id, v_auction.current_high_team_id, v_auction.current_player_id, v_price);
      update season_teams set purse_remaining = purse_remaining - v_price
        where season_id = p_season_id and team_id = v_auction.current_high_team_id;
      update season_auction_players set status = 'SOLD', sold_team_id = v_auction.current_high_team_id, sold_price = v_price
        where season_id = p_season_id and player_id = v_auction.current_player_id;
    else
      update season_auction_players set status = 'UNSOLD'
        where season_id = p_season_id and player_id = v_auction.current_player_id;
    end if;

    update season_auctions set
      current_player_id = null, current_high_bid = null, current_high_team_id = null, contested_rounds = '{}'::jsonb
    where season_id = p_season_id;
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

create function pause_auction(p_season_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Only administrators can pause the auction.';
  end if;
  update season_auctions set status = 'PAUSED' where season_id = p_season_id and status = 'RUNNING';
  if not found then
    raise exception 'Auction is not currently running.';
  end if;
end;
$$;

create function resume_auction(p_season_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Only administrators can resume the auction.';
  end if;
  update season_auctions set status = 'RUNNING' where season_id = p_season_id and status = 'PAUSED';
  if not found then
    raise exception 'Auction is not currently paused.';
  end if;
end;
$$;

-- Forces a player straight to UNSOLD, blocked if doing so would make the
-- minimum-squad-size guarantee impossible to satisfy.
create function admin_skip_player(p_season_id uuid, p_player_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_min integer;
  v_shortfall integer;
  v_pool_remaining_excl integer;
begin
  if not is_admin() then
    raise exception 'Only administrators can skip a player.';
  end if;

  select min_squad_size into v_min from season_auctions where season_id = p_season_id;

  select coalesce(sum(greatest(v_min - cnt, 0)), 0) into v_shortfall
  from (
    select st.team_id, count(sr.id) as cnt
    from season_teams st
    left join season_rosters sr on sr.season_id = p_season_id and sr.team_id = st.team_id
    where st.season_id = p_season_id
    group by st.team_id
  ) t;

  select count(*) into v_pool_remaining_excl from season_auction_players
    where season_id = p_season_id and status = 'PENDING' and player_id <> p_player_id;

  if v_pool_remaining_excl < v_shortfall then
    raise exception 'Cannot skip this player — it would make it impossible for every team to reach its minimum squad size.';
  end if;

  update season_auction_players set status = 'UNSOLD'
    where season_id = p_season_id and player_id = p_player_id and status in ('PENDING', 'ON_BLOCK');
  if not found then
    raise exception 'Player is not pending or on the block in this auction.';
  end if;

  update season_auctions set
    current_player_id = null, current_high_bid = null, current_high_team_id = null, contested_rounds = '{}'::jsonb
  where season_id = p_season_id and current_player_id = p_player_id;
end;
$$;

-- Undoes everything an auction run decided (rosters + working tables),
-- keeping config and retention picks intact so owners don't redo them.
create function reset_season_auction(p_season_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Only administrators can reset an auction.';
  end if;

  if not exists (select 1 from season_auctions where season_id = p_season_id and status <> 'DRAFT') then
    raise exception 'This auction has not been started yet.';
  end if;

  delete from season_rosters where season_id = p_season_id;
  delete from season_auction_bids where season_id = p_season_id;
  delete from season_auction_players where season_id = p_season_id;
  delete from season_auction_strategies_locked where season_id = p_season_id;

  update season_teams set purse_total = 0, purse_remaining = 0 where season_id = p_season_id;

  update season_auctions set
    status = 'DRAFT',
    current_player_id = null,
    current_high_bid = null,
    current_high_team_id = null,
    round_no = 0,
    contested_rounds = '{}'::jsonb,
    critical_mode = false,
    driver_token = null,
    driver_heartbeat_at = null,
    started_at = null,
    started_by = null,
    completed_at = null
  where season_id = p_season_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────

alter table team_owner_profiles enable row level security;
alter table team_owner_strategies enable row level security;
alter table season_auction_strategies_locked enable row level security;
alter table season_auction_players enable row level security;
alter table season_auction_bids enable row level security;
alter table season_retentions enable row level security;
alter table season_auctions enable row level security;

create policy "team_owner_profiles_self_read" on team_owner_profiles
  for select using (auth.uid() = user_id or is_admin());

create policy "team_owner_strategies_read" on team_owner_strategies
  for select using (is_admin() or is_owner_of_team(team_id));

create policy "season_auction_strategies_locked_admin_read" on season_auction_strategies_locked
  for select using (is_admin());

create policy "season_auction_players_public_read" on season_auction_players for select using (true);
create policy "season_auction_bids_public_read" on season_auction_bids for select using (true);
create policy "season_retentions_public_read" on season_retentions for select using (true);
create policy "season_auctions_public_read" on season_auctions for select using (true);

-- No public/admin INSERT/UPDATE/DELETE policies are defined for any of the
-- seven tables above, on purpose:
--  - team_owner_profiles: provisioned manually via the SQL editor, like admin_profiles.
--  - every other table: mutated exclusively by the security-definer RPCs above,
--    so a stray client .update() can never corrupt mid-auction state.

-- ─────────────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────────────

grant select on team_owner_profiles, team_owner_strategies, season_auction_strategies_locked to authenticated;
grant select on season_auction_players, season_auction_bids, season_retentions, season_auctions to anon, authenticated;

grant execute on function is_owner_of_team(uuid) to anon, authenticated;
grant execute on function save_owner_strategy(uuid, jsonb, jsonb, numeric, numeric, integer) to authenticated;
grant execute on function save_owner_retentions(uuid, uuid, uuid[]) to authenticated;
grant execute on function start_auction(uuid, numeric, numeric, integer, integer, text, jsonb, jsonb, jsonb) to authenticated;
grant execute on function advance_auction_bid(uuid, uuid) to authenticated;
grant execute on function pause_auction(uuid) to authenticated;
grant execute on function resume_auction(uuid) to authenticated;
grant execute on function admin_skip_player(uuid, uuid) to authenticated;
grant execute on function reset_season_auction(uuid) to authenticated;
grant execute on function create_season_with_setup(
  text, integer, date, date, integer, boolean, integer, integer, integer, integer, uuid[], jsonb, jsonb,
  boolean, integer, numeric
) to authenticated;

-- service_role needs the same explicit grants as everything else in this
-- project (see 0002_grants.sql) — "grant execute on all functions" there
-- already covers the new functions above.
grant all on
  team_owner_profiles, team_owner_strategies, season_auction_strategies_locked,
  season_auction_players, season_auction_bids, season_retentions, season_auctions
to service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Realtime: live updates for the admin Run page and the public viewer
-- ─────────────────────────────────────────────────────────────────────────

alter publication supabase_realtime add table season_auctions;
alter publication supabase_realtime add table season_auction_bids;
alter publication supabase_realtime add table season_auction_players;
alter publication supabase_realtime add table season_teams;
