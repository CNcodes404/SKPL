import { supabase } from '@/lib/supabase'

export interface SpectatorProfile {
  user_id: string
  display_name: string | null
  email: string | null
  created_at: string
}

export interface PendingSpectatorInvite {
  id: string
  token: string
  email: string
  display_name: string | null
  expires_at: string
}

export function spectatorInviteUrl(token: string): string {
  return `${window.location.origin}/scorekeeper/claim/${token}`
}

export async function getSpectators(): Promise<SpectatorProfile[]> {
  const { data, error } = await supabase
    .from('scorekeeper_profiles')
    .select('user_id, display_name, email, created_at')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

/** Pending = not yet used, not revoked, not expired. */
export async function getPendingSpectatorInvites(): Promise<PendingSpectatorInvite[]> {
  const { data, error } = await supabase
    .from('scorekeeper_invites')
    .select('id, token, email, display_name, expires_at')
    .is('used_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

/** Revokes any still-live invite for this email, then creates a fresh one. Returns the shareable claim URL. */
export async function createSpectatorInvite(email: string, displayName?: string): Promise<{ token: string; url: string }> {
  const normalized = email.trim().toLowerCase()
  const { error: revokeError } = await supabase
    .from('scorekeeper_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('email', normalized)
    .is('used_at', null)
    .is('revoked_at', null)
  if (revokeError) throw revokeError

  const { data, error } = await supabase
    .from('scorekeeper_invites')
    .insert({ email: normalized, display_name: displayName?.trim() || null })
    .select('token')
    .single()
  if (error) throw error

  return { token: data.token, url: spectatorInviteUrl(data.token) }
}

export async function revokeSpectatorInvite(inviteId: string): Promise<void> {
  const { error } = await supabase
    .from('scorekeeper_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', inviteId)
  if (error) throw error
}

/** Deletes the spectator's login (or, if it is also an admin/owner login, just removes spectator access). */
export async function removeSpectator(userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_scorekeeper', { p_user_id: userId })
  if (error) throw error
}

export interface SpectatorInviteInfo {
  email: string | null
  displayName: string | null
  valid: boolean
  reason: string | null
}

export async function getSpectatorInviteInfo(token: string): Promise<SpectatorInviteInfo> {
  const { data, error } = await supabase.rpc('get_scorekeeper_invite_info', { p_token: token })
  if (error) throw error
  const row = data?.[0]
  return {
    email: row?.email ?? null,
    displayName: row?.display_name ?? null,
    valid: row?.valid ?? false,
    reason: row?.reason ?? null,
  }
}

export async function claimSpectatorInvite(token: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('claim_scorekeeper_invite', { p_token: token, p_user_id: userId })
  if (error) throw new Error(error.message)
}
