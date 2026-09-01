import { supabase } from '@/lib/supabase'
import { computePlayerIndices } from '@/services/auctionValuation'
import { listPlayers } from '@/services/players'
import { getSeasonRosterRows } from '@/services/seasons'
import type { AuctionStatus, PlayerDrawModeType, SeasonAuction } from '@/types'

export interface StartManualAuctionParams {
  seasonId: string
  purseDefault: number
  minSquadSize: number
  maxSquadSize: number
  orderStrategy: 'RANDOM' | 'INDEX_DESC' | 'ROLE_GROUPED'
  playerDrawMode: PlayerDrawModeType
  initialBidIncrement: number
  incrementStepRange: number
  incrementIncrease: number
  bidTimerSeconds: number
  purseOverrides?: { team_id: string; purse_total: number }[]
  basePriceDefault?: number
  basePriceOverrides?: Record<string, number>
}

/** Activates a DRAFT season_auctions row as a Manual/Live auction. Never
 * locks AI strategies and never invokes any AI valuation logic — the
 * manual-mode sibling of startAuction() in services/auction.ts. Computes
 * Rating (player_index/index_components) for the pool the same way
 * startAuction() does, so it's frozen in from the start instead of staying
 * null for the whole auction (informational only — never required for
 * bidding, same as the SQL comment on start_manual_auction notes). */
export async function startManualAuction(params: StartManualAuctionParams): Promise<void> {
  const [activePlayers, rosterRows] = await Promise.all([listPlayers(false), getSeasonRosterRows(params.seasonId)])
  const rosteredIds = new Set(rosterRows.map((r) => r.player_id))
  const poolPlayers = activePlayers.filter((p) => !rosteredIds.has(p.id))
  const playerIndices = await computePlayerIndices(poolPlayers)

  const { error } = await supabase.rpc('start_manual_auction', {
    p_season_id: params.seasonId,
    p_purse_default: params.purseDefault,
    p_min_squad_size: params.minSquadSize,
    p_max_squad_size: params.maxSquadSize,
    p_order_strategy: params.orderStrategy,
    p_player_draw_mode: params.playerDrawMode,
    p_initial_bid_increment: params.initialBidIncrement,
    p_increment_step_range: params.incrementStepRange,
    p_increment_increase: params.incrementIncrease,
    p_bid_timer_seconds: params.bidTimerSeconds,
    p_purse_overrides: params.purseOverrides ?? [],
    p_base_price_default: params.basePriceDefault ?? null,
    p_base_price_overrides: params.basePriceOverrides ?? {},
    p_player_indices: playerIndices,
  })
  if (error) throw error
}

/** Reveals the next player: automatically (AUTO draw mode) or the
 * admin-chosen one (MANUAL draw mode, pass playerId). */
export async function drawNextPlayer(seasonId: string, playerId?: string | null): Promise<SeasonAuction> {
  const { data, error } = await supabase.rpc('draw_next_player', {
    p_season_id: seasonId,
    p_player_id: playerId ?? null,
  })
  if (error) throw error
  return data as SeasonAuction
}

/** Admin-triggered, but Postgres-verified: a call before the deadline
 * (+ 1s grace) is a safe no-op, so this is safe to poll from the live
 * screen without any risk of resolving a player early. */
export async function resolveExpiredPlayer(seasonId: string): Promise<SeasonAuction> {
  const { data, error } = await supabase.rpc('resolve_expired_player', { p_season_id: seasonId })
  if (error) throw error
  return data as SeasonAuction
}

/** The only entry point through which a human bid is ever recorded. The
 * server independently re-verifies team ownership, auction/player state,
 * expiry, minimum bid, and maximum safe bid from authoritative database
 * state — nothing here is trusted beyond the amount the owner typed. */
export async function placeBid(seasonId: string, teamId: string, amount: number): Promise<SeasonAuction> {
  const { data, error } = await supabase.rpc('place_bid', {
    p_season_id: seasonId,
    p_team_id: teamId,
    p_amount: amount,
  })
  if (error) throw error
  return data as SeasonAuction
}

export interface OwnerAuctionSeasonInfo {
  seasonId: string
  seasonName: string
  status: AuctionStatus
}

/** The most recently created Manual-mode auction that this team is part
 * of — lets the owner screen land directly on the right season with no
 * picker, since a team is realistically only ever in one live manual
 * auction at a time. season_teams and season_auctions have no direct FK
 * to each other (both reference seasons), so this is a two-step lookup,
 * same pattern already used in services/players.ts. */
export async function getActiveManualAuctionSeasonForTeam(teamId: string): Promise<OwnerAuctionSeasonInfo | null> {
  const { data: teamSeasons, error: teamSeasonsError } = await supabase
    .from('season_teams')
    .select('season_id')
    .eq('team_id', teamId)
  if (teamSeasonsError) throw teamSeasonsError

  const seasonIds = (teamSeasons ?? []).map((row) => row.season_id)
  if (seasonIds.length === 0) return null

  const { data, error } = await supabase
    .from('season_auctions')
    .select('season_id, status, seasons(name)')
    .eq('auction_mode', 'MANUAL')
    .in('season_id', seasonIds)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  return {
    seasonId: data.season_id,
    seasonName: (data as any).seasons?.name ?? '',
    status: data.status,
  }
}

/** Freezes the remaining countdown (stored server-side) rather than letting
 * the original deadline keep expiring underneath the pause. */
export async function pauseManualAuction(seasonId: string): Promise<void> {
  const { error } = await supabase.rpc('pause_manual_auction', { p_season_id: seasonId })
  if (error) throw error
}

/** Restores the frozen remaining countdown from where pause left off. */
export async function resumeManualAuction(seasonId: string): Promise<void> {
  const { error } = await supabase.rpc('resume_manual_auction', { p_season_id: seasonId })
  if (error) throw error
}

/**
 * Display-only mirror of place_bid's minimum-next-bid formula. The opening
 * bid on a freshly-drawn player is allowed at exactly the base price — the
 * increment schedule (initial + floor((current-starting)/stepRange) *
 * increase) only applies once a bid actually exists (hasHighBidder). Never
 * used to gate anything — place_bid re-derives and enforces this itself
 * from authoritative database state. Purely so the admin/owner/spectator
 * UI can show "next minimum bid" without waiting on a round-trip.
 */
export function calculateMinimumNextBid(
  currentBid: number,
  startingPrice: number,
  initialIncrement: number,
  incrementStepRange: number,
  incrementIncrease: number,
  hasHighBidder: boolean,
): number {
  if (!hasHighBidder) return startingPrice
  if (!incrementStepRange || incrementStepRange <= 0) return currentBid + initialIncrement
  const increment = initialIncrement + Math.floor((currentBid - startingPrice) / incrementStepRange) * incrementIncrease
  return currentBid + increment
}

/**
 * Display-only mirror of place_bid's maximum-safe-bid formula. Never used
 * to gate anything — place_bid recomputes this itself from authoritative
 * purse/roster state inside the lock.
 */
export function calculateMaximumSafeBid(
  purseRemaining: number,
  maxSquadSize: number,
  currentRosterCount: number,
  currentPlayerBasePrice: number,
): number {
  const availableSlots = maxSquadSize - currentRosterCount
  const spotsAfter = availableSlots - 1
  return purseRemaining - spotsAfter * currentPlayerBasePrice
}

/** Every 0015 RPC already raises a clean, human-readable message — this
 * just guards against an unexpected raw error reaching the screen. */
export function describeAuctionError(err: unknown): string {
  const message = err instanceof Error ? err.message : ''
  return message.trim() || 'Something went wrong. Please try again.'
}
