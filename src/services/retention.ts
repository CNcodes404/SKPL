import { supabase } from '@/lib/supabase'
import type { Player } from '@/types'

export interface RetentionCandidate {
  player: Player
  lastPrice: number
  lastSeasonNumber: number
  retentionPrice: number
}

export interface RetentionOptions {
  maxRetentionsPerTeam: number
  candidates: RetentionCandidate[]
}

/** The team's eligible-for-retention players: whoever they rostered most recently at a known price, in any season other than this one. */
export async function getRetentionOptions(seasonId: string, teamId: string): Promise<RetentionOptions> {
  const { data: auction, error: auctionError } = await supabase
    .from('season_auctions')
    .select('retention_price_increase_pct, max_retentions_per_team')
    .eq('season_id', seasonId)
    .maybeSingle()
  if (auctionError) throw auctionError
  if (!auction) return { maxRetentionsPerTeam: 0, candidates: [] }

  const { data, error } = await supabase
    .from('season_rosters')
    .select('player_id, price, players(*), seasons(season_number)')
    .eq('team_id', teamId)
    .neq('season_id', seasonId)
  if (error) throw error

  const rows = (data ?? []) as any[]
  if (rows.length === 0) return { maxRetentionsPerTeam: auction.max_retentions_per_team, candidates: [] }

  // Anchor to the team's single most recent season (auction or manual),
  // never reaching further back — an older price no longer reflects who is
  // actually on this team if a season in between moved/dropped the player.
  const mostRecentSeasonNumber = Math.max(...rows.map((r) => r.seasons?.season_number ?? 0))
  const candidates: RetentionCandidate[] = rows
    .filter((r) => (r.seasons?.season_number ?? 0) === mostRecentSeasonNumber && r.price != null)
    .map((r) => ({
      player: r.players,
      lastPrice: r.price,
      lastSeasonNumber: mostRecentSeasonNumber,
      retentionPrice: Math.round(r.price * (1 + auction.retention_price_increase_pct / 100) * 100) / 100,
    }))

  return { maxRetentionsPerTeam: auction.max_retentions_per_team, candidates }
}

/** The player_ids this team has already submitted for retention this season (if any). */
export async function getOwnerRetentionSelections(seasonId: string, teamId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('season_retentions')
    .select('player_id')
    .eq('season_id', seasonId)
    .eq('team_id', teamId)
  if (error) throw error
  return (data ?? []).map((r) => r.player_id)
}

/** Every player retained by any team this season — used to keep the admin's
 * direct player-owner assignment picker from offering an already-retained player. */
export async function getSeasonRetentions(seasonId: string): Promise<{ team_id: string; player_id: string }[]> {
  const { data, error } = await supabase.from('season_retentions').select('team_id, player_id').eq('season_id', seasonId)
  if (error) throw error
  return data ?? []
}

export async function saveOwnerRetentions(seasonId: string, teamId: string, playerIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('save_owner_retentions', {
    p_season_id: seasonId,
    p_team_id: teamId,
    p_player_ids: playerIds,
  })
  if (error) throw error
}

export interface RetentionSubmissionStatus {
  team_id: string
  retention_submitted: boolean
}

/** For the admin's "N of M teams submitted" readout on the Configure tab. */
export async function getRetentionSubmissionStatus(seasonId: string): Promise<RetentionSubmissionStatus[]> {
  const { data, error } = await supabase
    .from('season_teams')
    .select('team_id, retention_submitted')
    .eq('season_id', seasonId)
  if (error) throw error
  return data ?? []
}
