import { supabase } from '@/lib/supabase'

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function checkIsAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('admin_profiles')
    .select('is_admin')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return Boolean(data?.is_admin)
}
