// Pure merge logic for live match tracking. No imports from '@/…' so the
// Node test runner (tests/liveMerge.test.ts) can load it directly.
import { normalizeName, type RosterPlayerOption } from './screenshotImport'

export interface StatLine {
  kills: number
  deaths: number
  flags: number
}

/** One player as read from a single scoreboard image. */
export interface ExtractedRow extends StatLine {
  game_name: string
  team?: 'red' | 'blue'
}

/**
 * Live state for one player. Smash Karts resets a player's stats to 0 when
 * they reconnect, so finished sessions are banked: total = banked + current.
 */
export interface PlayerLiveState {
  playerId: string
  teamId: string
  banked: StatLine
  current: StatLine
  sessions: number
  /** Present in the most recent capture. */
  onBoard: boolean
  /** Missed at least one capture since last seen — a drop after this is a reconnect. */
  missedCapture: boolean
}

export type LiveState = Record<string, PlayerLiveState>

export type LiveEvent =
  | { type: 'joined'; playerId: string }
  | { type: 'left'; playerId: string }
  | { type: 'reconnected'; playerId: string; banked: StatLine }
  | { type: 'misread'; playerId: string; previous: StatLine; read: StatLine }
  | { type: 'unmatched'; name: string }

export const ZERO: StatLine = { kills: 0, deaths: 0, flags: 0 }
const FIELDS = ['kills', 'deaths', 'flags'] as const

export function addStats(a: StatLine, b: StatLine): StatLine {
  return { kills: a.kills + b.kills, deaths: a.deaths + b.deaths, flags: a.flags + b.flags }
}

export function totalOf(p: PlayerLiveState): StatLine {
  return addStats(p.banked, p.current)
}

function sanitize(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0
}

/** Names on the final results screen carry a numeric prefix, e.g. "147.18-JaguarVortex". */
export function cleanGameName(name: string): string {
  return name.trim().replace(/^\d+(?:\.\d+)?\s*-\s*/, '').trim()
}

/** The spectator's own account shows up as a row; it is never a league player. */
export const SPECTATOR_NAMES = ['spectator']

/** Exact (normalised) match on game name, then registered name. */
export function matchRowToPlayer(name: string, roster: RosterPlayerOption[]): RosterPlayerOption | null {
  const norm = normalizeName(cleanGameName(name))
  return (
    roster.find((p) => p.game_name && normalizeName(p.game_name) === norm) ??
    roster.find((p) => normalizeName(p.name) === norm) ??
    null
  )
}

export interface MatchedRow {
  playerId: string
  teamId: string
  stats: StatLine
}

/** Resolves extracted rows to roster players, dropping the spectator row and reporting names that match no one. */
export function resolveRows(
  rows: ExtractedRow[],
  roster: RosterPlayerOption[],
): { matched: MatchedRow[]; unmatched: string[] } {
  const matched: MatchedRow[] = []
  const unmatched: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const name = cleanGameName(row.game_name ?? '')
    if (!name || SPECTATOR_NAMES.includes(normalizeName(name))) continue
    const player = matchRowToPlayer(name, roster)
    if (!player) {
      unmatched.push(name)
      continue
    }
    if (seen.has(player.id)) continue
    seen.add(player.id)
    matched.push({
      playerId: player.id,
      teamId: player.team_id,
      stats: { kills: sanitize(row.kills), deaths: sanitize(row.deaths), flags: sanitize(row.flags) },
    })
  }
  return { matched, unmatched }
}

/** Every non-zero stat went down — what a reconnect (reset to 0, then some play) looks like. */
function allNonZeroDropped(prev: StatLine, next: StatLine): boolean {
  const nonZero = FIELDS.filter((f) => prev[f] > 0)
  return nonZero.length > 0 && nonZero.every((f) => next[f] < prev[f])
}

function anyDropped(prev: StatLine, next: StatLine): boolean {
  return FIELDS.some((f) => next[f] < prev[f])
}

/**
 * Applies one live capture to the state.
 *
 * - New player → starts a session.
 * - Numbers equal or higher → current session updated.
 * - Numbers dropped and (player missed a capture, or every non-zero stat dropped)
 *   → reconnect: current session is banked and a new one starts.
 * - Any other drop → treated as a misread; the reading is ignored.
 * - Players missing from the capture keep their stats and are marked off the board.
 *
 * An empty capture (scoreboard closed or unreadable) changes nothing.
 */
