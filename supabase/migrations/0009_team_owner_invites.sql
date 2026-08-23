-- Lets an admin attach/reassign a team-owner account without ever touching
-- Supabase directly: the admin generates a shareable invite link for a
-- team; whoever opens it sets their own password once and is linked to
-- that team. No service_role key is ever used or exposed to the browser.

alter table team_owner_profiles
  add column owner_email text;

create table team_owner_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  invited_email text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz,
  used_by uuid references auth.users(id),
  revoked_at timestamptz
);

create index idx_team_owner_invites_team on team_owner_invites(team_id);

alter table team_owner_invites enable row level security;

-- Admin-only end to end — no public policy at all. Token holders never
-- query this table directly; they go through the two RPCs below, which
-- return only what a claimant needs, never the full row set (that would
-- let anyone list every live token by querying with no filter).
create policy "team_owner_invites_admin_read" on team_owner_invites
  for select using (is_admin());
create policy "team_owner_invites_admin_write" on team_owner_invites
  for insert with check (is_admin());
create policy "team_owner_invites_admin_update" on team_owner_invites
  for update using (is_admin()) with check (is_admin());

-- Admin can directly detach an owner from a team without waiting for a
-- new invite to be claimed.
create policy "team_owner_profiles_admin_delete" on team_owner_profiles
  for delete using (is_admin());

grant select, insert, update on team_owner_invites to authenticated;
grant all on team_owner_invites to service_role;

-- Minimal, non-enumerable lookup for the public claim page: only tells the
-- claimant which team they're joining and whether the link still works.
create function get_invite_info(p_token uuid) returns table(team_name text, valid boolean, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite team_owner_invites%rowtype;
  v_team_name text;
begin
  select * into v_invite from team_owner_invites where token = p_token;
  if not found then
    return query select null::text, false, 'This invite link is invalid.';
    return;
  end if;
  if v_invite.revoked_at is not null then
    return query select null::text, false, 'This invite has been revoked.';
    return;
  end if;
  if v_invite.used_at is not null then
    return query select null::text, false, 'This invite has already been used.';
    return;
  end if;
  if v_invite.expires_at < now() then
    return query select null::text, false, 'This invite has expired.';
    return;
  end if;

  select name into v_team_name from teams where id = v_invite.team_id;
  return query select v_team_name, true, null::text;
end;
$$;

-- Called right after the claimant signs themselves up (supabase.auth.signUp,
-- called from the browser with the anon key — no service_role involved).
-- The invite token is the authorization; anyone else's session is irrelevant.
create function claim_owner_invite(p_token uuid, p_user_id uuid, p_email text) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite team_owner_invites%rowtype;
begin
  select * into v_invite from team_owner_invites where token = p_token for update;
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

  insert into team_owner_profiles (user_id, team_id, owner_email)
  values (p_user_id, v_invite.team_id, p_email)
  on conflict (team_id) do update set user_id = excluded.user_id, owner_email = excluded.owner_email;

  update team_owner_invites set used_at = now(), used_by = p_user_id where id = v_invite.id;
end;
$$;

grant execute on function get_invite_info(uuid) to anon, authenticated;
grant execute on function claim_owner_invite(uuid, uuid, text) to anon, authenticated;
