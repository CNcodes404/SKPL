import { average, calculateKD, calculateWinRate, formatKD } from '@/utils/calculations'
import type { PlayerSeasonStats, TeamSeasonStats } from '@/types'

export type PlayerStatType =
  | 'kills'
  | 'flags'
  | 'kd'
  | 'avg_kills'
  | 'avg_flags'
  | 'most_kills_match'
  | 'most_flags_match'
  | 'highest_kd_match'
export type TeamStatType = 'wins' | 'win_rate' | 'kills' | 'flags' | 'kd'

export const PLAYER_STAT_LABELS: Record<PlayerStatType, string> = {
  kills: 'Total Kills',
  flags: 'Total Flags',
  kd: 'KD Ratio',
  avg_kills: 'Average Kills / Match',
  avg_flags: 'Average Flags / Match',
  most_kills_match: 'Most Kills in a Match',
  most_flags_match: 'Most Flags in a Match',
  highest_kd_match: 'Highest KD in a Match',
}

export const TEAM_STAT_LABELS: Record<TeamStatType, string> = {
  wins: 'Most Wins',
  win_rate: 'Win Rate',
  kills: 'Total Kills',
  flags: 'Total Flags',
  kd: 'Team KD',
}

export const PLAYER_STAT_TYPES: PlayerStatType[] = [
  'kills',
  'flags',
  'kd',
  'avg_kills',
  'avg_flags',
  'most_kills_match',
  'most_flags_match',
  'highest_kd_match',
]
export const TEAM_STAT_TYPES: TeamStatType[] = ['wins', 'win_rate', 'kills', 'flags', 'kd']

export function isPlayerStatType(v: string): v is PlayerStatType {
  return (PLAYER_STAT_TYPES as string[]).includes(v)
}

export function isTeamStatType(v: string): v is TeamStatType {
  return (TEAM_STAT_TYPES as string[]).includes(v)
}

export function playerStatValue(s: PlayerSeasonStats, type: PlayerStatType): number {
  switch (type) {
    case 'kills':
      return s.kills
    case 'flags':
      return s.flags
    case 'kd':
      return calculateKD(s.kills, s.deaths)
    case 'avg_kills':
      return average(s.kills, s.matchesPlayed)
    case 'avg_flags':
      return average(s.flags, s.matchesPlayed)
    case 'most_kills_match':
      return s.mostKillsInMatch
    case 'most_flags_match':
      return s.mostFlagsInMatch
    case 'highest_kd_match':
      return s.highestKDInMatch
  }
}

export function playerStatDisplay(s: PlayerSeasonStats, type: PlayerStatType): string {
  switch (type) {
    case 'kills':
      return String(s.kills)
    case 'flags':
      return String(s.flags)
    case 'kd':
      return formatKD(s.kills, s.deaths)
    case 'avg_kills':
      return average(s.kills, s.matchesPlayed).toFixed(2)
    case 'avg_flags':
      return average(s.flags, s.matchesPlayed).toFixed(2)
    case 'most_kills_match':
      return String(s.mostKillsInMatch)
    case 'most_flags_match':
      return String(s.mostFlagsInMatch)
    case 'highest_kd_match':
      return s.highestKDInMatch.toFixed(2)
  }
}

export function teamStatValue(s: TeamSeasonStats, type: TeamStatType): number {
  switch (type) {
    case 'wins':
      return s.wins
    case 'win_rate':
      return calculateWinRate(s.wins, s.matchesPlayed)
    case 'kills':
      return s.kills
    case 'flags':
      return s.flags
    case 'kd':
      return calculateKD(s.kills, s.deaths)
  }
}

export function teamStatDisplay(s: TeamSeasonStats, type: TeamStatType): string {
  switch (type) {
    case 'wins':
      return String(s.wins)
    case 'win_rate':
      return `${calculateWinRate(s.wins, s.matchesPlayed)}%`
    case 'kills':
      return String(s.kills)
    case 'flags':
      return String(s.flags)
    case 'kd':
      return formatKD(s.kills, s.deaths)
  }
}
