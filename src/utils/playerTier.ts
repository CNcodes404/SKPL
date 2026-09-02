import type { PlayerRole } from '@/types'

export interface PlayerTierResult {
  label: string
}

const ROOKIE_MATCH_THRESHOLD = 3

const TIER_ORDER = ['Beginner', 'Expert', 'Elite', 'Legend'] as const
type TierLabel = (typeof TIER_ORDER)[number]

interface Band {
  min: number
  label: TierLabel
}

function bandLookup(value: number, bands: Band[]): TierLabel {
  let result: TierLabel = 'Beginner'
  for (const b of bands) if (value >= b.min) result = b.label
  return result
}

function weaker(a: TierLabel, b: TierLabel): TierLabel {
  return TIER_ORDER.indexOf(a) <= TIER_ORDER.indexOf(b) ? a : b
}

/**
 * V3 Player Tier formula, retuned 2026-09-02 directly from user-specified
 * raw-stat bands per role (moved away from the pool-normalized composite
 * score, which was too sensitive to who else happened to be in the
 * comparison pool). K/D and Flags/Match here are the player's own raw
 * per-match rates — no normalization against other players at all.
 *
 * DEFENDER — K/D alone decides it ("K/D always tells the truth"; Kills/Match
 * only has "slight importance" per the source feedback, so it isn't
 * factored in as its own gate in this version):
 *   <0.70 Beginner · 0.70-1.10 Expert · 1.10-1.50 Elite · 1.50+ Legend
 *
 * FLAGGER — Flags/Match alone decides it (K/D and Deaths/Match explicitly
 * "matter little" per the source feedback):
 *   <0.5 Beginner · 0.5-1.3 Expert · 1.3-1.7 Elite · 1.7+ Legend
 *
 * ALL_ROUNDER (and no role, as the generalist default) — both Flags/Match
 * and K/D are graded independently on their own (lower, All-Rounder-specific)
 * bands, and the final tier is the WEAKER of the two. This is an inference,
 * not something stated outright: it's the only rule that reproduces every
 * worked example given (a high-K/D/modest-flags player capped at Elite by
 * flags, not pulled up to Legend by K/D; a modest-K/D/solid-flags player
 * capped at Expert by K/D). The stated Flags bands had an unaddressed gap
 * between Expert's "up to 1.1" and Elite's "1.2 and up" — closed here at
 * 1.15 so a 1.18 flags/match example lands in Elite as intended:
 *   Flags/Match: <0.40 Beginner · 0.40-1.15 Expert · 1.15-1.6 Elite · 1.6+ Legend
 *   K/D:         <0.50 Beginner · 0.50-0.70 Expert · 0.70-1.0 Elite · 1.0+ Legend
 *
 * Below the rookie match threshold there isn't enough per-match signal to
 * trust any of this, so those players are Unranked (returns null) rather
 * than assigned a tier — same cutoff as Rating's own rookie handling.
 */
const DEFENDER_KD_BANDS: Band[] = [
  { min: 0, label: 'Beginner' },
  { min: 0.7, label: 'Expert' },
  { min: 1.1, label: 'Elite' },
  { min: 1.5, label: 'Legend' },
]

const FLAGGER_FLAGS_BANDS: Band[] = [
  { min: 0, label: 'Beginner' },
  { min: 0.5, label: 'Expert' },
  { min: 1.3, label: 'Elite' },
  { min: 1.7, label: 'Legend' },
]

const ALL_ROUNDER_FLAGS_BANDS: Band[] = [
  { min: 0, label: 'Beginner' },
  { min: 0.4, label: 'Expert' },
  { min: 1.15, label: 'Elite' },
  { min: 1.6, label: 'Legend' },
]

const ALL_ROUNDER_KD_BANDS: Band[] = [
  { min: 0, label: 'Beginner' },
  { min: 0.5, label: 'Expert' },
  { min: 0.7, label: 'Elite' },
  { min: 1.0, label: 'Legend' },
]

export function computePlayerTier(
  role: PlayerRole | null,
  raw: { kd: number; flagsPerMatch: number } | null | undefined,
  matchesPlayed: number,
): PlayerTierResult | null {
  if (!raw || matchesPlayed < ROOKIE_MATCH_THRESHOLD) return null

  if (role === 'DEFENDER') {
    return { label: bandLookup(raw.kd, DEFENDER_KD_BANDS) }
  }
  if (role === 'FLAGGER') {
    return { label: bandLookup(raw.flagsPerMatch, FLAGGER_FLAGS_BANDS) }
  }

  const flagsTier = bandLookup(raw.flagsPerMatch, ALL_ROUNDER_FLAGS_BANDS)
  const kdTier = bandLookup(raw.kd, ALL_ROUNDER_KD_BANDS)
  return { label: weaker(flagsTier, kdTier) }
}
