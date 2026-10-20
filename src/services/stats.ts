import { ALL_SEASONS } from '@/components/shared/SeasonSelector'
import { listTeams } from '@/services/teams'
import { getSeasonRoster, getSeasonTeams } from '@/services/seasons'
import { listAllStats, listMatchesRaw, listStatsForSeason } from '@/services/matches'
import { supabase } from '@/lib/supabase'
import { listPlayers } from '@/services/players'
import { calculatePlayerStats, calculateTeamStats, type RosterMember } from '@/utils/calculations'
import type { PlayerSeasonStats, Team, TeamSeasonStats } from '@/types'

/** Ids of one tournament's seasons. */
export async function getTournamentSeasonIds(tournamentId: string): Promise<string[]> {
  const { data, error } = await supabase.from('seasons').select('id').eq('tournament_id', tournamentId)
  if (error) throw error
  return (data ?? []).map((s) => s.id)
}

/**
 * Every player who has ever appeared on a roster (of the given seasons, if
 * any), deduped, each mapped to their most recent team.
 */
async function getAllRosterMembers(seasonIds?: string[]): Promise<RosterMember[]> {
  let query = supabase
    .from('season_rosters')
    .select('player_id, players(*), team_id, teams(*), is_captain, seasons(season_number)')
  if (seasonIds) query = query.in('season_id', seasonIds)
  const { data, error } = await query
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

/**
 * Matches and stats across all seasons — of one tournament if given (which
 * leaves exhibitions out, as they belong to no tournament).
 */
async function getAllSeasonsData(includeExhibitions: boolean, tournamentId?: string) {
  const seasonIds = tournamentId ? await getTournamentSeasonIds(tournamentId) : undefined
  let [matches, stats] = await Promise.all([
    listMatchesRaw(undefined, includeExhibitions && !tournamentId),
    listAllStats(includeExhibitions && !tournamentId),
  ])
  if (seasonIds) {
    const inTournament = new Set(seasonIds)
    matches = matches.filter((m) => m.season_id && inTournament.has(m.season_id))
    const matchIds = new Set(matches.map((m) => m.id))
    stats = stats.filter((s) => matchIds.has(s.match_id))
  }
  return { seasonIds, matches, stats }
}

/** Players who played in these stats but aren't members yet, under the team they last played for. */
async function addUnlistedPlayers(members: RosterMember[], stats: { player_id: string; team_id: string }[], teams: Team[]) {
  const listed = new Set(members.map((m) => m.player.id))
  const missing = [...new Set(stats.filter((s) => !listed.has(s.player_id)).map((s) => s.player_id))]
  if (missing.length === 0) return
  const teamById = new Map(teams.map((t) => [t.id, t] as [string, Team]))
  const players = await listPlayers(true)
  for (const id of missing) {
    const player = players.find((p) => p.id === id)
    if (!player) continue
    const lastTeamId = stats.filter((s) => s.player_id === id).at(-1)?.team_id
    members.push({ player, team: (lastTeamId && teamById.get(lastTeamId)) || null, is_captain: false })
  }
}

export async function getPlayerStatsForScope(
  seasonId: string,
  includeExhibitions = false,
  tournamentId?: string,
): Promise<PlayerSeasonStats[]> {
  const isAll = seasonId === ALL_SEASONS

  let members: RosterMember[]
  let matches: Awaited<ReturnType<typeof listMatchesRaw>>
  let stats: Awaited<ReturnType<typeof listAllStats>>

  if (isAll) {
    const data = await getAllSeasonsData(includeExhibitions, tournamentId)
    matches = data.matches
    stats = data.stats
    members = await getAllRosterMembers(data.seasonIds)
    // Players who only ever played from a round lineup or as a substitute.
    if (data.seasonIds) await addUnlistedPlayers(members, stats, await listTeams(true))
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
  tournamentId?: string,
): Promise<TeamSeasonStats[]> {
  if (seasonId === ALL_SEASONS) {
    const [allTeams, data] = await Promise.all([listTeams(true), getAllSeasonsData(includeExhibitions, tournamentId)])
    // Scoped to a tournament: only teams that played in it.
    const played = new Set(data.matches.flatMap((m) => [m.team_a_id, m.team_b_id]))
    const teams = tournamentId ? allTeams.filter((t) => played.has(t.id)) : allTeams
    return calculateTeamStats(teams, data.matches, data.stats, { includeAllMatchTypes: true })
  }

  const [teams, matches, stats] = await Promise.all([
    getSeasonTeams(seasonId),
    listMatchesRaw(seasonId),
    listStatsForSeason(seasonId),
  ])

  return calculateTeamStats(teams, matches, stats, { includeAllMatchTypes: true })
}
