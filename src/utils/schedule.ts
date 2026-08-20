export interface GeneratedPairing {
  team_a_id: string
  team_b_id: string
}

/**
 * Deterministic round-robin generator. Every unordered pair of teams appears
 * exactly `matchesPerOpponent` times, alternating home/away across repeats.
 */
export function generateSchedule(teamIds: string[], matchesPerOpponent: number): GeneratedPairing[] {
  const pairings: GeneratedPairing[] = []

  for (let rep = 0; rep < matchesPerOpponent; rep++) {
    for (let i = 0; i < teamIds.length; i++) {
      for (let j = i + 1; j < teamIds.length; j++) {
        const swap = rep % 2 === 1
        pairings.push({
          team_a_id: swap ? teamIds[j] : teamIds[i],
          team_b_id: swap ? teamIds[i] : teamIds[j],
        })
      }
    }
  }

  return pairings
}

export function expectedMatchCount(teamCount: number, matchesPerOpponent: number): number {
  return (teamCount * (teamCount - 1) * matchesPerOpponent) / 2
}
