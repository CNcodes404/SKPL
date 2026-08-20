import type {
  Match,
  MatchPlayerStat,
  Player,
  PlayerSeasonStats,
  Season,
  StandingRow,
  Team,
  TeamSeasonStats,
} from '@/types'

export function calculateKD(kills: number, deaths: number): number | 'Perfect' {
  if (deaths === 0) return 'Perfect'
  return Math.round((kills / deaths) * 100) / 100
}

export function formatKD(kills: number, deaths: number): string {
  const kd = calculateKD(kills, deaths)
  return kd === 'Perfect' ? 'Perfect' : kd.toFixed(2)
}

export function calculateWinRate(wins: number, played: number): number {
  if (played === 0) return 0
  return Math.round((wins / played) * 1000) / 10
}

export function average(total: number, count: number): number {
  if (count === 0) return 0
  return Math.round((total / count) * 100) / 100
}

/** Only REGULAR_SEASON + COMPLETED matches count toward standings. */
export function regularSeasonCompleted(matches: Match[]): Match[] {
  return matches.filter((m) => m.match_type === 'REGULAR_SEASON' && m.status === 'COMPLETED')
}

export function calculateStandings(teams: Team[], allMatches: Match[], season: Season): StandingRow[] {
  const matches = regularSeasonCompleted(allMatches)

  const rows: StandingRow[] = teams.map((team) => {
    const teamMatches = matches
      .filter((m) => m.team_a_id === team.id || m.team_b_id === team.id)
      .sort((a, b) => new Date(b.scheduled_at ?? 0).getTime() - new Date(a.scheduled_at ?? 0).getTime())

    let wins = 0
    let losses = 0
    let scoreDiff = 0
    let points = 0
    const form: ('W' | 'L')[] = []

    for (const m of teamMatches) {
      const isA = m.team_a_id === team.id
      const own = (isA ? m.team_a_score : m.team_b_score) ?? 0
      const opp = (isA ? m.team_b_score : m.team_a_score) ?? 0
      scoreDiff += own - opp

      if (own > opp) {
        wins++
        points += season.winning_points
        if (form.length < 5) form.push('W')
      } else if (own < opp) {
        losses++
        const diff = opp - own
        if (season.close_loss_enabled && diff <= season.close_loss_max_difference) {
          points += season.close_loss_points
        }
        if (form.length < 5) form.push('L')
      }
    }

    return {
      team,
      played: teamMatches.length,
      wins,
      losses,
      scoreDiff,
      points,
      form,
    }
  })

  return rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.scoreDiff !== a.scoreDiff) return b.scoreDiff - a.scoreDiff
    return b.wins - a.wins
  })
}

export interface RosterMember {
  player: Player
  team: Team | null
}

export function calculatePlayerStats(
  roster: RosterMember[],
  stats: MatchPlayerStat[],
  completedMatchIds: Set<string>,
): PlayerSeasonStats[] {
  return roster.map(({ player, team }) => {
    const rows = stats.filter((s) => s.player_id === player.id && completedMatchIds.has(s.match_id))
    const kills = rows.reduce((sum, r) => sum + r.kills, 0)
    const deaths = rows.reduce((sum, r) => sum + r.deaths, 0)
    const flags = rows.reduce((sum, r) => sum + r.flags, 0)

    return {
      player,
      team,
      matchesPlayed: rows.length,
      kills,
      deaths,
      flags,
    }
  })
}

export function calculateTeamStats(
  teams: Team[],
  allMatches: Match[],
  stats: MatchPlayerStat[],
): TeamSeasonStats[] {
  const matches = regularSeasonCompleted(allMatches)

  return teams.map((team) => {
    const teamMatches = matches.filter((m) => m.team_a_id === team.id || m.team_b_id === team.id)

    let wins = 0
    let losses = 0
    let highestWinMargin = 0
    let kills = 0
    let deaths = 0
    let flags = 0
    let mostKillsInMatch = 0
    let leastKillsInMatch = Infinity
    let minFlags = Infinity
    let maxFlags = 0

    for (const m of teamMatches) {
      const isA = m.team_a_id === team.id
      const own = (isA ? m.team_a_score : m.team_b_score) ?? 0
      const opp = (isA ? m.team_b_score : m.team_a_score) ?? 0

      if (own > opp) {
        wins++
        highestWinMargin = Math.max(highestWinMargin, own - opp)
      } else if (own < opp) {
        losses++
      }

      const matchStats = stats.filter((s) => s.match_id === m.id && s.team_id === team.id)
      const matchKills = matchStats.reduce((sum, s) => sum + s.kills, 0)
      const matchFlags = matchStats.reduce((sum, s) => sum + s.flags, 0)

      kills += matchKills
      deaths += matchStats.reduce((sum, s) => sum + s.deaths, 0)
      flags += matchFlags

      mostKillsInMatch = Math.max(mostKillsInMatch, matchKills)
      leastKillsInMatch = Math.min(leastKillsInMatch, matchKills)
      minFlags = Math.min(minFlags, matchFlags)
      maxFlags = Math.max(maxFlags, matchFlags)
    }

    return {
      team,
      matchesPlayed: teamMatches.length,
      wins,
      losses,
      kills,
      deaths,
      flags,
      highestWinMargin,
      mostKillsInMatch,
      leastKillsInMatch: leastKillsInMatch === Infinity ? 0 : leastKillsInMatch,
      minFlags: minFlags === Infinity ? 0 : minFlags,
      maxFlags,
    }
  })
}

export function determineMatchWinnerId(match: Pick<Match, 'team_a_id' | 'team_b_id' | 'team_a_score' | 'team_b_score'>): string | null {
  if (match.team_a_score == null || match.team_b_score == null) return null
  if (match.team_a_score === match.team_b_score) return null
  return match.team_a_score > match.team_b_score ? match.team_a_id : match.team_b_id
}
