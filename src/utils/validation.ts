export interface PlayerStatInput {
  player_id: string
  kills: number
  deaths: number
  flags: number
}

export function isNonNegativeInteger(n: number): boolean {
  return Number.isInteger(n) && n >= 0
}

export function validateMatchEntry(params: {
  teamAScore: number
  teamBScore: number
  teamAStats: PlayerStatInput[]
  teamBStats: PlayerStatInput[]
}): string[] {
  const errors: string[] = []
  const { teamAScore, teamBScore, teamAStats, teamBStats } = params

  if (!isNonNegativeInteger(teamAScore) || !isNonNegativeInteger(teamBScore)) {
    errors.push('Scores must be non-negative whole numbers.')
  }

  for (const stats of [...teamAStats, ...teamBStats]) {
    if (
      !isNonNegativeInteger(stats.kills) ||
      !isNonNegativeInteger(stats.deaths) ||
      !isNonNegativeInteger(stats.flags)
    ) {
      errors.push('Kills, deaths and flags must be non-negative whole numbers for every player.')
      break
    }
  }

  const sumFlagsA = teamAStats.reduce((sum, s) => sum + (Number(s.flags) || 0), 0)
  const sumFlagsB = teamBStats.reduce((sum, s) => sum + (Number(s.flags) || 0), 0)

  if (sumFlagsA !== teamAScore) {
    errors.push(`Team A score (${teamAScore}) must equal the sum of Team A player flags (${sumFlagsA}).`)
  }
  if (sumFlagsB !== teamBScore) {
    errors.push(`Team B score (${teamBScore}) must equal the sum of Team B player flags (${sumFlagsB}).`)
  }

  return errors
}
