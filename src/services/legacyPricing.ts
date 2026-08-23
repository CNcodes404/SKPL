import { supabase } from '@/lib/supabase'
import { computePlayerIndices } from '@/services/auctionValuation'
import type { Player } from '@/types'

export interface CategoryBand {
  label: string
  /** 0-1, inclusive lower bound of percentile rank (0 = worst score, 1 = best) that qualifies for this band. */
  minPercentile: number
  price: number
}

/** Top ~25% of players by score -> A, next ~35% -> B, remaining ~40% -> C. Tune per league's economy. */
export const DEFAULT_CATEGORY_BANDS: CategoryBand[] = [
  { label: 'C', minPercentile: 0, price: 1_000_000 },
  { label: 'B', minPercentile: 0.4, price: 2_000_000 },
  { label: 'A', minPercentile: 0.75, price: 3_000_000 },
]

function categoryPrice(score: number, allScores: number[], bands: CategoryBand[]): number {
  const sorted = [...allScores].sort((a, b) => a - b)
  const rank = sorted.filter((s) => s <= score).length
  const percentile = allScores.length <= 1 ? 1 : (rank - 1) / (allScores.length - 1)
  const sortedBands = [...bands].sort((a, b) => a.minPercentile - b.minPercentile)
  let price = sortedBands[0].price
  for (const band of sortedBands) {
    if (percentile >= band.minPercentile) price = band.price
  }
  return price
}

export interface TeamRosterInput {
  teamId: string
  currentPlayerIds: string[]
}

/**
 * Computes a price per player for a manually-assigned season, so retention
 * math always has a valid basis regardless of whether a season used the AI
 * auction. Per team: a player retained from that team's most recent other
 * season keeps their exact prior price; a player new to the team inherits a
 * price vacated by whoever left, ranked by Player Index (best new player ->
 * highest vacated price); anyone left over (squad grew, or no prior season
 * at all) gets a flat category-band price based on their percentile score
 * among everyone being freshly priced this run.
 */
export async function computeManualSeasonPrices(
  seasonId: string,
  teamInputs: TeamRosterInput[],
  bands: CategoryBand[] = DEFAULT_CATEGORY_BANDS,
): Promise<Record<string, number>> {
  const teamIds = teamInputs.map((t) => t.teamId)
  const allPlayerIds = [...new Set(teamInputs.flatMap((t) => t.currentPlayerIds))]

  const [{ data: playersData, error: playersError }, { data: priorRowsData, error: priorError }] = await Promise.all([
    supabase.from('players').select('*').in('id', allPlayerIds),
    supabase
      .from('season_rosters')
      .select('team_id, player_id, price, season_id, seasons(season_number)')
      .in('team_id', teamIds)
      .neq('season_id', seasonId),
  ])
  if (playersError) throw playersError
  if (priorError) throw priorError

  const playersById = new Map((playersData ?? []).map((p) => [p.id, p]))
  const priorRows = (priorRowsData ?? []) as any[]

  const finalPrices: Record<string, number> = {}
  const needsPriceByTeam = new Map<string, string[]>()
  const vacatedPricesByTeam = new Map<string, number[]>()

  for (const { teamId, currentPlayerIds } of teamInputs) {
    const teamPriorRows = priorRows.filter((r) => r.team_id === teamId)
    let anchorRows: any[] = []
    if (teamPriorRows.length > 0) {
      const mostRecentSeasonNumber = Math.max(...teamPriorRows.map((r) => r.seasons?.season_number ?? 0))
      anchorRows = teamPriorRows.filter((r) => (r.seasons?.season_number ?? 0) === mostRecentSeasonNumber)
    }
    const priorPricedMap = new Map<string, number>(
      anchorRows.filter((r) => r.price != null).map((r) => [r.player_id as string, r.price as number]),
    )
    const currentSet = new Set(currentPlayerIds)

    const needsPrice: string[] = []
    for (const playerId of currentPlayerIds) {
      const priorPrice = priorPricedMap.get(playerId)
      if (priorPrice != null) {
        finalPrices[playerId] = priorPrice
      } else {
        needsPrice.push(playerId)
      }
    }

    const vacated: number[] = []
    for (const [playerId, price] of priorPricedMap) {
      if (!currentSet.has(playerId)) vacated.push(price)
    }
    vacated.sort((a, b) => b - a)

    needsPriceByTeam.set(teamId, needsPrice)
    vacatedPricesByTeam.set(teamId, vacated)
  }

  const needsPriceIds = [...needsPriceByTeam.values()].flat()
  const needsPricePlayers = needsPriceIds.map((id) => playersById.get(id)).filter((p): p is Player => Boolean(p))
  const indices = needsPricePlayers.length ? await computePlayerIndices(needsPricePlayers) : {}
  const scoreOf = (playerId: string) => indices[playerId]?.player_index ?? 50
  const allNeedsPriceScores = needsPriceIds.map(scoreOf)

  for (const { teamId } of teamInputs) {
    const needsPrice = needsPriceByTeam.get(teamId) ?? []
    const vacated = vacatedPricesByTeam.get(teamId) ?? []
    const ranked = [...needsPrice].sort((a, b) => scoreOf(b) - scoreOf(a))

    ranked.forEach((playerId, i) => {
      finalPrices[playerId] = i < vacated.length ? vacated[i] : categoryPrice(scoreOf(playerId), allNeedsPriceScores, bands)
    })
  }

  return finalPrices
}

/** Category price per player from already-computed Player Indices — used to seed an auction pool's base prices. */
export function categoryPriceFromIndices(
  players: Player[],
  indices: Record<string, { player_index: number }>,
  bands: CategoryBand[] = DEFAULT_CATEGORY_BANDS,
): Record<string, number> {
  const scores = players.map((p) => indices[p.id]?.player_index ?? 50)
  const result: Record<string, number> = {}
  players.forEach((p, i) => {
    result[p.id] = categoryPrice(scores[i], scores, bands)
  })
  return result
}

export async function applyRosterPrices(seasonId: string, prices: Record<string, number>): Promise<void> {
  if (Object.keys(prices).length === 0) return
  const { error } = await supabase.rpc('apply_roster_prices', { p_season_id: seasonId, p_prices: prices })
  if (error) throw error
}
