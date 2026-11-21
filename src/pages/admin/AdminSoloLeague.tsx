import { Link } from 'react-router-dom'
import { Crosshair, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { LoadingState } from '@/components/shared/LoadingState'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { useAsync } from '@/hooks/useAsync'
import { listSoloSeasons } from '@/services/solo'
import { formatDate } from '@/lib/utils'

export default function AdminSoloLeague() {
  const { data: seasons, loading, error } = useAsync(() => listSoloSeasons(), [])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-primary-900">Solo League</h1>
          <p className="text-sm text-muted-foreground">
            Free-for-all seasons. Enter each round's kills and deaths; positions and points are worked out for you.
          </p>
        </div>
        <Button asChild>
          <Link to="/admin/solo-league/create">
            <Plus className="h-4 w-4" /> Create Season
          </Link>
        </Button>
      </div>

      {loading ? (
        <LoadingState rows={3} />
      ) : error ? (
        <ErrorState message="Unable to load Solo League seasons. Has migration 0026_solo_league.sql been run?" />
      ) : !seasons || seasons.length === 0 ? (
        <EmptyState
          title="No Solo League seasons yet."
          icon={Crosshair}
          action={
            <Button asChild>
              <Link to="/admin/solo-league/create">Create Season</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {seasons.map((season) => (
            <Link key={season.id} to={`/admin/solo-league/${season.id}`}>
              <Card className="flex h-full flex-col gap-2 p-5 transition-shadow hover:shadow-elevated">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-display text-lg font-bold text-primary-900">{season.name}</p>
                  <Badge variant={season.status === 'ACTIVE' ? 'success' : season.status === 'COMPLETED' ? 'outline' : 'default'}>
                    {season.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {season.start_date ? formatDate(season.start_date) : 'No date set'} · up to {season.max_players} players
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
