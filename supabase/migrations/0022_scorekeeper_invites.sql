-- Lets an admin add spectators (scorekeepers) from the admin panel, the same
-- way team owners are invited (0009): the admin creates an invite for an
-- email address and shares the link; the spectator opens it, sets their own
-- password, and is made a scorekeeper. No service_role key is involved.
--
-- Unlike owner invites, a scorekeeper invite is bound to its email: it can
-- only be claimed by an account with that exact email address.

alter table scorekeeper_profiles
  add column email text;

create table scorekeeper_invites (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  email text not null,
  display_name text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz
);

alter table scorekeeper_invites enable row level security;

-- Admin-only; token holders go through the two RPCs below instead.
create policy "scorekeeper_invites_admin_read" on scorekeeper_invites
  for select using (is_admin());
create policy "scorekeeper_invites_admin_write" on scorekeeper_invites
  for insert with check (is_admin());
create policy "scorekeeper_invites_admin_update" on scorekeeper_invites
  for update using (is_admin()) with check (is_admin());

grant select, insert, update on scorekeeper_invites to authenticated;
grant all on scorekeeper_invites to service_role;

-- What the claim page needs to show: whether the link works, and for whom.
create function get_scorekeeper_invite_info(p_token uuid)
returns table (email text, display_name text, valid boolean, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite scorekeeper_invites%rowtype;
begin
  select * into v_invite from scorekeeper_invites where token = p_token;
  if not found then
    return query select null::text, null::text, false, 'This invite link is invalid.';
    return;
  end if;
  if v_invite.revoked_at is not null then
    return query select null::text, null::text, false, 'This invite has been revoked.';
    return;
  end if;
  if v_invite.used_at is not null then
    return query select null::text, null::text, false, 'This invite has already been used.';
    return;
  end if;
  if v_invite.expires_at < now() then
    return query select null::text, null::text, false, 'This invite has expired.';
    return;
  end if;

  return query select v_invite.email, v_invite.display_name, true, null::text;
end;
$$;

-- Called right after the spectator signs up (supabase.auth.signUp from the
-- browser). The account must exist and have the invited email, so a leaked
-- token can't be used to make some other account a scorekeeper.
create function claim_scorekeeper_invite(p_token uuid, p_user_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite scorekeeper_invites%rowtype;
  v_email text;
begin
  select * into v_invite from scorekeeper_invites where token = p_token for update;
  if not found then
    raise exception 'Invalid invite link.';
  end if;
  if v_invite.revoked_at is not null then
    raise exception 'This invite has been revoked.';
  end if;
  if v_invite.used_at is not null then
    raise exception 'This invite has already been used.';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'This invite has expired.';
  end if;

  select u.email into v_email from auth.users u where u.id = p_user_id;
  if v_email is null or lower(v_email) <> lower(v_invite.email) then
    raise exception 'This invite is for %. Use that email address, or ask the admin for a new invite.', v_invite.email;
  end if;

  insert into scorekeeper_profiles (user_id, display_name, email)
  values (p_user_id, v_invite.display_name, v_email)
  on conflict (user_id) do update set display_name = excluded.display_name, email = excluded.email;

  update scorekeeper_invites set used_at = now(), used_by = p_user_id where id = v_invite.id;
end;
$$;

-- Removes a spectator. Deletes their login too (the profile row goes with it
-- via on delete cascade) — unless the same login is also an admin or a team
-- owner, in which case only the scorekeeper access is removed.
create function remove_scorekeeper(p_user_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Only administrators can remove a spectator.';
  end if;

  if not exists (select 1 from scorekeeper_profiles where user_id = p_user_id) then
    return;
  end if;

  delete from scorekeeper_profiles where user_id = p_user_id;

  if exists (select 1 from admin_profiles where user_id = p_user_id)
     or exists (select 1 from team_owner_profiles where user_id = p_user_id) then
    return;
  end if;

  delete from auth.users where id = p_user_id;
end;
$$;

grant execute on function get_scorekeeper_invite_info(uuid) to anon, authenticated;
grant execute on function claim_scorekeeper_invite(uuid, uuid) to anon, authenticated;
revoke execute on function remove_scorekeeper(uuid) from public, anon;
grant execute on function remove_scorekeeper(uuid) to authenticated;
