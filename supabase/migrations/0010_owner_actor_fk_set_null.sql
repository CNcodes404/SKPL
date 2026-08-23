-- started_by/created_by/used_by are audit references to "who did this" —
-- they should never block deleting that auth user later (e.g. a test
-- account). Postgres's default FK behavior is NO ACTION, which silently
-- prevented "Delete user" in the Supabase dashboard from working once
-- someone had started an auction or claimed/created an invite.

alter table season_auctions
  drop constraint season_auctions_started_by_fkey,
  add constraint season_auctions_started_by_fkey
    foreign key (started_by) references auth.users(id) on delete set null;

alter table team_owner_invites
  drop constraint team_owner_invites_created_by_fkey,
  add constraint team_owner_invites_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table team_owner_invites
  drop constraint team_owner_invites_used_by_fkey,
  add constraint team_owner_invites_used_by_fkey
    foreign key (used_by) references auth.users(id) on delete set null;
