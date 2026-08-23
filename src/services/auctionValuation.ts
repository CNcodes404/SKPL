import { supabase } from '@/lib/supabase'
import { listAllStats, listMatchesRaw } from '@/services/matches'
import { calculatePlayerAuctionRawMetrics, type PlayerAuctionRawMetrics } from '@/utils/calculations'
import type { Player, PlayerSkillTier } from '@/types'

export interface PlayerIndexComponents {
  [key: string]: number
  kills: number
  deaths: number
  flags: number
  kd: number
  winrate: number
  mvp: number
  experience: number
  form: number
}

export interface PlayerIndexResult {
  player_index: number
  index_components: PlayerIndexComponents
}

/** Below this many completed matches, a player's own stats aren't trusted — fall back to a comparable player or skill tier. */
const ROOKIE_MATCH_THRESHOLD = 3
/** How much a borrowed comparable-player score is discounted, since it's an estimate rather than the player's own record. */
const COMPARABLE_SCALE = 0.9

const SKILL_TIER_BASELINE: Record<PlayerSkillTier, number> = {
  BEGINNER: 25,
  INTERMEDIATE: 50,
  EXPERT: 75,
}

function minMaxNormalizer(values: number[]): (v: number) => number {
  if (values.length === 0) return () => 50
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (max === min) return () => 50
  return (v: number) => ((v - min) / (max - min)) * 100
}

/** Builds a 0-100 normalizer over `experienced`, transforming both the fitted range and future inputs the same way (so `invert` flips "lower is better" metrics like deaths consistently). */
function buildNormalizer(
  experienced: PlayerAuctionRawMetrics[],
  pick: (m: PlayerAuctionRawMetrics) => number,
  invert = false,
): (v: number) => number {
  const transform = (v: number) => (invert ? -v : v)
  const scaler = minMaxNormalizer(experienced.map((m) => transform(pick(m))))
  return (v: number) => scaler(transform(v))
}

function flatComponents(value: number): PlayerIndexComponents {
  return {
    kills: value,
    deaths: value,
    flags: value,
    kd: value,
    winrate: value,
    mvp: value,
    experience: value,
    form: value,
  }
}

function averageIndex(c: PlayerIndexComponents): number {
  return (c.kills + c.deaths + c.flags + c.kd + c.winrate + c.mvp + c.experience + c.form) / 8
}

/**
 * Computes each pool player's Player Index for an auction: 8 stat
 * sub-scores normalized against the current pool, fed by career-wide match
 * history. Players with too little history (rookies) borrow a comparable
 * player's already-normalized score, or fall back to their admin-set skill
 * tier — neither ever influences the normalization range itself.
 */
export async function computePlayerIndices(poolPlayers: Player[]): Promise<Record<string, PlayerIndexResult>> {
  const [stats, matches] = await Promise.all([listAllStats(), listMatchesRaw()])

  const poolIds = new Set(poolPlayers.map((p) => p.id))
  const comparableIds = [
    ...new Set(
      poolPlayers
        .map((p) => p.comparable_player_id)
        .filter((id): id is string => Boolean(id) && !poolIds.has(id as string)),
    ),
  ]

  let comparablePlayers: Player[] = []
  if (comparableIds.length) {
    const { data, error } = await supabase.from('players').select('*').in('id', comparableIds)
    if (error) throw error
    comparablePlayers = data ?? []
  }

  const raw = new Map<string, PlayerAuctionRawMetrics>()
  for (const player of [...poolPlayers, ...comparablePlayers]) {
    raw.set(player.id, calculatePlayerAuctionRawMetrics(player, stats, matches))
  }

  const experienced = poolPlayers
    .map((p) => raw.get(p.id)!)
    .filter((m) => m.matchesPlayed >= ROOKIE_MATCH_THRESHOLD)

  const normalizers = {
    kills: buildNormalizer(experienced, (m) => m.killsPerMatch),
    deaths: buildNormalizer(experienced, (m) => m.deathsPerMatch, true),
    flags: buildNormalizer(experienced, (m) => m.flagsPerMatch),
    kd: buildNormalizer(experienced, (m) => m.kd),
    winrate: buildNormalizer(experienced, (m) => m.winRate),
    mvp: buildNormalizer(experienced, (m) => m.mvpCount),
    experience: buildNormalizer(experienced, (m) => m.experienceRaw),
    form: buildNormalizer(experienced, (m) => m.formRaw),
  }

  function normalize(m: PlayerAuctionRawMetrics): PlayerIndexComponents {
    return {
      kills: normalizers.kills(m.killsPerMatch),
      deaths: normalizers.deaths(m.deathsPerMatch),
      flags: normalizers.flags(m.flagsPerMatch),
      kd: normalizers.kd(m.kd),
      winrate: normalizers.winrate(m.winRate),
      mvp: normalizers.mvp(m.mvpCount),
      experience: normalizers.experience(m.experienceRaw),
      form: normalizers.form(m.formRaw),
    }
  }

  function scaleComponents(c: PlayerIndexComponents, scale: number): PlayerIndexComponents {
    return {
      kills: c.kills * scale,
      deaths: c.deaths * scale,
      flags: c.flags * scale,
      kd: c.kd * scale,
      winrate: c.winrate * scale,
      mvp: c.mvp * scale,
      experience: c.experience * scale,
      form: c.form * scale,
    }
  }

  const result: Record<string, PlayerIndexResult> = {}

  for (const player of poolPlayers) {
    const m = raw.get(player.id)!
    let components: PlayerIndexComponents

    if (m.matchesPlayed < ROOKIE_MATCH_THRESHOLD) {
      const comparable = player.comparable_player_id ? raw.get(player.comparable_player_id) : undefined
      if (comparable && comparable.matchesPlayed >= ROOKIE_MATCH_THRESHOLD) {
        components = scaleComponents(normalize(comparable), COMPARABLE_SCALE)
      } else {
        components = flatComponents(SKILL_TIER_BASELINE[player.skill_tier ?? 'INTERMEDIATE'])
      }
    } else {
      components = normalize(m)
    }

    result[player.id] = { player_index: averageIndex(components), index_components: components }
  }

  return result
}
