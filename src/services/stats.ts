import { ALL_SEASONS } from '@/components/shared/SeasonSelector'
import { listTeams } from '@/services/teams'
import { getSeasonRoster, getSeasonTeams } from '@/services/seasons'
import { listAllStats, listMatchesRaw, listStatsForSeason } from '@/services/matches'
import { supabase } from '@/lib/supabase'
import { calculatePlayerStats, calculateTeamStats, type RosterMember } from '@/utils/calculations'
import type { PlayerSeasonStats, Team, TeamSeasonStats } from '@/types'

/** Every player who has ever appeared on a roster, deduped, each mapped to their most recent team. */
async function getAllRosterMembers(): Promise<RosterMember[]> {
  const { data, error } = await supabase
    .from('season_rosters')
    .select('player_id, players(*), team_id, teams(*), is_captain, seasons(season_number)')
  if (error) throw error

  const bySeasonDesc = [...((data ?? []) as any[])].sort(
    (a, b) => (b.seasons?.season_number ?? 0) - (a.seasons?.season_number ?? 0),
  )
  const seen = new Set<string>()
  const members: RosterMember[] = []
  for (const row of bySeasonDesc) {
    if (seen.has(row.player_id)) continue
    seen.add(row.player_id)
    members.push({ player: row.players, team: row.teams ?? null, is_captain: Boolean(row.is_captain) })
  }
  return members
}

export async function getPlayerStatsForScope(seasonId: string): Promise<PlayerSeasonStats[]> {
  const isAll = seasonId === ALL_SEASONS

  let members: RosterMember[]
  let matches: Awaited<ReturnType<typeof listMatchesRaw>>
  let stats: Awaited<ReturnType<typeof listAllStats>>

  if (isAll) {
    ;[members, matches, stats] = await Promise.all([getAllRosterMembers(), listMatchesRaw(), listAllStats()])
  } else {
    const [roster, teams, seasonMatches, seasonStats] = await Promise.all([
      getSeasonRoster(seasonId),
      getSeasonTeams(seasonId),
      listMatchesRaw(seasonId),
      listStatsForSeason(seasonId),
    ])
    const teamById = new Map(teams.map((t) => [t.id, t] as [string, Team]))
    members = roster.map((r) => ({ player: r.player, team: teamById.get(r.team_id) ?? null, is_captain: r.is_captain }))
    matches = seasonMatches
    stats = seasonStats
  }

  const completedMatchIds = new Set(matches.filter((m) => m.status === 'COMPLETED').map((m) => m.id))
  return calculatePlayerStats(members, stats, completedMatchIds)
}

export async function getTeamStatsForScope(seasonId: string): Promise<TeamSeasonStats[]> {
  const isAll = seasonId === ALL_SEASONS

  const [teams, matches, stats] = await Promise.all([
    isAll ? listTeams(true) : getSeasonTeams(seasonId),
    isAll ? listMatchesRaw() : listMatchesRaw(seasonId),
    isAll ? listAllStats() : listStatsForSeason(seasonId),
  ])

  return calculateTeamStats(teams, matches, stats)
}
