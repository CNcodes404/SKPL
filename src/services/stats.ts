import { ALL_SEASONS } from '@/components/shared/SeasonSelector'
import { listTeams } from '@/services/teams'
import { getSeasonRoster, getSeasonTeams } from '@/services/seasons'
import { listAllStats, listMatchesRaw, listStatsForSeason } from '@/services/matches'
import { supabase } from '@/lib/supabase'
import { listPlayers } from '@/services/players'
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

export async function getPlayerStatsForScope(
  seasonId: string,
  includeExhibitions = false,
): Promise<PlayerSeasonStats[]> {
  const isAll = seasonId === ALL_SEASONS

  let members: RosterMember[]
  let matches: Awaited<ReturnType<typeof listMatchesRaw>>
  let stats: Awaited<ReturnType<typeof listAllStats>>

  if (isAll) {
    ;[members, matches, stats] = await Promise.all([
      getAllRosterMembers(),
      listMatchesRaw(undefined, includeExhibitions),
      listAllStats(includeExhibitions),
    ])
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

    // Substitutes who aren't on any roster this season still played — include
    // them, listed under the team they played for.
    const onRoster = new Set(members.map((m) => m.player.id))
    const subIds = [...new Set(stats.filter((s) => !onRoster.has(s.player_id)).map((s) => s.player_id))]
    if (subIds.length) {
      const players = await listPlayers(true)
      for (const id of subIds) {
        const player = players.find((p) => p.id === id)
        if (!player) continue
        const lastTeamId = stats.filter((s) => s.player_id === id).at(-1)?.team_id
        members.push({ player, team: (lastTeamId && teamById.get(lastTeamId)) || null, is_captain: false })
      }
    }
  }

  const completedMatchIds = new Set(matches.filter((m) => m.status === 'COMPLETED').map((m) => m.id))
  return calculatePlayerStats(members, stats, completedMatchIds)
}

/**
 * A team's squad for one season, with each player's stats from the matches
 * they played *for this team* only (a player who subbed for another team
 * keeps those stats out of here). Substitutes who played for this team are
 * included and flagged is_sub.
 */
export async function getTeamSeasonSquad(seasonId: string, teamId: string): Promise<PlayerSeasonStats[]> {
  const [roster, teams, seasonMatches, seasonStats] = await Promise.all([
    getSeasonRoster(seasonId),
    getSeasonTeams(seasonId),
    listMatchesRaw(seasonId),
    listStatsForSeason(seasonId),
  ])
  const team = teams.find((t) => t.id === teamId) ?? null
  const teamStats = seasonStats.filter((s) => s.team_id === teamId)
  const members: RosterMember[] = roster
    .filter((r) => r.team_id === teamId)
    .map((r) => ({ player: r.player, team, is_captain: r.is_captain }))

  const onSquad = new Set(members.map((m) => m.player.id))
  const subIds = [...new Set(teamStats.filter((s) => !onSquad.has(s.player_id)).map((s) => s.player_id))]
  const completedMatchIds = new Set(seasonMatches.filter((m) => m.status === 'COMPLETED').map((m) => m.id))
  const squad = calculatePlayerStats(members, teamStats, completedMatchIds)
  if (subIds.length === 0) return squad

  const players = await listPlayers(true)
  const subMembers: RosterMember[] = subIds
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((player) => ({ player, team, is_captain: false }))
  const subs = calculatePlayerStats(subMembers, teamStats, completedMatchIds)
    .filter((s) => s.matchesPlayed > 0)
    .map((s) => ({ ...s, is_sub: true }))
  return [...squad, ...subs]
}

export async function getTeamStatsForScope(
  seasonId: string,
  includeExhibitions = false,
): Promise<TeamSeasonStats[]> {
  const isAll = seasonId === ALL_SEASONS

  const [teams, matches, stats] = await Promise.all([
    isAll ? listTeams(true) : getSeasonTeams(seasonId),
    isAll ? listMatchesRaw(undefined, includeExhibitions) : listMatchesRaw(seasonId),
    isAll ? listAllStats(includeExhibitions) : listStatsForSeason(seasonId),
  ])

  return calculateTeamStats(teams, matches, stats, { includeAllMatchTypes: true })
}
