import { supabase } from '@/lib/supabase'

export interface OwnerProfileInfo {
  team_id: string
  user_id: string
  owner_email: string | null
}

export interface PendingInvite {
  id: string
  team_id: string
  token: string
  invited_email: string | null
  expires_at: string
}

export async function getOwnerProfiles(): Promise<OwnerProfileInfo[]> {
  const { data, error } = await supabase.from('team_owner_profiles').select('team_id, user_id, owner_email')
  if (error) throw error
  return data ?? []
}

/** Pending = not yet used, not revoked, not expired. */
export async function getPendingInvites(): Promise<PendingInvite[]> {
  const { data, error } = await supabase
    .from('team_owner_invites')
    .select('id, team_id, token, invited_email, expires_at')
    .is('used_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
  if (error) throw error
  return data ?? []
}

/** Revokes any still-live invite for the team, then creates a fresh one. Returns the shareable claim URL. */
export async function createOwnerInvite(teamId: string, invitedEmail?: string): Promise<{ token: string; url: string }> {
  const { error: revokeError } = await supabase
    .from('team_owner_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('team_id', teamId)
    .is('used_at', null)
    .is('revoked_at', null)
  if (revokeError) throw revokeError

  const { data, error } = await supabase
    .from('team_owner_invites')
    .insert({ team_id: teamId, invited_email: invitedEmail?.trim() || null })
    .select('token')
    .single()
  if (error) throw error

  return { token: data.token, url: `${window.location.origin}/owner/claim/${data.token}` }
}

export async function revokeOwnerInvite(inviteId: string): Promise<void> {
  const { error } = await supabase
    .from('team_owner_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', inviteId)
  if (error) throw error
}

export async function removeOwner(teamId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_team_owner', { p_team_id: teamId })
  if (error) throw error
}

export interface InviteInfo {
  teamName: string | null
  valid: boolean
  reason: string | null
}

export async function getInviteInfo(token: string): Promise<InviteInfo> {
  const { data, error } = await supabase.rpc('get_invite_info', { p_token: token })
  if (error) throw error
  const row = data?.[0]
  return { teamName: row?.team_name ?? null, valid: row?.valid ?? false, reason: row?.reason ?? null }
}

export async function claimOwnerInvite(token: string, userId: string, email: string): Promise<void> {
  const { error } = await supabase.rpc('claim_owner_invite', { p_token: token, p_user_id: userId, p_email: email })
  if (error) throw error
}
