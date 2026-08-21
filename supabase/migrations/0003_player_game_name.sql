-- Players often compete under an in-game nickname that differs from their
-- registered SKPL name. Storing it lets screenshot-based stat import match
-- deterministically instead of fuzzy-guessing on every match.

alter table players add column game_name text;
