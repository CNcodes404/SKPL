import type { Database, MatchStatus, MatchType, PlayerRole, SeasonStatus } from './database'

export type Team = Database['public']['Tables']['teams']['Row']
export type Player = Database['public']['Tables']['players']['Row']
export type Season = Database['public']['Tables']['seasons']['Row']
export type SeasonTeam = Database['public']['Tables']['season_teams']['Row']
export type SeasonRoster = Database['public']['Tables']['season_rosters']['Row']
export type Match = Database['public']['Tables']['matches']['Row']
export type MatchPlayerStat = Database['public']['Tables']['match_player_stats']['Row']
export type AdminProfile = Database['public']['Tables']['admin_profiles']['Row']

export type { MatchStatus, MatchType, PlayerRole, SeasonStatus }

export const PLAYER_ROLE_LABELS: Record<PlayerRole, string> = {
  FLAGGER: 'Flagger',
  DEFENDER: 'Defender',
  ALL_ROUNDER: 'All-Rounder',
}

export const PLAYER_ROLES: PlayerRole[] = ['FLAGGER', 'DEFENDER', 'ALL_ROUNDER']

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
