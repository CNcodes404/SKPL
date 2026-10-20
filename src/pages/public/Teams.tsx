import { useState } from 'react'
import { Users } from 'lucide-react'
import { TeamCard } from '@/components/shared/TeamCard'
import { TournamentSelector } from '@/components/shared/TournamentSelector'
import { LoadingGrid } from '@/components/shared/LoadingState'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { useAsync } from '@/hooks/useAsync'
import { listTeams, countChampionships } from '@/services/teams'
import { ALL_TOURNAMENTS, listTeamTournaments, listTournaments } from '@/services/tournaments'

export default function Teams() {
  const [tournament, setTournament] = useState(ALL_TOURNAMENTS)
  const { data: tournaments } = useAsync(() => listTournaments(), [])

  const { data, loading, error } = useAsync(async () => {
    const scope = tournament === ALL_TOURNAMENTS ? undefined : tournament
    const [allTeams, byTeam] = await Promise.all([listTeams(), listTeamTournaments()])
    // A tournament's teams are the ones registered for it.
    const teams = scope ? allTeams.filter((t) => byTeam[t.id]?.includes(scope)) : allTeams
    const counts = await Promise.all(teams.map((t) => countChampionships(t.id, scope)))
    return teams.map((team, i) => ({ team, championships: counts[i] }))
  }, [tournament])

  const current = tournaments?.find((t) => t.id === tournament)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-primary-900">Teams</h1>
          <p className="text-sm text-muted-foreground">
            {current ? `Franchises competing in ${current.name}.` : 'All franchises competing in SKPL.'}
          </p>
        </div>
        <TournamentSelector tournaments={tournaments ?? []} value={tournament} onChange={setTournament} />
      </div>

      {loading ? (
        <LoadingGrid items={8} />
      ) : error ? (
        <ErrorState message="Unable to load teams." />
      ) : !data || data.length === 0 ? (
        <EmptyState title="No teams found." icon={Users} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data.map(({ team, championships }) => (
            <TeamCard key={team.id} team={team} championships={championships} />
          ))}
        </div>
      )}
    </div>
  )
}
