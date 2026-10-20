import { useEffect, useState } from 'react'
import { listSeasons } from '@/services/seasons'
import { ALL_TOURNAMENTS, listTournaments } from '@/services/tournaments'
import type { Season, Tournament } from '@/types'
import { ALL_SEASONS } from '@/components/shared/SeasonSelector'

/**
 * Tournament + season filter for public pages. `seasons` is the list for the
 * chosen tournament (all seasons when the tournament is "All"). Changing the
 * tournament selects its latest season.
 *
 * allowAll: the season list offers "All Seasons".
 * requireTournament: no "All Tournaments" — starts on the first tournament.
 * initialTournament / initialSeason: start here (e.g. from the URL) when valid.
 */
export function useSeasonFilter(
  allowAll = true,
  {
    requireTournament = false,
    initialTournament,
    initialSeason,
  }: { requireTournament?: boolean; initialTournament?: string | null; initialSeason?: string | null } = {},
) {
  const [allSeasons, setAllSeasons] = useState<Season[]>([])
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [tournament, setTournamentState] = useState<string>(ALL_TOURNAMENTS)
  const [selected, setSelected] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const seasonsOf = (tournamentId: string, list: Season[]) =>
    tournamentId === ALL_TOURNAMENTS ? list : list.filter((s) => s.tournament_id === tournamentId)

  const pickDefault = (list: Season[]) => (list.length > 0 ? list[0].id : allowAll ? ALL_SEASONS : '')

  useEffect(() => {
    let active = true
    Promise.all([listSeasons(), listTournaments()])
      .then(([seasonData, tournamentData]) => {
        if (!active) return
        setAllSeasons(seasonData)
        setTournaments(tournamentData)
        const startTournament = tournamentData.some((t) => t.id === initialTournament)
          ? (initialTournament as string)
          : requireTournament && tournamentData[0]
            ? tournamentData[0].id
            : ALL_TOURNAMENTS
        const visible = seasonsOf(startTournament, seasonData)
        setTournamentState(startTournament)
        setSelected(
          initialSeason && (visible.some((s) => s.id === initialSeason) || (allowAll && initialSeason === ALL_SEASONS))
            ? initialSeason
            : pickDefault(visible),
        )
      })
      .catch((err) => console.error(err))
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowAll, requireTournament])

  function setTournament(tournamentId: string) {
    setTournamentState(tournamentId)
    setSelected(pickDefault(seasonsOf(tournamentId, allSeasons)))
  }

  const seasons = seasonsOf(tournament, allSeasons)
  const selectedSeason = allSeasons.find((s) => s.id === selected) ?? null
  const selectedTournament = tournaments.find((t) => t.id === tournament) ?? null

  return {
    seasons,
    selected,
    setSelected,
    selectedSeason,
    loading,
    tournaments,
    tournament,
    setTournament,
    selectedTournament,
    /** The tournament to scope "All Seasons" queries to, or undefined for every tournament. */
    tournamentScope: tournament === ALL_TOURNAMENTS ? undefined : tournament,
  }
}
