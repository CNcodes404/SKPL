import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { getMatchStatsWithPlayers } from '@/services/matches'
import { getSeasonRoster } from '@/services/seasons'
import type { MatchLiveSession, MatchLiveStat, MatchWithTeams, Player } from '@/types'
import type { Json } from '@/types/database'
import type { RosterPlayerOption } from '@/utils/screenshotImport'
import type { ExtractedRow, FinalLine, LiveState } from '@/utils/liveMerge'
import { stateToRpcRows } from '@/utils/liveMerge'

export { signInWithPassword, signOut } from '@/services/auth'

/** False (not an error) when the scorekeeper tables don't exist yet, so other logins keep working. */
export async function checkIsScorekeeper(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('scorekeeper_profiles')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return false
  return Boolean(data)
}

export async function listTrackableMatches(): Promise<{ matches: MatchWithTeams[]; sessions: MatchLiveSession[] }> {
  const [matchesRes, sessionsRes] = await Promise.all([
    supabase
      .from('matches')
      .select('*, team_a:team_a_id(*), team_b:team_b_id(*), mvp_player:mvp_player_id(*)')
      .eq('status', 'SCHEDULED')
      .order('scheduled_at', { ascending: true }),
    supabase.from('match_live_sessions').select('*'),
  ])
  if (matchesRes.error) throw matchesRes.error
  if (sessionsRes.error) throw sessionsRes.error
  return { matches: (matchesRes.data ?? []) as unknown as MatchWithTeams[], sessions: sessionsRes.data ?? [] }
}

export interface TrackerRoster {
  options: RosterPlayerOption[]
  players: Record<string, Player>
}

/** Season matches use the season roster; exhibitions use the players seeded into the match. */
export async function getTrackerRoster(match: MatchWithTeams): Promise<TrackerRoster> {
  const entries = match.season_id
    ? (await getSeasonRoster(match.season_id)).filter((r) => r.team_id === match.team_a_id || r.team_id === match.team_b_id)
    : (await getMatchStatsWithPlayers(match.id)).map((s) => ({ player: s.player, team_id: s.team_id }))

  const options: RosterPlayerOption[] = entries.map((e) => ({
    id: e.player.id,
    name: e.player.name,
    game_name: e.player.game_name,
    team_id: e.team_id,
  }))
  const players = Object.fromEntries(entries.map((e) => [e.player.id, e.player]))
  return { options, players }
}

export async function claimLiveMatch(matchId: string): Promise<MatchLiveSession> {
  const { data, error } = await supabase.rpc('claim_live_match', { p_match_id: matchId })
  if (error) throw new Error(error.message)
  return data
}

export async function getLiveStats(matchId: string): Promise<MatchLiveStat[]> {
  const { data, error } = await supabase.from('match_live_stats').select('*').eq('match_id', matchId)
  if (error) throw error
  return data ?? []
}

export interface LiveStatWithPlayer extends MatchLiveStat {
  player: Player
}

/** Public view of a match's live tracking: the session (if any) and live rows with player details. */
export async function getPublicLiveView(
  matchId: string,
): Promise<{ session: MatchLiveSession | null; rows: LiveStatWithPlayer[] }> {
  const [sessionRes, rowsRes] = await Promise.all([
    supabase.from('match_live_sessions').select('*').eq('match_id', matchId).maybeSingle(),
    supabase.from('match_live_stats').select('*, player:player_id(*)').eq('match_id', matchId),
  ])
  // Tables missing (migration not applied yet) → simply no live view.
  if (sessionRes.error || rowsRes.error) return { session: null, rows: [] }
  return { session: sessionRes.data, rows: (rowsRes.data ?? []) as unknown as LiveStatWithPlayer[] }
}

export async function recordLiveStats(matchId: string, state: LiveState, extracted: Json | null): Promise<void> {
  const { error } = await supabase.rpc('record_live_stats', {
    p_match_id: matchId,
    p_stats: stateToRpcRows(state),
    p_extracted: extracted,
  })
  if (error) throw new Error(error.message)
}

export async function submitLiveResult(matchId: string, lines: FinalLine[], extracted: Json | null): Promise<void> {
  const { error } = await supabase.rpc('submit_live_result', {
    p_match_id: matchId,
    p_stats: lines.map((l) => ({ player_id: l.playerId, kills: l.kills, deaths: l.deaths, flags: l.flags })),
    p_extracted: extracted,
  })
  if (error) throw new Error(error.message)
}

export interface ExtractResult {
  scoreboard_visible: boolean
  players: ExtractedRow[]
  model: string
}

/** Sends one image to the extract-scoreboard Edge Function (Gemini runs server-side). */
export async function extractScoreboard(image: string, kind: 'live' | 'final', mimeType = 'image/jpeg'): Promise<ExtractResult> {
  const { data, error } = await supabase.functions.invoke('extract-scoreboard', { body: { image, mimeType, kind } })
  if (error) {
    let message = error.message
    if (error instanceof FunctionsHttpError) {
      try {
        const body = await error.context.json()
        message = body.error ?? message
        if (Array.isArray(body.details) && body.details.length) message += ` (${body.details.join('; ')})`
      } catch {
        // Keep the generic message.
      }
    }
    throw new Error(message)
  }
  return {
    scoreboard_visible: Boolean(data?.scoreboard_visible),
    players: Array.isArray(data?.players) ? data.players : [],
    model: String(data?.model ?? ''),
  }
}

/** Live updates for a match's stats; returns an unsubscribe function. */
export function subscribeLiveStats(matchId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`match-live-${matchId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'match_live_stats', filter: `match_id=eq.${matchId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'match_live_sessions', filter: `match_id=eq.${matchId}` }, onChange)
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}
