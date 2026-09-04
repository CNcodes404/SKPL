-- ─────────────────────────────────────────────────────────────────────────
-- 0019: "Remove Owner" now deletes the underlying login, not just the link.
--
-- Previously the admin's "Remove" button only deleted the team_owner_profiles
-- row, leaving the owner's auth.users account (and their stored owner_email)
-- alive with no team attached — there was no way to actually get rid of the
-- email/account. team_owner_profiles.user_id already references auth.users
-- on delete cascade, so deleting the auth user is sufficient; the profile
-- row (and its owner_email) disappears with it.
-- ─────────────────────────────────────────────────────────────────────────

create function remove_team_owner(p_team_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not is_admin() then
    raise exception 'Only administrators can remove a team owner.';
  end if;

  select user_id into v_user_id from team_owner_profiles where team_id = p_team_id;
  if not found then
    return;
  end if;

  delete from auth.users where id = v_user_id;
end;
$$;

grant execute on function remove_team_owner(uuid) to authenticated;
