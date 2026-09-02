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

/**
 * Every player who has ever been on this team's roster in any season,
 * deduped. No captain flag here on purpose — captaincy is a per-season
 * fact and this list deliberately doesn't infer or aggregate it across
 * seasons.
 */
export async function getTeamHistoricalSquad(teamId: string): Promise<{ player: Player }[]> {
  const { data, error } = await supabase.from('season_rosters').select('player_id, players(*)').eq('team_id', teamId)
  if (error) throw error

  const byPlayer = new Map<string, { player: Player }>()
  for (const row of (data ?? []) as any[]) {
    if (!byPlayer.has(row.player_id)) byPlayer.set(row.player_id, { player: row.players as Player })
  }
  return [...byPlayer.values()]
}

export async function countChampionships(teamId: string): Promise<number> {
  const { count, error } = await supabase
    .from('seasons')
    .select('id', { count: 'exact', head: true })
    .eq('champion_team_id', teamId)
  if (error) throw error
  return count ?? 0
}