export function applyLiveCapture(state: LiveState, rows: MatchedRow[]): { state: LiveState; events: LiveEvent[] } {
  if (rows.length === 0) return { state, events: [] }

  const next: LiveState = {}
  const events: LiveEvent[] = []
  const inCapture = new Set(rows.map((r) => r.playerId))

  for (const row of rows) {
    const prev = state[row.playerId]
    if (!prev) {
      next[row.playerId] = {
        playerId: row.playerId,
        teamId: row.teamId,
        banked: { ...ZERO },
        current: { ...row.stats },
        sessions: 1,
        onBoard: true,
        missedCapture: false,
      }
      events.push({ type: 'joined', playerId: row.playerId })
      continue
    }

    if (!anyDropped(prev.current, row.stats)) {
      next[row.playerId] = { ...prev, teamId: row.teamId, current: { ...row.stats }, onBoard: true, missedCapture: false }
    } else if (prev.missedCapture || allNonZeroDropped(prev.current, row.stats)) {
      const banked = addStats(prev.banked, prev.current)
      next[row.playerId] = {
        ...prev,
        teamId: row.teamId,
        banked,
        current: { ...row.stats },
        sessions: prev.sessions + 1,
        onBoard: true,
        missedCapture: false,
      }
      events.push({ type: 'reconnected', playerId: row.playerId, banked: prev.current })
    } else {
      next[row.playerId] = { ...prev, onBoard: true }
      events.push({ type: 'misread', playerId: row.playerId, previous: prev.current, read: row.stats })
    }
  }

  for (const prev of Object.values(state)) {
    if (inCapture.has(prev.playerId)) continue
    next[prev.playerId] = { ...prev, onBoard: false, missedCapture: true }
    if (prev.onBoard) events.push({ type: 'left', playerId: prev.playerId })
  }

  return { state: next, events }
}

export type FinalSource = 'final' | 'final+reconnect' | 'live-only' | 'not-seen'

export interface FinalLine extends StatLine {
  playerId: string
  teamId: string
  source: FinalSource
  warning?: string
}

/**
 * Combines the live state with the end-of-match results screenshot.
 *
 * - Player in the final screenshot → banked + final numbers (the final screen
 *   is the true end of their current session).
 *   - If their numbers dropped versus the last live capture in a reconnect-like
 *     way, the live session is banked too.
 *   - If only some numbers are lower than live, the final value wins and a
 *     warning is raised.
 * - Player not in the final screenshot (left) → their last live total.
 * - Roster players never seen → 0.
 */
export function mergeFinal(state: LiveState, finalRows: MatchedRow[], roster: RosterPlayerOption[]): FinalLine[] {
  const finalById = new Map(finalRows.map((r) => [r.playerId, r]))
  const lines: FinalLine[] = []

  for (const player of roster) {
    const live = state[player.id]
    const fin = finalById.get(player.id)

    if (fin && !live) {
      lines.push({ playerId: player.id, teamId: player.team_id, ...fin.stats, source: 'final' })
    } else if (fin && live) {
      if (!anyDropped(live.current, fin.stats)) {
        lines.push({ playerId: player.id, teamId: player.team_id, ...addStats(live.banked, fin.stats), source: 'final' })
      } else if (live.missedCapture || allNonZeroDropped(live.current, fin.stats)) {
        lines.push({
          playerId: player.id,
          teamId: player.team_id,
          ...addStats(addStats(live.banked, live.current), fin.stats),
          source: 'final+reconnect',
          warning: 'Reconnected after the last live capture — earlier session added.',
        })
      } else {
        lines.push({
          playerId: player.id,
          teamId: player.team_id,
          ...addStats(live.banked, fin.stats),
          source: 'final',
          warning: `Final screenshot is lower than the last live reading (live ${fmt(live.current)}, final ${fmt(fin.stats)}). Check this player.`,
        })
      }
    } else if (live) {
      lines.push({ playerId: player.id, teamId: player.team_id, ...totalOf(live), source: 'live-only' })
    } else {
      lines.push({ playerId: player.id, teamId: player.team_id, ...ZERO, source: 'not-seen' })
    }
  }

  return lines
}

export function fmt(s: StatLine): string {
  return `${s.kills}K/${s.deaths}D/${s.flags}F`
}

export function teamFlags(lines: { teamId: string; flags: number }[], teamId: string): number {
  return lines.filter((l) => l.teamId === teamId).reduce((sum, l) => sum + l.flags, 0)
}

/** Rebuilds live state from rows saved in match_live_stats (resuming after a reload). */
export function stateFromSaved(
  rows: {
    player_id: string
    team_id: string
    banked_kills: number
    banked_deaths: number
    banked_flags: number
    cur_kills: number
    cur_deaths: number
    cur_flags: number
    sessions: number
    on_board: boolean
  }[],
): LiveState {
  const state: LiveState = {}
  for (const r of rows) {
    state[r.player_id] = {
      playerId: r.player_id,
      teamId: r.team_id,
      banked: { kills: r.banked_kills, deaths: r.banked_deaths, flags: r.banked_flags },
      current: { kills: r.cur_kills, deaths: r.cur_deaths, flags: r.cur_flags },
      sessions: r.sessions,
      onBoard: r.on_board,
      missedCapture: !r.on_board,
    }
  }
  return state
}

/** Shape expected by the record_live_stats RPC. */
export function stateToRpcRows(state: LiveState) {
  return Object.values(state).map((p) => ({
    player_id: p.playerId,
    banked_kills: p.banked.kills,
    banked_deaths: p.banked.deaths,
    banked_flags: p.banked.flags,
    cur_kills: p.current.kills,
    cur_deaths: p.current.deaths,
    cur_flags: p.current.flags,
    sessions: p.sessions,
    on_board: p.onBoard,
  }))
}
