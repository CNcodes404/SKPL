-- Player role/skill: Flagger, Defender, or All-Rounder. Nullable since
-- existing players haven't been tagged yet.

create type player_role as enum ('FLAGGER', 'DEFENDER', 'ALL_ROUNDER');

alter table players add column role player_role;
