import { supabase } from '@/lib/supabase'
import { invokeExtractScoreboard } from '@/services/scorekeeper'
import type { Json } from '@/types/database'
import type { Player, SoloKillReading, SoloLiveSession, SoloLiveStat, SoloRound, SoloSeason } from '@/types'
import type { RosterPlayerOption } from '@/utils/screenshotImport'
import {
  soloLogsToRpcRows,
  soloStateToRpcRows,
  type SoloExtractedRow,
  type SoloLiveState,
  type SoloReadingLog,
} from '@/utils/soloLiveMerge'

/** A round's live session counts as being tracked while LIVE and heard from in the last 2 minutes. */
export function isSessionActive(session: Pick<SoloLiveSession, 'status' | 'heartbeat_at'> | null | undefined): boolean {
  return !!session && session.status === 'LIVE' && Date.now() - new Date(session.heartbeat_at).getTime() < 2 * 60 * 1000
}

export interface TrackableSoloRound {
  round: SoloRound
  season: SoloSeason
  session: SoloLiveSession | null
}

/** Rounds a scorekeeper can track: not completed, in a season that isn't completed. Empty if the tables don't exist. */
export async function listTrackableSoloRounds(): Promise<TrackableSoloRound[]> {
  const { data: seasons, error } = await supabase.from('solo_seasons').select('*').neq('status', 'COMPLETED')
  if (error || !seasons || seasons.length === 0) return []
  const { data: rounds, error: roundsError } = await supabase
    .from('solo_rounds')
    .select('*')
    .in(
      'season_id',
      seasons.map((s) => s.id),
    )
    .neq('status', 'COMPLETED')
    .order('round_number', { ascending: true })
  if (roundsError || !rounds || rounds.length === 0) return []
  const { data: sessions } = await supabase
    .from('solo_live_sessions')
    .select('*')
    .in(
      'round_id',
      rounds.map((r) => r.id),
    )
  const seasonById = new Map(seasons.map((s) => [s.id, s]))
  return rounds
    .map((round) => ({
      round,
      season: seasonById.get(round.season_id)!,
      session: (sessions ?? []).find((s) => s.round_id === round.id) ?? null,
    }))
    .sort((a, b) => b.season.season_number - a.season.season_number || a.round.round_number - b.round.round_number)
}

export interface SoloTrackerContext {
  round: SoloRound
  season: SoloSeason
  players: Player[]
  options: RosterPlayerOption[]
}

export async function getSoloTrackerContext(roundId: string): Promise<SoloTrackerContext | null> {
  const { data: round, error } = await supabase.from('solo_rounds').select('*').eq('id', roundId).maybeSingle()
  if (error) throw error
  if (!round) return null
  const [seasonRes, playersRes] = await Promise.all([
    supabase.from('solo_seasons').select('*').eq('id', round.season_id).single(),
    supabase.from('solo_season_players').select('players(*)').eq('season_id', round.season_id),
  ])
  if (seasonRes.error) throw seasonRes.error
  if (playersRes.error) throw playersRes.error
  const players = ((playersRes.data ?? []) as any[])
    .map((r) => r.players as Player)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name))
  return {
    round,
    season: seasonRes.data,
    players,
    options: players.map((p) => ({ id: p.id, name: p.name, game_name: p.game_name, team_id: '' })),
  }
}

export async function claimSoloRound(roundId: string): Promise<SoloLiveSession> {
  const { data, error } = await supabase.rpc('claim_solo_round', { p_round_id: roundId })
  if (error) throw new Error(error.message)
  return data
}

export async function getSoloLiveStats(roundId: string): Promise<SoloLiveStat[]> {
  const { data, error } = await supabase.from('solo_live_stats').select('*').eq('round_id', roundId)
  if (error) throw error
  return data ?? []
}

export async function recordSoloLive(roundId: string, state: SoloLiveState, logs: SoloReadingLog[]): Promise<void> {
  const { error } = await supabase.rpc('record_solo_live', {
    p_round_id: roundId,
    p_stats: soloStateToRpcRows(state) as unknown as Json,
    p_readings: soloLogsToRpcRows(logs) as unknown as Json,
  })
  if (error) throw new Error(error.message)
}

export async function endSoloLiveRound(roundId: string): Promise<void> {
  const { error } = await supabase.rpc('end_solo_live_round', { p_round_id: roundId })
  if (error) throw new Error(error.message)
}

export interface SoloExtractResult {
  scoreboard_visible: boolean
  players: SoloExtractedRow[]
  model: string
}

