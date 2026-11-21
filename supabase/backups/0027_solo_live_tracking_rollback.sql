-- Rollback for migrations/0027_solo_live_tracking.sql. Run in the SQL Editor.
--
-- Deletes all solo live-tracking data (sessions, live stats, kill readings).
-- Saved round results in solo_round_results are kept.

alter publication supabase_realtime drop table solo_live_stats;
alter publication supabase_realtime drop table solo_live_sessions;

drop function if exists resolve_solo_review(uuid, uuid);
drop function if exists end_solo_live_round(uuid);
drop function if exists record_solo_live(uuid, jsonb, jsonb);
drop function if exists claim_solo_round(uuid);
drop function if exists assert_can_track_solo(uuid, boolean);

drop table if exists solo_kill_readings;
drop table if exists solo_live_stats;
drop table if exists solo_live_sessions;
