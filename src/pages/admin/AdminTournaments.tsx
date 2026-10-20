import { Link } from 'react-router-dom'
import { ChevronRight, Trophy } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { LoadingState } from '@/components/shared/LoadingState'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { useAsync } from '@/hooks/useAsync'
import { listTournaments, listTeamTournaments } from '@/services/tournaments'
import { listSeasons } from '@/services/seasons'

export default function AdminTournaments() {
  const { data, loading, error } = useAsync(async () => {
    const [tournaments, seasons, teamTournaments] = await Promise.all([
      listTournaments(),
      listSeasons(),
      listTeamTournaments(),
    ])
    return { tournaments, seasons, teamTournaments }
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-primary-900">Tournaments</h1>
        <p className="text-sm text-muted-foreground">Pick a tournament to manage its seasons.</p>
      </div>

      {loading ? (
        <LoadingState rows={3} />
      ) : error ? (
        <ErrorState message="Unable to load tournaments." />
      ) : !data || data.tournaments.length === 0 ? (
        <EmptyState title="No tournaments found." icon={Trophy} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {data.tournaments.map((tournament) => {
            const seasons = data.seasons.filter((s) => s.tournament_id === tournament.id)
            const active = seasons.find((s) => s.status === 'ACTIVE')
            const teamCount = Object.values(data.teamTournaments).filter((ids) => ids.includes(tournament.id)).length
            return (
              <Link key={tournament.id} to={`/admin/tournaments/${tournament.slug}`}>
                <Card className="flex h-full flex-col gap-4 p-6 transition-shadow hover:shadow-elevated">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-50">
                        <Trophy className="h-5 w-5 text-primary-700" />
                      </div>
                      <div>
                        <p className="font-display text-xl font-bold text-primary-900">{tournament.name}</p>
                        <p className="text-xs text-muted-foreground">{tournament.description}</p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{tournament.format === 'ROUNDS' ? 'Round-based' : 'League'}</Badge>
                    <Badge variant="outline">
                      {seasons.length} season{seasons.length === 1 ? '' : 's'}
                    </Badge>
                    <Badge variant="outline">
                      {teamCount} eligible team{teamCount === 1 ? '' : 's'}
                    </Badge>
                    {active ? <Badge variant="success">Active: {active.name}</Badge> : null}
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
