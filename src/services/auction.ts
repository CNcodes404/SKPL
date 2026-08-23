import { supabase } from '@/lib/supabase'
import { listPlayers } from '@/services/players'
import { getSeasonRosterRows } from '@/services/seasons'
import { computePlayerIndices } from '@/services/auctionValuation'
import { categoryPriceFromIndices, DEFAULT_CATEGORY_BANDS, type CategoryBand } from '@/services/legacyPricing'
import type { Player, Season, SeasonAuction, SeasonAuctionPlayer, SeasonAuctionStrategyLocked, Team } from '@/types'

export interface DraftAuctionSeasonInfo {
  seasonId: string
  seasonName: string
  seasonNumber: number
}

/** The most recently configured season still awaiting owner retention decisions / admin start. */
export async function getActiveDraftAuctionSeason(): Promise<DraftAuctionSeasonInfo | null> {
  const { data, error } = await supabase
    .from('season_auctions')
    .select('season_id, seasons(name, season_number)')
    .eq('status', 'DRAFT')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const season = (data as any).seasons
  return {
    seasonId: data.season_id,
    seasonName: season?.name ?? '',
    seasonNumber: season?.season_number ?? 0,
  }
}

/** Every season that ever had an auction configured (any status) — never includes purely-manual seasons, since those have no season_auctions row at all. */
export async function listAuctionSeasons(): Promise<Season[]> {
  const { data, error } = await supabase.from('season_auctions').select('seasons(*)')
  if (error) throw error
  const seasons = ((data ?? []) as any[]).map((row) => row.seasons as Season).filter(Boolean)
  return seasons.sort((a, b) => b.season_number - a.season_number)
}

export async function getAuctionConfig(seasonId: string): Promise<SeasonAuction | null> {
  const { data, error } = await supabase.from('season_auctions').select('*').eq('season_id', seasonId).maybeSingle()
  if (error) throw error
  return data
}

export async function getAuctionPool(seasonId: string): Promise<(SeasonAuctionPlayer & { player: Player })[]> {
  const { data, error } = await supabase
    .from('season_auction_players')
    .select('*, players(*)')
    .eq('season_id', seasonId)
    .order('order_no', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row: any) => ({ ...row, player: row.players }))
}

export interface AuctionBidTickerEntry {
  id: string
  amount: number
  round_no: number
  created_at: string
  player: Player
  team: Team
}

export async function getBidTicker(seasonId: string, limit = 50): Promise<AuctionBidTickerEntry[]> {
  const { data, error } = await supabase
    .from('season_auction_bids')
    .select('id, amount, round_no, created_at, players(*), teams(*)')
    .eq('season_id', seasonId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    id: row.id,
    amount: row.amount,
    round_no: row.round_no,
    created_at: row.created_at,
    player: row.players,
    team: row.teams,
  }))
}

export interface AuctionTeamSummary {
  team: Team
  purseTotal: number
  purseRemaining: number
  roster: { player: Player; price: number | null; is_captain: boolean }[]
}

export async function getAuctionTeamSummaries(seasonId: string): Promise<AuctionTeamSummary[]> {
  const { data: seasonTeams, error: teamsError } = await supabase
    .from('season_teams')
    .select('team_id, purse_total, purse_remaining, teams(*)')
    .eq('season_id', seasonId)
  if (teamsError) throw teamsError

  const { data: rosterRows, error: rosterError } = await supabase
    .from('season_rosters')
    .select('team_id, price, is_captain, players(*)')
    .eq('season_id', seasonId)
  if (rosterError) throw rosterError

  return ((seasonTeams ?? []) as any[]).map((st) => ({
    team: st.teams as Team,
    purseTotal: st.purse_total as number,
    purseRemaining: st.purse_remaining as number,
    roster: ((rosterRows ?? []) as any[])
      .filter((r) => r.team_id === st.team_id)
      .map((r) => ({ player: r.players as Player, price: r.price as number | null, is_captain: r.is_captain as boolean })),
  }))
}

export interface StartAuctionParams {
  seasonId: string
  purseDefault: number
  minSquadSize: number
  maxSquadSize: number
  orderStrategy: 'RANDOM' | 'INDEX_DESC' | 'ROLE_GROUPED'
  purseOverrides?: { team_id: string; purse_total: number }[]
  /** Base price per category (A/B/C by Player Index percentile within the pool) — same concept as the manual-season pricing. */
  categoryBands?: CategoryBand[]
}

/** Computes player indices + category-based base prices for the pool client-side, then activates the DRAFT auction. */
export async function startAuction(params: StartAuctionParams): Promise<void> {
  const [activePlayers, rosterRows] = await Promise.all([listPlayers(false), getSeasonRosterRows(params.seasonId)])
  const rosteredIds = new Set(rosterRows.map((r) => r.player_id))
  const poolPlayers = activePlayers.filter((p) => !rosteredIds.has(p.id))

  const indices = await computePlayerIndices(poolPlayers)
  const bands = params.categoryBands ?? DEFAULT_CATEGORY_BANDS
  const categoryPrices = categoryPriceFromIndices(poolPlayers, indices, bands)
  const lowestBandPrice = Math.min(...bands.map((b) => b.price))

  const { error } = await supabase.rpc('start_auction', {
    p_season_id: params.seasonId,
    p_purse_default: params.purseDefault,
    p_base_price_default: lowestBandPrice,
    p_min_squad_size: params.minSquadSize,
    p_max_squad_size: params.maxSquadSize,
    p_order_strategy: params.orderStrategy,
    p_purse_overrides: params.purseOverrides ?? [],
    p_base_price_overrides: categoryPrices,
    p_player_indices: indices,
  })
  if (error) throw error
}

export async function advanceAuctionTick(seasonId: string, driverToken: string): Promise<SeasonAuction> {
  const { data, error } = await supabase.rpc('advance_auction_bid', {
    p_season_id: seasonId,
    p_driver_token: driverToken,
  })
  if (error) throw error
  return data as SeasonAuction
}

export async function pauseAuction(seasonId: string): Promise<void> {
  const { error } = await supabase.rpc('pause_auction', { p_season_id: seasonId })
  if (error) throw error
}

export async function resumeAuction(seasonId: string): Promise<void> {
  const { error } = await supabase.rpc('resume_auction', { p_season_id: seasonId })
  if (error) throw error
}

export async function skipPlayer(seasonId: string, playerId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_skip_player', { p_season_id: seasonId, p_player_id: playerId })
  if (error) throw error
}

export async function resetAuction(seasonId: string): Promise<void> {
  const { error } = await supabase.rpc('reset_season_auction', { p_season_id: seasonId })
  if (error) throw error
}

/** Admin-only post-mortem: each team's locked strategy for a completed auction. */
export async function getLockedStrategies(seasonId: string): Promise<(SeasonAuctionStrategyLocked & { team: Team })[]> {
  const { data, error } = await supabase
    .from('season_auction_strategies_locked')
    .select('*, teams(*)')
    .eq('season_id', seasonId)
  if (error) throw error
  return (data ?? []).map((row: any) => ({ ...row, team: row.teams }))
}

/** Subscribes to every table that changes during a live auction; calls onChange on any of them. Returns an unsubscribe function. */
export function subscribeToAuction(seasonId: string, onChange: () => void): () => void {
  const tables = ['season_auctions', 'season_auction_bids', 'season_auction_players', 'season_teams']
  const channel = supabase.channel(`auction-${seasonId}`)

  for (const table of tables) {
    channel.on(
      'postgres_changes' as any,
      { event: '*', schema: 'public', table, filter: `season_id=eq.${seasonId}` },
      onChange,
    )
  }
  channel.subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
