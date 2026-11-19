import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listSeasons } from '@/services/seasons'
import { ALL_TOURNAMENTS, listTournaments } from '@/services/tournaments'
import type { Season, Tournament } from '@/types'
import { ALL_SEASONS } from '@/components/shared/SeasonSelector'
import { cached, getCached } from '@/lib/queryCache'

const SEASONS_KEY = 'filter:seasons'
const TOURNAMENTS_KEY = 'filter:tournaments'

/**
 * Tournament + season filter for public pages. `seasons` is the list for the
 * chosen tournament (all seasons when the tournament is "All"). Changing the
 * tournament selects its latest season.
 *
 * allowAll: the season list offers "All Seasons".
 * requireTournament: no "All Tournaments" — starts on the first tournament.
 * startOnFirstTournament: starts on the first tournament (SKCTF League) but
 *   still allows picking "All Tournaments".
 * initialTournament / initialSeason: start here (e.g. from the URL) when valid.
 * syncUrl: keep the selection in the URL (?tournament=&season=) so the back
 *   button and shared links return to it. URL values override the initial ones.
 */
export function useSeasonFilter(
  allowAll = true,
  {
    requireTournament = false,
    startOnFirstTournament = false,
    initialTournament,
    initialSeason,
    syncUrl = false,
  }: {
    requireTournament?: boolean
    startOnFirstTournament?: boolean
    initialTournament?: string | null
    initialSeason?: string | null
    syncUrl?: boolean
  } = {},
) {
  const [searchParams, setSearchParams] = useSearchParams()
  const wantTournament = (syncUrl && searchParams.get('tournament')) || initialTournament
  const wantSeason = (syncUrl && searchParams.get('season')) || initialSeason

  const seasonsOf = (tournamentId: string, list: Season[]) =>
    tournamentId === ALL_TOURNAMENTS ? list : list.filter((s) => s.tournament_id === tournamentId)

  const pickDefault = (list: Season[]) => (list.length > 0 ? list[0].id : allowAll ? ALL_SEASONS : '')

  function resolveStart(seasonData: Season[], tournamentData: Tournament[]) {
    const startTournament = tournamentData.some((t) => t.id === wantTournament)
      ? (wantTournament as string)
      : wantTournament === ALL_TOURNAMENTS && !requireTournament
        ? ALL_TOURNAMENTS
        : (requireTournament || startOnFirstTournament) && tournamentData[0]
          ? tournamentData[0].id
          : ALL_TOURNAMENTS
    const visible = seasonsOf(startTournament, seasonData)
    const startSeason =
      wantSeason && (visible.some((s) => s.id === wantSeason) || (allowAll && wantSeason === ALL_SEASONS))
        ? wantSeason
        : pickDefault(visible)
    return { startTournament, startSeason }
  }

  // When the lists are already cached (e.g. coming back to the page), start
  // on the right selection immediately instead of after a fetch.
  const [initial] = useState(() => {
    const s = getCached<Season[]>(SEASONS_KEY)
    const t = getCached<Tournament[]>(TOURNAMENTS_KEY)
    return s && t ? { seasons: s, tournaments: t, ...resolveStart(s, t) } : null
  })

  const [allSeasons, setAllSeasons] = useState<Season[]>(initial?.seasons ?? [])
  const [tournaments, setTournaments] = useState<Tournament[]>(initial?.tournaments ?? [])
  const [tournament, setTournamentState] = useState<string>(initial?.startTournament ?? ALL_TOURNAMENTS)
  const [selected, setSelected] = useState<string>(initial?.startSeason ?? '')
  const [loading, setLoading] = useState(!initial)

  useEffect(() => {
    if (initial) return
    let active = true
    Promise.all([cached(SEASONS_KEY, listSeasons), cached(TOURNAMENTS_KEY, listTournaments)])
      .then(([seasonData, tournamentData]) => {
        if (!active) return
        const { startTournament, startSeason } = resolveStart(seasonData, tournamentData)
        setAllSeasons(seasonData)
        setTournaments(tournamentData)
        setTournamentState(startTournament)
        setSelected(startSeason)
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

  // Mirror the selection into the URL (replacing, not adding, history entries).
  useEffect(() => {
    if (!syncUrl || loading || !selected) return
    if (searchParams.get('tournament') === tournament && searchParams.get('season') === selected) return
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        params.set('tournament', tournament)
        params.set('season', selected)
        return params
      },
      { replace: true },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncUrl, loading, tournament, selected])

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
