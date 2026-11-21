// Pure merge logic for live Solo League tracking. No imports from '@/…' so the
// Node test runner (tests/soloLiveMerge.test.ts) can load it directly.
import { normalizeName, type RosterPlayerOption } from './screenshotImport'

/** A kills rise bigger than this in one reading is held back until a later reading confirms it. */
export const KILL_JUMP_THRESHOLD = 3
/** A drop of up to this many kills is a fall out of the map (the game takes a kill away). */
export const FALL_MAX_DROP = 2

/** Never league players: the in-game bot and the spectator's own row. */
export const IGNORED_SOLO_NAMES = ['bot', 'spectator']

/** One player as read from the scoreboard. Deaths are null when the player's row isn't in the centre panel. */
export interface SoloExtractedRow {
  game_name: string
  kills: number | null
  deaths: number | null
}

export interface SoloReading {
  playerId: string
  kills: number
  deaths: number | null
}

export interface SoloPlayerLive {
  playerId: string
  bankedKills: number
  bankedDeaths: number
  curKills: number
  curDeaths: number
  /** Deaths have been read at least once (the row was in the centre panel). */
  deathsSeen: boolean
  sessions: number
  onBoard: boolean
  /** Missed at least one capture since last seen — a drop after this is a reconnect. */
  missedCapture: boolean
  lastReadKills: number | null
  /** A suspicious reading waiting to be confirmed by the next one. */
  held: { kills: number; count: number } | null
  needsReview: boolean
}

export type SoloLiveState = Record<string, SoloPlayerLive>

export type SoloOutcome = 'FIRST' | 'APPLIED' | 'FALL' | 'HELD' | 'CONFIRMED' | 'RECONNECT'

export interface SoloReadingLog {
  playerId: string
  readKills: number
  readDeaths: number | null
  outcome: SoloOutcome
  /** The player's applied total kills after this reading. */
  totalKills: number
}

export function totalKills(p: SoloPlayerLive): number {
  return p.bankedKills + p.curKills
}

export function totalDeaths(p: SoloPlayerLive): number {
  return p.bankedDeaths + p.curDeaths
}

function toInt(n: unknown): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : null
}

/** Resolves extracted rows to season players, skipping BOT / spectator rows and rows without kills. */
export function resolveSoloRows(
  rows: SoloExtractedRow[],
  roster: RosterPlayerOption[],
): { matched: SoloReading[]; unmatched: string[] } {
  const matched: SoloReading[] = []
  const unmatched: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const name = (row.game_name ?? '').trim()
    const norm = normalizeName(name)
    if (!name || IGNORED_SOLO_NAMES.includes(norm)) continue
    const kills = toInt(row.kills)
    if (kills === null) continue
    const player =
      roster.find((p) => p.game_name && normalizeName(p.game_name) === norm) ?? roster.find((p) => normalizeName(p.name) === norm)
    if (!player) {
      unmatched.push(name)
      continue
    }
    if (seen.has(player.id)) continue
    seen.add(player.id)
    const deaths = toInt(row.deaths)
    matched.push({ playerId: player.id, kills, deaths: deaths === null ? null : Math.max(0, deaths) })
  }
  return { matched, unmatched }
}

/**
 * Applies one scoreboard read. Kills, compared with the player's current
 * session:
 *  - up by 1…threshold → applied
 *  - down by 1…FALL_MAX_DROP → a fall: applied (the website shows the drop) and flagged
 *  - jump beyond those → held back and flagged; applied only when the next
 *    reading confirms it (same or a little higher). A confirmed big drop is
 *    treated as a reconnect.
 *  - after missing a capture, or when deaths went down, a drop is a reconnect:
 *    the old session is banked and flagged.
 * Deaths only move up within a session; null deaths (row not in the centre
 * panel) keep the last known value. Players missing from the read are marked
 * off the board. An empty read changes nothing.
 */
