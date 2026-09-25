-- Rollback for migrations/0021_scorekeeper_live_tracking.sql.
--
-- 0021 only adds new objects, so undoing it is just dropping them. Existing
-- tables (matches, match_player_stats, …) are untouched by this script: any
-- result a scorekeeper already submitted stays, and can be edited or cleared
-- from the admin match page as usual.
--
-- Run in the Supabase SQL Editor.

alter publication supabase_realtime drop table match_live_stats;
alter publication supabase_realtime drop table match_live_sessions;

drop function if exists submit_live_result(uuid, jsonb, jsonb);
drop function if exists record_live_stats(uuid, jsonb, jsonb);
drop function if exists claim_live_match(uuid);
drop function if exists assert_can_track(uuid, boolean);
drop function if exists match_roster(uuid);

drop table if exists match_live_snapshots;
drop table if exists match_live_stats;
drop table if exists match_live_sessions;

drop function if exists is_scorekeeper();
drop table if exists scorekeeper_profiles;
