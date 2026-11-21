// Pure Solo League scoring. No imports from '@/…' so the Node test runner
// (tests/soloStandings.test.ts) can load it directly.

export interface SoloScoring {
  points_per_kill: number
  /** position_points[0] is for 1st place; positions past the end score 0. */
  position_points: number[]
}

export interface SoloResultLike {
  round_id: string
  player_id: string
  position: number
  kills: number
  deaths: number
}

export interface SoloRoundLike {
  id: string
  round_number: number
  status: string
}

export interface SoloRoundScore {
  position: number
  kills: number
  deaths: number
  killPoints: number
  positionPoints: number
  total: number
}

export interface SoloStandingRow {
  playerId: string
  rank: number
  roundsPlayed: number
  points: number
  kills: number
  deaths: number
  /** Rounds finished in 1st place. */
  wins: number
  /** Rounds finished in the top 3. */
  podiums: number
  /** Best single-round position, or null if no rounds played. */
  bestFinish: number | null
  mostKillsInRound: number
  /** roundId → that round's score, or null if the player did not play it. */
  perRound: Record<string, SoloRoundScore | null>
}

export function positionPointsFor(scoring: SoloScoring, position: number): number {
  return scoring.position_points[position - 1] ?? 0
}

export function scoreResult(scoring: SoloScoring, result: { position: number; kills: number; deaths: number }): SoloRoundScore {
  const killPoints = result.kills * scoring.points_per_kill
  const positionPoints = positionPointsFor(scoring, result.position)
  return {
    position: result.position,
    kills: result.kills,
    deaths: result.deaths,
    killPoints,
    positionPoints,
    total: killPoints + positionPoints,
  }
}

/**
 * Positions from kills: most kills is 1st, equal kills share a position, and
 * the next player takes the next number (1, 2, 2, 3). Mirrors the dense_rank()
 * in save_solo_round_results so the admin preview matches what gets stored.
 */
export function denseRankByKills<T extends { kills: number }>(rows: T[]): (T & { position: number })[] {
  const distinct = [...new Set(rows.map((r) => r.kills))].sort((a, b) => b - a)
  return rows
    .map((r) => ({ ...r, position: distinct.indexOf(r.kills) + 1 }))
    .sort((a, b) => a.position - b.position)
}

/**
 * Season standings from completed rounds only. Order: total points, then total
 * kills, then best single-round finish, then position in the latest completed
 * round (not playing it counts as worst), then name.
 */
export function computeSoloStandings(
  scoring: SoloScoring,
  rounds: SoloRoundLike[],
  results: SoloResultLike[],
  playerIds: string[],
  nameOf: (playerId: string) => string = (id) => id,
): SoloStandingRow[] {
  const completed = rounds.filter((r) => r.status === 'COMPLETED').sort((a, b) => a.round_number - b.round_number)
  const completedIds = new Set(completed.map((r) => r.id))
  const counted = results.filter((r) => completedIds.has(r.round_id))

  const ids = [...new Set([...playerIds, ...counted.map((r) => r.player_id)])]
  const rows: SoloStandingRow[] = ids.map((playerId) => {
    const perRound: Record<string, SoloRoundScore | null> = {}
    for (const round of completed) perRound[round.id] = null
    const row: SoloStandingRow = {
      playerId,
      rank: 0,
      roundsPlayed: 0,
      points: 0,
      kills: 0,
      deaths: 0,
      wins: 0,
      podiums: 0,
      bestFinish: null,
      mostKillsInRound: 0,
      perRound,
    }
    for (const result of counted) {
      if (result.player_id !== playerId) continue
      const score = scoreResult(scoring, result)
      perRound[result.round_id] = score
      row.roundsPlayed += 1
      row.points += score.total
      row.kills += result.kills
      row.deaths += result.deaths
      if (result.position === 1) row.wins += 1
      if (result.position <= 3) row.podiums += 1
      row.bestFinish = row.bestFinish === null ? result.position : Math.min(row.bestFinish, result.position)
      row.mostKillsInRound = Math.max(row.mostKillsInRound, result.kills)
    }
    return row
  })

  const lastRound = completed[completed.length - 1]
  const lastPosition = (row: SoloStandingRow) =>
    lastRound ? row.perRound[lastRound.id]?.position ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY

  rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.kills - a.kills ||
      (a.bestFinish ?? Number.POSITIVE_INFINITY) - (b.bestFinish ?? Number.POSITIVE_INFINITY) ||
      lastPosition(a) - lastPosition(b) ||
      nameOf(a.playerId).localeCompare(nameOf(b.playerId)),
  )
  rows.forEach((row, i) => (row.rank = i + 1))
  return rows
}

export function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

export const DEFAULT_POSITION_POINTS = [15, 12, 10, 8, 7, 6, 5, 4, 3, 2, 1, 0]