export function applySoloCapture(
  state: SoloLiveState,
  readings: SoloReading[],
  threshold = KILL_JUMP_THRESHOLD,
): { state: SoloLiveState; logs: SoloReadingLog[] } {
  if (readings.length === 0) return { state, logs: [] }

  const next: SoloLiveState = {}
  const logs: SoloReadingLog[] = []
  const inRead = new Set(readings.map((r) => r.playerId))

  for (const r of readings) {
    const prev = state[r.playerId]
    if (!prev) {
      const p: SoloPlayerLive = {
        playerId: r.playerId,
        bankedKills: 0,
        bankedDeaths: 0,
        curKills: r.kills,
        curDeaths: r.deaths ?? 0,
        deathsSeen: r.deaths !== null,
        sessions: 1,
        onBoard: true,
        missedCapture: false,
        lastReadKills: r.kills,
        held: null,
        needsReview: false,
      }
      next[r.playerId] = p
      logs.push({ playerId: r.playerId, readKills: r.kills, readDeaths: r.deaths, outcome: 'FIRST', totalKills: totalKills(p) })
      continue
    }

    const p: SoloPlayerLive = { ...prev, onBoard: true, missedCapture: false, lastReadKills: r.kills }
    const log = (outcome: SoloOutcome) =>
      logs.push({ playerId: r.playerId, readKills: r.kills, readDeaths: r.deaths, outcome, totalKills: totalKills(p) })
    const bank = () => {
      p.bankedKills += prev.curKills
      p.bankedDeaths += prev.curDeaths
      p.curKills = r.kills
      p.curDeaths = r.deaths ?? 0
      p.deathsSeen = r.deaths !== null
      p.sessions = prev.sessions + 1
      p.held = null
      p.needsReview = true
    }

    const delta = r.kills - prev.curKills
    const deathsDropped = r.deaths !== null && prev.deathsSeen && r.deaths < prev.curDeaths
    const consistentWithHeld = (k: number) => prev.held !== null && k - prev.held.kills >= 0 && k - prev.held.kills <= threshold

    if (delta < 0 && (prev.missedCapture || deathsDropped)) {
      bank()
      next[r.playerId] = p
      log('RECONNECT')
      continue
    }

    if (delta >= 0 && delta <= threshold) {
      p.curKills = r.kills
      p.held = null
      if (delta > 0 || r.kills !== prev.lastReadKills) {
        next[r.playerId] = withDeaths(p, prev, r)
        log('APPLIED')
        continue
      }
    } else if (delta < 0 && -delta <= FALL_MAX_DROP) {
      p.curKills = r.kills
      p.held = null
      p.needsReview = true
      next[r.playerId] = withDeaths(p, prev, r)
      log('FALL')
      continue
    } else if (consistentWithHeld(r.kills)) {
      p.needsReview = true
      if (delta > 0) {
        p.curKills = r.kills
        p.held = null
        next[r.playerId] = withDeaths(p, prev, r)
        log('CONFIRMED')
      } else {
        bank()
        next[r.playerId] = p
        log('RECONNECT')
      }
      continue
    } else {
      p.held = { kills: r.kills, count: 1 }
      p.needsReview = true
      next[r.playerId] = withDeaths(p, prev, r)
      log('HELD')
      continue
    }

    next[r.playerId] = withDeaths(p, prev, r)
  }

  for (const prev of Object.values(state)) {
    if (inRead.has(prev.playerId)) continue
    next[prev.playerId] = { ...prev, onBoard: false, missedCapture: true }
  }

  return { state: next, logs }
}

function withDeaths(p: SoloPlayerLive, prev: SoloPlayerLive, r: SoloReading): SoloPlayerLive {
  if (r.deaths === null) return p
  if (!prev.deathsSeen || r.deaths >= prev.curDeaths) return { ...p, curDeaths: r.deaths, deathsSeen: true }
  return p
}

export interface SavedSoloLiveRow {
  player_id: string
  banked_kills: number
  banked_deaths: number
  cur_kills: number
  cur_deaths: number
  deaths_seen: boolean
  sessions: number
  on_board: boolean
  last_read_kills: number | null
  held_kills: number | null
  held_count: number
  needs_review: boolean
}

/** Rebuilds live state from saved rows (resuming after a reload). */
export function soloStateFromSaved(rows: SavedSoloLiveRow[]): SoloLiveState {
  const state: SoloLiveState = {}
  for (const r of rows) {
    state[r.player_id] = {
      playerId: r.player_id,
      bankedKills: r.banked_kills,
      bankedDeaths: r.banked_deaths,
      curKills: r.cur_kills,
      curDeaths: r.cur_deaths,
      deathsSeen: r.deaths_seen,
      sessions: r.sessions,
      onBoard: r.on_board,
      missedCapture: !r.on_board,
      lastReadKills: r.last_read_kills,
      held: r.held_kills === null ? null : { kills: r.held_kills, count: r.held_count },
      needsReview: r.needs_review,
    }
  }
  return state
}

/** Shape expected by the record_solo_live RPC. */
export function soloStateToRpcRows(state: SoloLiveState): SavedSoloLiveRow[] {
  return Object.values(state).map((p) => ({
    player_id: p.playerId,
    banked_kills: p.bankedKills,
    banked_deaths: p.bankedDeaths,
    cur_kills: p.curKills,
    cur_deaths: p.curDeaths,
    deaths_seen: p.deathsSeen,
    sessions: p.sessions,
    on_board: p.onBoard,
    last_read_kills: p.lastReadKills,
    held_kills: p.held?.kills ?? null,
    held_count: p.held?.count ?? 0,
    needs_review: p.needsReview,
  }))
}

export function soloLogsToRpcRows(logs: SoloReadingLog[]) {
  return logs.map((l) => ({
    player_id: l.playerId,
    read_kills: l.readKills,
    read_deaths: l.readDeaths,
    outcome: l.outcome,
    total_kills: l.totalKills,
  }))
}

export const SOLO_OUTCOME_LABELS: Record<SoloOutcome | 'UPLOAD', string> = {
  FIRST: 'First reading',
  APPLIED: 'Applied',
  FALL: 'Fall (kill lost)',
  HELD: 'Held — jump too big',
  CONFIRMED: 'Confirmed big jump',
  RECONNECT: 'Reconnect — earlier kills kept',
  UPLOAD: 'Screenshot upload',
}
