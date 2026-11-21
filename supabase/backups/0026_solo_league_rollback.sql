-- Rollback for migrations/0026_solo_league.sql. Run in the SQL Editor.
--
-- WARNING: deletes every Solo League season, round and result.

drop function if exists save_solo_round_results(uuid, jsonb, text);
drop function if exists set_solo_season_players(uuid, uuid[]);
drop function if exists create_solo_season(text, integer, date, integer, integer, integer, integer[], uuid[]);

drop table if exists solo_round_results;
drop function if exists check_solo_result_player();
drop table if exists solo_rounds;
drop table if exists solo_season_players;
drop table if exists solo_seasons;
