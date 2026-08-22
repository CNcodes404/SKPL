import { supabase } from '@/lib/supabase'
import type { Player, Team } from '@/types'

export async function listTeams(includeInactive = false): Promise<Team[]> {
  let query = supabase.from('teams').select('*').order('name', { ascending: true })
  if (!includeInactive) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getTeam(id: string): Promise<Team | null> {
  const { data, error } = await supabase.from('teams').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function createTeam(input: {
  name: string
  short_name: string
  logo_url?: string | null
  description?: string | null
}): Promise<Team> {
  const { data, error } = await supabase.from('teams').insert(input).select().single()
  if (error) throw error
  return data
}

export async function updateTeam(id: string, input: Partial<Team>): Promise<Team> {
  const { data, error } = await supabase.from('teams').update(input).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function setTeamActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('teams').update({ is_active: isActive }).eq('id', id)
  if (error) throw error
}

export async function getTeamSquad(teamId: string): Promise<{ player: Player; is_captain: boolean }[]> {
  const { data, error } = await supabase
    .from('season_rosters')
    .select('player_id, is_captain, players(*), seasons(season_number)')
    .eq('team_id', teamId)
  if (error) throw error

  const rows = (data ?? []) as any[]
  if (rows.length === 0) return []

  const maxSeasonNumber = Math.max(...rows.map((r) => r.seasons?.season_number ?? 0))
  return rows
    .filter((r) => (r.seasons?.season_number ?? 0) === maxSeasonNumber)
    .map((r) => ({ player: r.players, is_captain: r.is_captain }))
}

export async function countChampionships(teamId: string): Promise<number> {
  const { count, error } = await supabase
    .from('seasons')
    .select('id', { count: 'exact', head: true })
    .eq('champion_team_id', teamId)
  if (error) throw error
  return count ?? 0
}
