import { supabase } from '@/lib/supabase'
import type { Player, SoloRound, SoloRoundResult, SoloRoundStatus, SoloSeason } from '@/types'
import { computeSoloStandings, type SoloStandingRow } from '@/utils/soloStandings'

export interface SoloSeasonData {
  season: SoloSeason
  players: Player[]
  rounds: SoloRound[]
  results: SoloRoundResult[]
  standings: SoloStandingRow[]
}

/** All Solo League seasons, newest first. */
export async function listSoloSeasons(): Promise<SoloSeason[]> {
  const { data, error } = await supabase
    .from('solo_seasons')
    .select('*')
    .order('season_number', { ascending: false })
  if (error) throw error
  return data ?? []
}

/** A season with its players, rounds, results and computed standings. Null if not found. */
export async function getSoloSeasonData(seasonId: string): Promise<SoloSeasonData | null> {
  const { data: season, error } = await supabase.from('solo_seasons').select('*').eq('id', seasonId).maybeSingle()
  if (error) throw error
  if (!season) return null
  return (await loadSeasonsData([season]))[0]
}

/** Loads players, rounds and results for several seasons in three queries. */
async function loadSeasonsData(seasons: SoloSeason[]): Promise<SoloSeasonData[]> {
  if (seasons.length === 0) return []
  const seasonIds = seasons.map((s) => s.id)
  const [playersRes, roundsRes] = await Promise.all([
    supabase.from('solo_season_players').select('season_id, players(*)').in('season_id', seasonIds),
    supabase.from('solo_rounds').select('*').in('season_id', seasonIds).order('round_number', { ascending: true }),
  ])
  if (playersRes.error) throw playersRes.error
  if (roundsRes.error) throw roundsRes.error
  const rounds = roundsRes.data ?? []

  let results: SoloRoundResult[] = []
  if (rounds.length > 0) {
    const { data, error } = await supabase
      .from('solo_round_results')
      .select('*')
      .in(
        'round_id',
        rounds.map((r) => r.id),
      )
    if (error) throw error
    results = data ?? []
  }

  return seasons.map((season) => {
    const players = ((playersRes.data ?? []) as any[])
      .filter((row) => row.season_id === season.id && row.players)
      .map((row) => row.players as Player)
      .sort((a, b) => a.name.localeCompare(b.name))
    const seasonRounds = rounds.filter((r) => r.season_id === season.id)
    const roundIds = new Set(seasonRounds.map((r) => r.id))
    const seasonResults = results.filter((r) => roundIds.has(r.round_id))
    const nameById = new Map(players.map((p) => [p.id, p.name]))
    const standings = computeSoloStandings(
      season,
      seasonRounds,
      seasonResults,
      players.map((p) => p.id),
      (id) => nameById.get(id) ?? '',
    )
    return { season, players, rounds: seasonRounds, results: seasonResults, standings }
  })
}

/**
 * The newest season that has at least one completed round, else the newest
 * season. Null when there are no seasons — or when the Solo League tables
 * don't exist yet, so the home page keeps working before the migration runs.
 */
export async function getFeaturedSoloSeason(): Promise<SoloSeasonData | null> {
  try {
    const seasons = await listSoloSeasons()
    if (seasons.length === 0) return null
    const { data: completed, error } = await supabase
      .from('solo_rounds')
      .select('season_id')
      .eq('status', 'COMPLETED')
      .in(
        'season_id',
        seasons.map((s) => s.id),
      )
    if (error) throw error
    const withResults = new Set((completed ?? []).map((r) => r.season_id))
    const featured = seasons.find((s) => withResults.has(s.id)) ?? seasons[0]
    return (await loadSeasonsData([featured]))[0]
  } catch (err) {
    console.error(err)
    return null
  }
}

export interface PlayerSoloSeason {
  data: SoloSeasonData
  row: SoloStandingRow
}

/** Every Solo League season a player is registered for, newest first, with their standing in each. */
export async function getPlayerSoloHistory(playerId: string): Promise<PlayerSoloSeason[]> {
  const { data: entries, error } = await supabase
    .from('solo_season_players')
    .select('season_id, solo_seasons(*)')
    .eq('player_id', playerId)
  if (error) throw error
  const seasons = ((entries ?? []) as any[])
    .map((e) => e.solo_seasons as SoloSeason | null)
    .filter((s): s is SoloSeason => !!s)
    .sort((a, b) => b.season_number - a.season_number)
  const all = await loadSeasonsData(seasons)
  return all
    .map((data) => ({ data, row: data.standings.find((r) => r.playerId === playerId) }))
    .filter((x): x is PlayerSoloSeason => !!x.row)
}

// ── Admin ───────────────────────────────────────────────────────────────

export interface CreateSoloSeasonInput {
  name: string
  season_number: number
  start_date: string | null
  rounds: number
  max_players: number
  points_per_kill: number
  position_points: number[]
  player_ids: string[]
}

export async function createSoloSeason(input: CreateSoloSeasonInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_solo_season', {
    p_name: input.name,
    p_season_number: input.season_number,
    p_start_date: input.start_date,
    p_rounds: input.rounds,
    p_max_players: input.max_players,
    p_points_per_kill: input.points_per_kill,
    p_position_points: input.position_points,
    p_player_ids: input.player_ids,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function setSoloSeasonPlayers(seasonId: string, playerIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('set_solo_season_players', { p_season_id: seasonId, p_player_ids: playerIds })
  if (error) throw new Error(error.message)
}

export async function saveSoloRoundResults(
  roundId: string,
  results: { player_id: string; kills: number; deaths: number }[],
  status: SoloRoundStatus,
): Promise<void> {
  const { error } = await supabase.rpc('save_solo_round_results', {
    p_round_id: roundId,
    p_results: results,
    p_status: status,
  })
  if (error) throw new Error(error.message)
}

export async function updateSoloSeason(
  id: string,
  patch: Partial<Pick<SoloSeason, 'name' | 'status' | 'start_date'>>,
): Promise<void> {
  const { error } = await supabase.from('solo_seasons').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

/** Deletes a season with its rounds and results. */
export async function deleteSoloSeason(id: string): Promise<void> {
  const { error } = await supabase.from('solo_seasons').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** Adds the next round (Round N+1) to a season. */
export async function addSoloRound(seasonId: string, existing: SoloRound[]): Promise<void> {
  const next = Math.max(0, ...existing.map((r) => r.round_number)) + 1
  const { error } = await supabase
    .from('solo_rounds')
    .insert({ season_id: seasonId, round_number: next, name: `Round ${next}` })
  if (error) throw new Error(error.message)
}

/** Deletes a round together with its results. */
export async function deleteSoloRound(roundId: string): Promise<void> {
  const { error } = await supabase.from('solo_rounds').delete().eq('id', roundId)
  if (error) throw new Error(error.message)
}
