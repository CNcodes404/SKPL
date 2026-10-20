import { Link } from 'react-router-dom'
import { Trophy } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SeasonSelector, ALL_SEASONS } from '@/components/shared/SeasonSelector'
import { TournamentSelector } from '@/components/shared/TournamentSelector'
import { RoundsProgressView } from '@/components/rounds/RoundsProgressView'
import { TeamLogo } from '@/components/shared/Avatar'
import { LoadingState } from '@/components/shared/LoadingState'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { useSeasonFilter } from '@/hooks/useSeasonFilter'
import { useAsync } from '@/hooks/useAsync'
import { getSeasonTeams } from '@/services/seasons'
import { listMatches, listMatchesRaw } from '@/services/matches'
import { listSeasonRounds } from '@/services/rounds'
import { calculateStandings } from '@/utils/calculations'
import { cn } from '@/lib/utils'

export default function Standings() {
  const {
    seasons,
    selected,
    setSelected,
    selectedSeason,
    loading: seasonsLoading,
    tournaments,
    tournament,
    setTournament,
    selectedTournament,
  } = useSeasonFilter(false, { requireTournament: true })
  const isRounds = selectedTournament?.format === 'ROUNDS'

  const { data: standings, loading, error } = useAsync(async () => {
    if (!selected || selected === ALL_SEASONS || !selectedSeason || isRounds) return []
    const [teams, matches] = await Promise.all([getSeasonTeams(selected), listMatchesRaw(selected)])
    return calculateStandings(teams, matches, selectedSeason)
  }, [selected, selectedSeason, isRounds])

  // Round-based seasons have no points table: show the rounds instead.
  const { data: roundsData, loading: roundsLoading } = useAsync(async () => {
    if (!isRounds || !selectedSeason) return null
    const [rounds, teams, matches] = await Promise.all([
      listSeasonRounds(selectedSeason.id),
      getSeasonTeams(selectedSeason.id),
      listMatches({ seasonId: selectedSeason.id }),
    ])
    return { rounds, teams, matches }
  }, [isRounds, selectedSeason?.id])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-primary-900">Standings</h1>
          <p className="text-sm text-muted-foreground">
            {isRounds
              ? 'Round by round: who went through, who was eliminated, and the champion.'
              : 'Regular-season table. Playoff and tie-breaker matches are excluded.'}
          </p>
        </div>
        {!seasonsLoading ? (
          <div className="flex flex-wrap items-center gap-3">
            <TournamentSelector
              tournaments={tournaments}
              value={tournament}
              onChange={setTournament}
              includeAllOption={false}
            />
            {seasons.length > 0 ? (
              <SeasonSelector seasons={seasons} value={selected} onChange={setSelected} includeAllOption={false} />
            ) : null}
          </div>
        ) : null}
      </div>

      {seasonsLoading || loading || roundsLoading ? (
        <LoadingState rows={6} />
      ) : error ? (
        <ErrorState message="Unable to load standings." />
      ) : seasons.length === 0 ? (
        <EmptyState title="No seasons created yet." icon={Trophy} />
      ) : isRounds ? (
        roundsData && selectedSeason && roundsData.rounds.length > 0 ? (
          <RoundsProgressView
            season={selectedSeason}
            rounds={roundsData.rounds}
            roundTeams={Object.fromEntries(roundsData.rounds.map((r) => [r.id, r.teamIds]))}
            teams={roundsData.teams}
            matches={roundsData.matches}
          />
        ) : (
          <EmptyState title="No rounds in this season yet." icon={Trophy} />
        )
      ) : !standings || standings.length === 0 ? (
        <EmptyState title="No teams in this season yet." icon={Trophy} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Team</TableHead>
              <TableHead className="text-center">MP</TableHead>
              <TableHead className="text-center">W</TableHead>
              <TableHead className="text-center">L</TableHead>
              <TableHead className="text-center">+/-</TableHead>
              <TableHead>Form</TableHead>
              <TableHead className="text-center">Pts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {standings.map((row, i) => (
              <TableRow key={row.team.id}>
                <TableCell className="font-display font-extrabold text-primary-800">{i + 1}</TableCell>
                <TableCell>
                  <Link to={`/teams/${row.team.id}`} className="flex items-center gap-2.5 font-semibold text-primary-900 hover:text-primary-700">
                    <TeamLogo name={row.team.name} logoUrl={row.team.logo_url} className="h-7 w-7 shrink-0 text-[10px]" />
                    {row.team.name}
                  </Link>
                </TableCell>
                <TableCell className="text-center">{row.played}</TableCell>
                <TableCell className="text-center">{row.wins}</TableCell>
                <TableCell className="text-center">{row.losses}</TableCell>
                <TableCell className={cn('text-center font-semibold', row.scoreDiff > 0 ? 'text-green-600' : row.scoreDiff < 0 ? 'text-red-600' : '')}>
                  {row.scoreDiff > 0 ? '+' : ''}
                  {row.scoreDiff}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {row.form.map((r, idx) => (
                      <span
                        key={idx}
                        className={cn(
                          'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white',
                          r === 'W' ? 'bg-green-600' : 'bg-red-600',
                        )}
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-center font-display font-extrabold text-primary-900">{row.points}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
