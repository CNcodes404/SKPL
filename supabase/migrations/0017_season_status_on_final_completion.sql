-- ─────────────────────────────────────────────────────────────────────────
-- 0017: Season status now completes automatically alongside the Final.
--
-- handle_final_match() already sets seasons.champion_team_id the moment a
-- FINAL match becomes COMPLETED with a decisive score (0001_init.sql), but
-- it never touched seasons.status — so a season stayed 'ACTIVE' forever
-- even after its Final was played (regardless of whether every scheduled
-- regular-season match was played first; playoffs starting early is fine).
--
-- Extends that same trigger to also flip status to 'COMPLETED', and back
-- to 'ACTIVE' if the Final result is later deleted or edited away from a
-- completed decisive Final (mirroring the existing champion_team_id revert
-- branches exactly). Backfills any season that already has a champion
-- recorded but was never marked COMPLETED, since this fix landed after
-- that Final was already played.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function handle_final_match() returns trigger as $$
declare
  winner uuid;
begin
  if tg_op = 'DELETE' then
    if old.match_type = 'FINAL' then
      update seasons set champion_team_id = null, status = 'ACTIVE' where id = old.season_id;
    end if;
    return old;
  end if;

  if new.match_type = 'FINAL' and new.status = 'COMPLETED' then
    if new.team_a_score is null or new.team_b_score is null or new.team_a_score = new.team_b_score then
      raise exception 'A completed Final must have a decisive, non-tied score.';
    end if;
    winner := case when new.team_a_score > new.team_b_score then new.team_a_id else new.team_b_id end;
    update seasons set champion_team_id = winner, status = 'COMPLETED' where id = new.season_id;
  elsif tg_op = 'UPDATE' and old.match_type = 'FINAL'
        and (new.match_type <> 'FINAL' or new.status <> 'COMPLETED') then
    update seasons set champion_team_id = null, status = 'ACTIVE' where id = new.season_id;
  end if;

  return new;
end;
$$ language plpgsql;

-- Backfill: any season whose Final already completed before this fix existed.
update seasons set status = 'COMPLETED' where champion_team_id is not null and status <> 'COMPLETED';
