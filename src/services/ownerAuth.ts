import { supabase } from '@/lib/supabase'

export { signInWithPassword, signOut } from '@/services/auth'

/** Self-serve signup used only from the invite-claim page — creates the auth account itself, no service_role involved. */
export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
  return data
}

/** Returns the team_id this user owns, or null if they aren't a team owner. */
export async function checkOwnerTeam(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('team_owner_profiles')
    .select('team_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data?.team_id ?? null
}
