import { supabase } from '@/lib/supabase'
import type { Player } from '@/types'

export async function listPlayers(includeInactive = false): Promise<Player[]> {
  let query = supabase.from('players').select('*').order('name', { ascending: true })
  if (!includeInactive) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getPlayer(id: string): Promise<Player | null> {
  const { data, error } = await supabase.from('players').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function createPlayer(input: { name: string; image_url?: string | null }): Promise<Player> {
  const { data, error } = await supabase.from('players').insert(input).select().single()
  if (error) throw error
  return data
}

export async function updatePlayer(id: string, input: Partial<Player>): Promise<Player> {
  const { data, error } = await supabase.from('players').update(input).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function setPlayerActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('players').update({ is_active: isActive }).eq('id', id)
  if (error) throw error
}

export interface CareerTotals {
  kills: number
  deaths: number
  flags: number
  matchesPlayed: number
}

/** Aggregates a player's stats across every completed match, in every season. */
export async function getPlayersCareerStats(playerIds: string[]): Promise<Record<string, CareerTotals>> {
  if (playerIds.length === 0) return {}

  const { data, error } = await supabase
    .from('match_player_stats')
    .select('player_id, kills, deaths, flags, matches!inner(status)')
    .in('player_id', playerIds)
    .eq('matches.status', 'COMPLETED')
  if (error) throw error

  const totals: Record<string, CareerTotals> = {}
  for (const id of playerIds) totals[id] = { kills: 0, deaths: 0, flags: 0, matchesPlayed: 0 }

  for (const row of (data ?? []) as any[]) {
    const t = totals[row.player_id]
    if (!t) continue
    t.kills += row.kills
    t.deaths += row.deaths
    t.flags += row.flags
    t.matchesPlayed += 1
  }

  return totals
}
