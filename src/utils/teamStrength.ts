import { computePlayerIndices, type PlayerIndexComponents } from '@/services/auctionValuation'
import type { AuctionTeamSummary } from '@/services/auction'
import type { Player, PlayerRole, SeasonAuctionPlayer } from '@/types'

export interface TeamStrengthResult {
  /** null until the team has bought at least one player — shown as "—". */
  current: number | null
  expected: number | null
}

/**
 * V1 Team Strength formula, confirmed 2026-09-01. Isolated here so the
 * weights/targets below can be retuned without touching call sites.
 *
 * Player Quality (0-100, role-weighted blend of Rating + normalized K/D,
 * Avg Kills, Win Rate, Avg Flags):
 *   DEFENDER:    40% K/D + 30% Rating + 10% Avg Kills + 10% Win Rate + 10% Avg Flags
 *   FLAGGER:     35% Avg Flags + 25% K/D + 20% Rating + 10% Avg Kills + 10% Win Rate
 *   ALL_ROUNDER: 30% K/D + 25% Rating + 20% Avg Flags + 15% Avg Kills + 10% Win Rate
 *   (no role set): 30% K/D + 30% Rating + 15% Avg Kills + 15% Win Rate + 10% Avg Flags
 *
 * Role Balance (0-100) = 60% Composition Fit + 40% Role Effectiveness:
 *   Composition Fit targets 60-70% Defenders / 30-40% Flaggers for a
 *   roster with no All-Rounders, or 30/40/30 Defender/All-Rounder/Flagger
 *   once any All-Rounder is on the roster. Deviation outside the target is
 *   penalized 1.0x (Defender) / 1.2x (All-Rounder) / 1.5x (Flagger), since
 *   an over-stacked Flagger roster should hurt more than an over-stacked
 *   Defender one. An empty roster scores neutral (100).
 *   Role Effectiveness is not separately defined by the source spec — it's
 *   taken as the same average Player Quality used below, so Current
 *   Strength reduces to an 85/15 blend of Quality/Composition Fit.
 *
 * Current Strength  = 75% avg Player Quality (current roster) + 25% Role Balance (current roster)
 * Expected Strength  = same formula, but projected: if the roster is below
 *   the auction's minimum squad size, fill remaining slots with the
 *   highest-Rating PENDING pool players before scoring. Already-at-or-past
 *   minimum rosters score Expected == Current.
 */

const ROLE_WEIGHTS: Record<PlayerRole, { kd: number; rating: number; avgKills: number; winRate: number; avgFlags: number }> = {
  DEFENDER: { kd: 0.4, rating: 0.3, avgKills: 0.1, winRate: 0.1, avgFlags: 0.1 },
  FLAGGER: { avgFlags: 0.35, kd: 0.25, rating: 0.2, avgKills: 0.1, winRate: 0.1 },
  ALL_ROUNDER: { kd: 0.3, rating: 0.25, avgFlags: 0.2, avgKills: 0.15, winRate: 0.1 },
}
const NO_ROLE_WEIGHTS = { kd: 0.3, rating: 0.3, avgKills: 0.15, winRate: 0.15, avgFlags: 0.1 }

function playerQuality(role: PlayerRole | null, components: PlayerIndexComponents, rating: number): number {
  const w = role ? ROLE_WEIGHTS[role] : NO_ROLE_WEIGHTS
  return components.kd * w.kd + rating * w.rating + components.kills * w.avgKills + components.winrate * w.winRate + components.flags * w.avgFlags
}

function compositionFit(roles: (PlayerRole | null)[]): number {
  const total = roles.length
  if (total === 0) return 100

  const counts = { DEFENDER: 0, FLAGGER: 0, ALL_ROUNDER: 0 }
  for (const r of roles) if (r) counts[r]++
  const pct = (n: number) => (n / total) * 100

  let penalty: number
  if (counts.ALL_ROUNDER > 0) {
    penalty =
      Math.abs(pct(counts.DEFENDER) - 30) * 1.0 +
      Math.abs(pct(counts.ALL_ROUNDER) - 40) * 1.2 +
      Math.abs(pct(counts.FLAGGER) - 30) * 1.5
  } else {
    const dPct = pct(counts.DEFENDER)
    const fPct = pct(counts.FLAGGER)
    const dDeviation = dPct < 60 ? 60 - dPct : dPct > 70 ? dPct - 70 : 0
    const fDeviation = fPct < 30 ? 30 - fPct : fPct > 40 ? fPct - 40 : 0
    penalty = dDeviation * 1.0 + fDeviation * 1.5
  }
  return Math.max(0, 100 - penalty)
}

function scoreRoster<T extends { role: PlayerRole | null }>(roster: T[], qualityOfEntry: (r: T) => number): number {
  if (roster.length === 0) return 0
  const avgQuality = roster.reduce((sum, r) => sum + qualityOfEntry(r), 0) / roster.length
  const roleBalance = 0.6 * compositionFit(roster.map((r) => r.role)) + 0.4 * avgQuality
  return 0.75 * avgQuality + 0.25 * roleBalance
}

/**
 * Computes Current/Expected Strength for every team in a season. Reuses
 * computePlayerIndices() (the same Rating calculation shown on the block)
 * over the combined set of rostered + remaining-pool players, so Rating is
 * consistent between the two screens.
 */
export async function computeTeamStrengths(
  teamSummaries: AuctionTeamSummary[],
  pool: (SeasonAuctionPlayer & { player: Player })[],
  minSquadSize: number | null,
): Promise<Record<string, TeamStrengthResult>> {
  const combined = new Map<string, Player>()
  for (const t of teamSummaries) for (const r of t.roster) combined.set(r.player.id, r.player)
  for (const p of pool) combined.set(p.player.id, p.player)

  const indices = await computePlayerIndices([...combined.values()])
  const qualityOf = (playerId: string, role: PlayerRole | null): number => {
    const idx = indices[playerId]
    if (!idx) return 0
    return playerQuality(role, idx.index_components, idx.player_index)
  }

  const pendingByRating = pool
    .filter((p) => p.status === 'PENDING')
    .slice()
    .sort((a, b) => (indices[b.player.id]?.player_index ?? 0) - (indices[a.player.id]?.player_index ?? 0))

  const rosteredIds = new Set(teamSummaries.flatMap((t) => t.roster.map((r) => r.player.id)))

  // Each team's projection independently draws from the same remaining
  // pool (an "if I get the best of what's left" ceiling, not a shared
  // draft simulation), so every team can see the same top candidates.
  const availablePool = pendingByRating.filter((p) => !rosteredIds.has(p.player.id))

  const result: Record<string, TeamStrengthResult> = {}
  for (const team of teamSummaries) {
    const currentRoster = team.roster.map((r) => ({ role: r.player.role, id: r.player.id }))
    if (currentRoster.length === 0) {
      result[team.team.id] = { current: null, expected: null }
      continue
    }
    const current = scoreRoster(currentRoster, (r) => qualityOf(r.id, r.role))

    const remainingSlots = minSquadSize != null ? Math.max(0, minSquadSize - currentRoster.length) : 0
    let expected: number | null = current
    if (remainingSlots > 0) {
      const projectedAdds = availablePool.slice(0, remainingSlots).map((p) => ({ role: p.player.role, id: p.player.id }))
      if (projectedAdds.length > 0) {
        expected = scoreRoster([...currentRoster, ...projectedAdds], (r) => qualityOf(r.id, r.role))
      }
    }

    result[team.team.id] = { current, expected }
  }

  return result
}
