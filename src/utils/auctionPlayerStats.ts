import { getPlayersCareerStats } from '@/services/players'
import { listAllStats, listMatchesRaw } from '@/services/matches'
import { calculatePlayerAuctionRawMetrics } from '@/utils/calculations'
import type { Player } from '@/types'

export interface AuctionPlayerStats {
  matchesPlayed: number
  kills: number
  deaths: number
  flags: number
  kd: number
  winRate: number
  avgKills: number
  avgFlags: number
}

/** Raw (not normalized) per-player stats for the Manual Auction admin/owner
 * screens — kills/deaths/flags totals, K/D, win rate, and per-match
 * averages. Distinct from the auction "Player Index" (a normalized 0-100
 * score already frozen onto season_auction_players at auction start) —
 * this is the actual counting-stat display the spec asks for. */
export async function getAuctionPlayerStats(players: Player[]): Promise<Record<string, AuctionPlayerStats>> {
  if (players.length === 0) return {}

  const ids = players.map((p) => p.id)
  const [totals, stats, matches] = await Promise.all([getPlayersCareerStats(ids), listAllStats(), listMatchesRaw()])

  const result: Record<string, AuctionPlayerStats> = {}
  for (const player of players) {
    const raw = calculatePlayerAuctionRawMetrics(player, stats, matches)
    const total = totals[player.id] ?? { kills: 0, deaths: 0, flags: 0, matchesPlayed: 0 }
    result[player.id] = {
      matchesPlayed: total.matchesPlayed,
      kills: total.kills,
      deaths: total.deaths,
      flags: total.flags,
      kd: raw.kd,
      winRate: raw.winRate,
      avgKills: raw.killsPerMatch,
      avgFlags: raw.flagsPerMatch,
    }
  }
  return result
}
