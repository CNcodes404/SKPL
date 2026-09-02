import type {
  Match,
  MatchPlayerStat,
  Player,
  PlayerDetailStats,
  PlayerSeasonStats,
  Season,
  StandingRow,
  Team,
  TeamSeasonStats,
} from '@/types'

export function calculateKD(kills: number, deaths: number): number {
  const effectiveDeaths = deaths === 0 ? 1 : deaths
  return Math.round((kills / effectiveDeaths) * 100) / 100
}

export function formatKD(kills: number, deaths: number): string {
  return calculateKD(kills, deaths).toFixed(2)
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
  is_captain: boolean
}

export function calculatePlayerStats(
  roster: RosterMember[],
  stats: MatchPlayerStat[],
  completedMatchIds: Set<string>,
): PlayerSeasonStats[] {
  return roster.map(({ player, team, is_captain }) => {
    const rows = stats.filter((s) => s.player_id === player.id && completedMatchIds.has(s.match_id))
    const kills = rows.reduce((sum, r) => sum + r.kills, 0)
    const deaths = rows.reduce((sum, r) => sum + r.deaths, 0)
    const flags = rows.reduce((sum, r) => sum + r.flags, 0)

    const mostKillsInMatch = rows.length ? Math.max(...rows.map((r) => r.kills)) : 0
    const mostFlagsInMatch = rows.length ? Math.max(...rows.map((r) => r.flags)) : 0
    const highestKDInMatch = rows.length ? Math.max(...rows.map((r) => calculateKD(r.kills, r.deaths))) : 0

    return {
      player,
      team,
      is_captain,
      matchesPlayed: rows.length,
      kills,
      deaths,
      flags,
      mostKillsInMatch,
      mostFlagsInMatch,
      highestKDInMatch,
    }
  })
}

/** Per-player detail stats (used on the public Player Profile page), including per-match extremes. */
export function calculatePlayerDetailStats(
  playerId: string,
  stats: MatchPlayerStat[],
  completedMatchIds: Set<string>,
  matches: Pick<Match, 'id' | 'status' | 'team_a_id' | 'team_b_id' | 'team_a_score' | 'team_b_score'>[],
): PlayerDetailStats {
  const rows = stats.filter((s) => completedMatchIds.has(s.match_id))

  const kills = rows.reduce((sum, r) => sum + r.kills, 0)
  const deaths = rows.reduce((sum, r) => sum + r.deaths, 0)
  const flags = rows.reduce((sum, r) => sum + r.flags, 0)
  const matchesPlayed = rows.length

  const killValues = rows.map((r) => r.kills)
  const deathValues = rows.map((r) => r.deaths)
  const flagValues = rows.map((r) => r.flags)

  return {
    matchesPlayed,
    kills,
    deaths,
    flags,
    winRate: calculatePlayerWinRate(playerId, stats, matches),
    avgKills: average(kills, matchesPlayed),
    avgDeaths: average(deaths, matchesPlayed),
    avgFlags: average(flags, matchesPlayed),
    maxKillsInMatch: killValues.length ? Math.max(...killValues) : 0,
    minKillsInMatch: killValues.length ? Math.min(...killValues) : 0,
    maxDeathsInMatch: deathValues.length ? Math.max(...deathValues) : 0,
    minDeathsInMatch: deathValues.length ? Math.min(...deathValues) : 0,
    maxFlagsInMatch: flagValues.length ? Math.max(...flagValues) : 0,
    minFlagsInMatch: flagValues.length ? Math.min(...flagValues) : 0,
  }
}

/**
 * Team Statistics vs. standings/ranking are deliberately different scopes:
 * standings (and any ranking derived from this) must stay REGULAR_SEASON
 * only, so callers computing a rank should call this with the default
 * (no options) even where the Team Statistics totals shown elsewhere on
 * the same page use `includeAllMatchTypes: true`.
 */
export function calculateTeamStats(
  teams: Team[],
  allMatches: Match[],
  stats: MatchPlayerStat[],
  options?: { includeAllMatchTypes?: boolean },
): TeamSeasonStats[] {
  const matches = options?.includeAllMatchTypes
    ? allMatches.filter((m) => m.status === 'COMPLETED')
    : regularSeasonCompleted(allMatches)

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

/** Share of a player's completed matches where their team won, as a 0-100 percentage. */
export function calculatePlayerWinRate(
  playerId: string,
  stats: MatchPlayerStat[],
  matches: Pick<Match, 'id' | 'status' | 'team_a_id' | 'team_b_id' | 'team_a_score' | 'team_b_score'>[],
): number {
  const completed = matches.filter((m) => m.status === 'COMPLETED')
  const matchById = new Map(completed.map((m) => [m.id, m]))
  const rows = stats.filter((s) => s.player_id === playerId && matchById.has(s.match_id))
  if (rows.length === 0) return 0

  let wins = 0
  for (const row of rows) {
    const match = matchById.get(row.match_id)!
    if (determineMatchWinnerId(match) === row.team_id) wins++
  }
  return calculateWinRate(wins, rows.length)
}

export function calculatePlayerMvpCount(playerId: string, matches: Match[]): number {
  return matches.filter((m) => m.status === 'COMPLETED' && m.mvp_player_id === playerId).length
}

export interface PlayerAuctionRawMetrics {
  player: Player
  matchesPlayed: number
  killsPerMatch: number
  deathsPerMatch: number
  flagsPerMatch: number
  kd: number
  winRate: number
  mvpCount: number
  /** Matches played, with diminishing returns above ~20 (saturates near 100). */
  experienceRaw: number
  /** Recent (last 5) average kills relative to career average kills — >1 trending up, <1 trending down. */
  formRaw: number
}

/**
 * Raw (not yet normalized) per-player metrics feeding the auction Player
 * Index. Normalization against the auction pool happens one level up, in
 * auctionValuation.ts, since it needs every pool player's raw metrics together.
 */
export function calculatePlayerAuctionRawMetrics(
  player: Player,
  stats: MatchPlayerStat[],
  matches: Match[],
): PlayerAuctionRawMetrics {
  const completed = matches.filter((m) => m.status === 'COMPLETED')
  const matchById = new Map(completed.map((m) => [m.id, m]))
  const rows = stats
    .filter((s) => s.player_id === player.id && matchById.has(s.match_id))
    .map((s) => ({ ...s, match: matchById.get(s.match_id)! }))
    .sort((a, b) => new Date(b.match.scheduled_at ?? 0).getTime() - new Date(a.match.scheduled_at ?? 0).getTime())

  const matchesPlayed = rows.length
  const totalKills = rows.reduce((sum, r) => sum + r.kills, 0)
  const totalDeaths = rows.reduce((sum, r) => sum + r.deaths, 0)
  const totalFlags = rows.reduce((sum, r) => sum + r.flags, 0)
  const killsPerMatch = average(totalKills, matchesPlayed)

  const recent = rows.slice(0, 5)
  const recentAvgKills = average(
    recent.reduce((sum, r) => sum + r.kills, 0),
    recent.length,
  )

  return {
    player,
    matchesPlayed,
    killsPerMatch,
    deathsPerMatch: average(totalDeaths, matchesPlayed),
    flagsPerMatch: average(totalFlags, matchesPlayed),
    kd: calculateKD(totalKills, totalDeaths),
    winRate: calculatePlayerWinRate(player.id, stats, matches),
    mvpCount: calculatePlayerMvpCount(player.id, matches),
    experienceRaw: Math.min(1, matchesPlayed / 20) * 100,
    formRaw: killsPerMatch === 0 ? 1 : recentAvgKills / killsPerMatch,
  }
}
