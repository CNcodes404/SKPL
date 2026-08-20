import { Users } from 'lucide-react'
import { TeamCard } from '@/components/shared/TeamCard'
import { LoadingGrid } from '@/components/shared/LoadingState'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { useAsync } from '@/hooks/useAsync'
import { listTeams, countChampionships } from '@/services/teams'

export default function Teams() {
  const { data, loading, error } = useAsync(async () => {
    const teams = await listTeams()
    const counts = await Promise.all(teams.map((t) => countChampionships(t.id)))
    return teams.map((team, i) => ({ team, championships: counts[i] }))
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-primary-900">Teams</h1>
        <p className="text-sm text-muted-foreground">All franchises competing in SKPL.</p>
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
