-- Lets the client apply computed prices to a manual season's roster rows.
-- The computation itself (retained-price carryover, vacated-price
-- redistribution by rank, category bands for the rest) happens client-side
-- in legacyPricing.ts, same trust model as start_auction's p_player_indices.

create function apply_roster_prices(p_season_id uuid, p_prices jsonb) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid;
begin
  if not is_admin() then
    raise exception 'Only administrators can set roster prices.';
  end if;

  for v_player_id in select jsonb_object_keys(p_prices)::uuid loop
    update season_rosters
    set price = (p_prices->>v_player_id::text)::numeric
    where season_id = p_season_id and player_id = v_player_id;
  end loop;
end;
$$;

grant execute on function apply_roster_prices(uuid, jsonb) to authenticated;
