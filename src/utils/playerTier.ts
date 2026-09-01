import type { PlayerRole } from '@/types'

export interface PlayerTierResult {
  label: string
  score: number
}

/**
 * V1 Player Tier formula, confirmed 2026-09-01. Role-specific weighted
 * blend of the already-normalized Rating components (kills/deaths/flags/kd
 * per match, each 0-100 against the pool — see computePlayerIndices in
 * auctionValuation.ts) — deliberately excludes win rate and MVP, which the
 * source spec said don't matter here:
 *   FLAGGER:     55% Flags + 30% Deaths + 15% K/D (kills unweighted)
 *   DEFENDER:    35% K/D + 30% Kills + 25% Deaths + 10% Flags
 *   ALL_ROUNDER: even 50/50 blend of the Flagger and Defender scores above
 *   (no role):   25% each of kills/deaths/flags/kd, as a neutral default
 *
 * Below the rookie match threshold there isn't enough per-match signal to
 * trust any of this, so those players are Unranked (returns null) rather
 * than assigned a tier — same cutoff as Rating's own rookie handling.
 */
const ROOKIE_MATCH_THRESHOLD = 3

type Components = Record<string, number>

function weighted(c: Components, w: { kills?: number; deaths?: number; flags?: number; kd?: number }): number {
  return (c.kills ?? 0) * (w.kills ?? 0) + (c.deaths ?? 0) * (w.deaths ?? 0) + (c.flags ?? 0) * (w.flags ?? 0) + (c.kd ?? 0) * (w.kd ?? 0)
}

const FLAGGER_WEIGHTS = { flags: 0.55, deaths: 0.3, kd: 0.15 }
const DEFENDER_WEIGHTS = { kd: 0.35, kills: 0.3, deaths: 0.25, flags: 0.1 }
const NEUTRAL_WEIGHTS = { kills: 0.25, deaths: 0.25, flags: 0.25, kd: 0.25 }

function tierScore(role: PlayerRole | null, c: Components): number {
  if (role === 'FLAGGER') return weighted(c, FLAGGER_WEIGHTS)
  if (role === 'DEFENDER') return weighted(c, DEFENDER_WEIGHTS)
  if (role === 'ALL_ROUNDER') return 0.5 * weighted(c, FLAGGER_WEIGHTS) + 0.5 * weighted(c, DEFENDER_WEIGHTS)
  return weighted(c, NEUTRAL_WEIGHTS)
}

const TIER_BANDS: { min: number; label: string }[] = [
  { min: 80, label: 'Legend' },
  { min: 65, label: 'Elite' },
  { min: 45, label: 'Expert' },
  { min: 0, label: 'Beginner' },
]

export function computePlayerTier(
  role: PlayerRole | null,
  components: Components | null | undefined,
  matchesPlayed: number,
): PlayerTierResult | null {
  if (!components || matchesPlayed < ROOKIE_MATCH_THRESHOLD) return null
  const score = tierScore(role, components)
  const band = TIER_BANDS.find((b) => score >= b.min)!
  return { label: band.label, score }
}
