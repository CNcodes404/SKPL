import type {
  AuctionModeType,
  AuctionPlayerStatus,
  AuctionStatus,
  Database,
  MatchStatus,
  MatchType,
  PlayerDrawModeType,
  PlayerRole,
  PlayerSkillTier,
  SeasonStatus,
} from './database'

export type Team = Database['public']['Tables']['teams']['Row']
export type Player = Database['public']['Tables']['players']['Row']
export type Season = Database['public']['Tables']['seasons']['Row']
export type SeasonTeam = Database['public']['Tables']['season_teams']['Row']
export type SeasonRoster = Database['public']['Tables']['season_rosters']['Row']
export type Match = Database['public']['Tables']['matches']['Row']
export type MatchPlayerStat = Database['public']['Tables']['match_player_stats']['Row']
export type AdminProfile = Database['public']['Tables']['admin_profiles']['Row']
export type TeamOwnerProfile = Database['public']['Tables']['team_owner_profiles']['Row']
export type TeamOwnerInvite = Database['public']['Tables']['team_owner_invites']['Row']
export type TeamOwnerStrategy = Database['public']['Tables']['team_owner_strategies']['Row']
export type SeasonAuctionStrategyLocked = Database['public']['Tables']['season_auction_strategies_locked']['Row']
export type SeasonAuctionPlayer = Database['public']['Tables']['season_auction_players']['Row']
export type SeasonAuctionBid = Database['public']['Tables']['season_auction_bids']['Row']
export type SeasonRetention = Database['public']['Tables']['season_retentions']['Row']
export type SeasonAuction = Database['public']['Tables']['season_auctions']['Row']

export type {
  AuctionModeType,
  AuctionPlayerStatus,
  AuctionStatus,
  MatchStatus,
  MatchType,
  PlayerDrawModeType,
  PlayerRole,
  PlayerSkillTier,
  SeasonStatus,
}

export const AUCTION_MODE_LABELS: Record<AuctionModeType, string> = {
  AI: 'AI / Automatic',
  MANUAL: 'Manual / Live',
}

export const PLAYER_DRAW_MODE_LABELS: Record<PlayerDrawModeType, string> = {
  AUTO: 'Auto Draw',
  MANUAL: 'Manual Draw',
}

export const PLAYER_ROLE_LABELS: Record<PlayerRole, string> = {
  FLAGGER: 'Flagger',
  DEFENDER: 'Defender',
  ALL_ROUNDER: 'All-Rounder',
}

export const PLAYER_ROLES: PlayerRole[] = ['FLAGGER', 'DEFENDER', 'ALL_ROUNDER']

export const PLAYER_SKILL_TIER_LABELS: Record<PlayerSkillTier, string> = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  EXPERT: 'Expert',
}

export const PLAYER_SKILL_TIERS: PlayerSkillTier[] = ['BEGINNER', 'INTERMEDIATE', 'EXPERT']

export const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  REGULAR_SEASON: 'Regular Season',
  QUALIFIER: 'Qualifier',
  ELIMINATOR: 'Eliminator',
  QUARTER_FINAL: 'Quarter Final',
  SEMI_FINAL: 'Semi Final',
  FINAL: 'Final',
  THIRD_PLACE: 'Third Place',
  TIE_BREAKER: 'Tie Breaker',
  CUSTOM: 'Custom',
}

export const MATCH_TYPES: MatchType[] = [
  'REGULAR_SEASON',
  'QUALIFIER',
  'ELIMINATOR',
  'QUARTER_FINAL',
  'SEMI_FINAL',
  'FINAL',
  'THIRD_PLACE',
  'TIE_BREAKER',
  'CUSTOM',
]

export interface MatchWithTeams extends Match {
  team_a: Team
  team_b: Team
  mvp_player?: Player | null
}

export interface MatchWithStats extends MatchWithTeams {
  stats: MatchPlayerStat[]
}

export interface RosterEntry {
  player: Player
  team_id: string
}

export interface StandingRow {
  team: Team
  played: number
  wins: number
  losses: number
  scoreDiff: number
  points: number
  form: ('W' | 'L')[]
}

export interface PlayerSeasonStats {
  player: Player
  team: Team | null
  matchesPlayed: number
  kills: number
  deaths: number
  flags: number
  mostKillsInMatch: number
  mostFlagsInMatch: number
  highestKDInMatch: number
}

export interface PlayerDetailStats {
  matchesPlayed: number
  kills: number
  deaths: number
  flags: number
  avgKills: number
  avgFlags: number
  maxKillsInMatch: number
  minKillsInMatch: number
  maxFlagsInMatch: number
  minFlagsInMatch: number
}

export interface TeamSeasonStats {
  team: Team
  matchesPlayed: number
  wins: number
  losses: number
  kills: number
  deaths: number
  flags: number
  highestWinMargin: number
  mostKillsInMatch: number
  leastKillsInMatch: number
  minFlags: number
  maxFlags: number
}
