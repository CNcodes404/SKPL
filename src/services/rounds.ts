import { supabase } from '@/lib/supabase'
import type { Player, SeasonRound } from '@/types'

export interface RoundWithLineups extends SeasonRound {
  teamIds: string[]
  /** teamId → that team's players for this round */
  lineups: Record<string, Player[]>
}

/** A season's rounds in order, each with its teams and lineups. */
export async function listSeasonRounds(seasonId: string): Promise<RoundWithLineups[]> {
  const { data: rounds, error } = await supabase
    .from('season_rounds')
    .select('*')
    .eq('season_id', seasonId)
    .order('round_number', { ascending: true })
  if (error) throw error
  if (!rounds || rounds.length === 0) return []

  const roundIds = rounds.map((r) => r.id)
  const [{ data: teams, error: teamsError }, { data: rosters, error: rostersError }] = await Promise.all([
    supabase.from('round_teams').select('*').in('round_id', roundIds),
    supabase.from('round_rosters').select('round_id, team_id, created_at, players(*)').in('round_id', roundIds),
  ])
  if (teamsError) throw teamsError
  if (rostersError) throw rostersError

  return rounds.map((round) => {
    const lineups: Record<string, Player[]> = {}
    const teamIds = (teams ?? []).filter((t) => t.round_id === round.id).map((t) => t.team_id)
    for (const teamId of teamIds) lineups[teamId] = []
    for (const row of (rosters ?? []) as any[]) {
      if (row.round_id !== round.id || !row.players) continue
      ;(lineups[row.team_id] ??= []).push(row.players as Player)
    }
    for (const list of Object.values(lineups)) list.sort((a, b) => a.name.localeCompare(b.name))
    return { ...round, teamIds, lineups }
  })
}

/** One round's lineup per team, as { player, team_id } rows. */
export async function getRoundRoster(roundId: string): Promise<{ player: Player; team_id: string }[]> {
  const { data, error } = await supabase.from('round_rosters').select('team_id, players(*)').eq('round_id', roundId)
  if (error) throw error
  return ((data ?? []) as any[]).map((row) => ({ player: row.players as Player, team_id: row.team_id as string }))
}

export async function getRound(roundId: string): Promise<SeasonRound | null> {
  const { data, error } = await supabase.from('season_rounds').select('*').eq('id', roundId).maybeSingle()
  if (error) throw error
  return data
}

/** Every round of every season, for public pages that label matches with their round. */
export async function listRoundsForSeasons(seasonIds: string[]): Promise<SeasonRound[]> {
  if (seasonIds.length === 0) return []
  const { data, error } = await supabase.from('season_rounds').select('*').in('season_id', seasonIds)
  if (error) throw error
  return data ?? []
}

export async function createSeasonRound(seasonId: string, name: string | null, teamIds: string[]): Promise<string> {
  const { data, error } = await supabase.rpc('create_season_round', {
    p_season_id: seasonId,
    p_name: name,
    p_team_ids: teamIds,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function updateSeasonRound(roundId: string, name: string | null, teamIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('update_season_round', { p_round_id: roundId, p_name: name, p_team_ids: teamIds })
  if (error) throw new Error(error.message)
}

export async function setRoundLineup(roundId: string, teamId: string, playerIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('set_round_lineup', {
    p_round_id: roundId,
    p_team_id: teamId,
    p_player_ids: playerIds,
  })
  if (error) throw new Error(error.message)
}

/** Deletes a round together with its matches and their stats. */
export async function deleteSeasonRound(roundId: string): Promise<void> {
  const { error } = await supabase.from('season_rounds').delete().eq('id', roundId)
  if (error) throw new Error(error.message)
}