/** Reads a solo scoreboard with Gemini: one full screenshot, or [player list crop, stats panel crop]. */
export async function extractSoloScoreboard(images: string[], mimeType = 'image/jpeg'): Promise<SoloExtractResult> {
  const data = await invokeExtractScoreboard({ images, mimeType, kind: 'solo' })
  return {
    scoreboard_visible: Boolean(data?.scoreboard_visible),
    players: Array.isArray(data?.players) ? data.players : [],
    model: String(data?.model ?? ''),
  }
}

// ── Public ──────────────────────────────────────────────────────────────

export interface SoloLiveView {
  sessions: SoloLiveSession[]
  stats: SoloLiveStat[]
}

/** Live sessions and stats for a season's rounds. Empty when the tables don't exist yet. */
export async function getSoloLiveView(roundIds: string[]): Promise<SoloLiveView> {
  if (roundIds.length === 0) return { sessions: [], stats: [] }
  const [sessionsRes, statsRes] = await Promise.all([
    supabase.from('solo_live_sessions').select('*').in('round_id', roundIds),
    supabase.from('solo_live_stats').select('*').in('round_id', roundIds),
  ])
  if (sessionsRes.error || statsRes.error) return { sessions: [], stats: [] }
  return { sessions: sessionsRes.data ?? [], stats: statsRes.data ?? [] }
}

export interface LiveSoloRound {
  round: SoloRound
  season: SoloSeason
}

/** Rounds being tracked right now (session LIVE with at least one stat saved). */
export async function listLiveSoloRounds(): Promise<LiveSoloRound[]> {
  const { data: allSessions, error } = await supabase.from('solo_live_sessions').select('*').eq('status', 'LIVE')
  if (error || !allSessions) return []
  // A tracker that stopped sending (closed tab) stops counting as live after a few minutes.
  const sessions = allSessions.filter((s) => Date.now() - new Date(s.heartbeat_at).getTime() < 5 * 60 * 1000)
  if (sessions.length === 0) return []
  const ids = sessions.map((s) => s.round_id)
  const [roundsRes, statsRes] = await Promise.all([
    supabase.from('solo_rounds').select('*').in('id', ids),
    supabase.from('solo_live_stats').select('round_id').in('round_id', ids),
  ])
  if (roundsRes.error || statsRes.error) return []
  const withStats = new Set((statsRes.data ?? []).map((s) => s.round_id))
  const rounds = (roundsRes.data ?? []).filter((r) => r.status !== 'COMPLETED' && withStats.has(r.id))
  if (rounds.length === 0) return []
  const { data: seasons } = await supabase
    .from('solo_seasons')
    .select('*')
    .in(
      'id',
      rounds.map((r) => r.season_id),
    )
  const seasonById = new Map((seasons ?? []).map((s) => [s.id, s]))
  return rounds.filter((r) => seasonById.has(r.season_id)).map((round) => ({ round, season: seasonById.get(round.season_id)! }))
}

export function soloLivePath(live: LiveSoloRound): string {
  return `/solo-league?season=${live.season.id}&tab=rounds&round=${live.round.id}`
}

/** Realtime updates for all solo live tracking; returns an unsubscribe function. */
export function subscribeSoloLive(onChange: () => void, channelName = 'solo-live'): () => void {
  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'solo_live_stats' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'solo_live_sessions' }, onChange)
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}

// ── Admin review ────────────────────────────────────────────────────────

export interface SoloRoundReview {
  session: SoloLiveSession | null
  stats: SoloLiveStat[]
  readings: SoloKillReading[]
}

/** Live session, stats and every kills reading for one round. Empty when nothing was tracked. */
export async function getSoloRoundReview(roundId: string): Promise<SoloRoundReview> {
  const [sessionRes, statsRes, readingsRes] = await Promise.all([
    supabase.from('solo_live_sessions').select('*').eq('round_id', roundId).maybeSingle(),
    supabase.from('solo_live_stats').select('*').eq('round_id', roundId),
    supabase.from('solo_kill_readings').select('*').eq('round_id', roundId).order('id', { ascending: true }),
  ])
  if (sessionRes.error || statsRes.error || readingsRes.error) return { session: null, stats: [], readings: [] }
  return { session: sessionRes.data, stats: statsRes.data ?? [], readings: readingsRes.data ?? [] }
}

export async function resolveSoloReview(roundId: string, playerId: string): Promise<void> {
  const { error } = await supabase.rpc('resolve_solo_review', { p_round_id: roundId, p_player_id: playerId })
  if (error) throw new Error(error.message)
}
