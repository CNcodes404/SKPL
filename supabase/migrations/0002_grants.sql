-- Postgres requires a base GRANT in addition to a passing RLS policy —
-- RLS only *restricts* access that the role already has. Without these
-- grants, anon/authenticated get "permission denied" even though the
-- policies would otherwise allow the row.

grant usage on schema public to anon, authenticated;

grant select on
  teams, players, seasons, season_teams, season_rosters, matches, match_player_stats
to anon, authenticated;

grant insert, update, delete on
  teams, players, seasons, season_teams, season_rosters, matches, match_player_stats
to authenticated;

grant select on admin_profiles to authenticated;

grant execute on function is_admin() to anon, authenticated;
grant execute on function create_season_with_setup(
  text, integer, date, date, integer, boolean, integer, integer, integer, integer, uuid[], jsonb, jsonb
) to authenticated;
grant execute on function delete_season_schedule(uuid) to authenticated;
grant execute on function save_match_result(
  uuid, integer, integer, uuid, jsonb, match_status
) to authenticated;

-- service_role bypasses RLS policies, but bypassing RLS is not the same as
-- holding base table privileges — Postgres still checks GRANTs for every
-- role, including service_role. This project's public schema wasn't set up
-- with default privileges for it, so it needs the same explicit grants
-- (used only by local scripts like scripts/seed.ts, never by the browser).
grant usage on schema public to service_role;
grant all on
  teams, players, seasons, season_teams, season_rosters, matches, match_player_stats, admin_profiles
to service_role;
grant execute on all functions in schema public to service_role;
