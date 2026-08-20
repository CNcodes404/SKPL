import { Link } from 'react-router-dom'
import { Plus, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingState } from '@/components/shared/LoadingState'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { useAsync } from '@/hooks/useAsync'
import { listSeasons } from '@/services/seasons'
import { formatDate } from '@/lib/utils'

export default function AdminSeasons() {
  const { data: seasons, loading, error } = useAsync(() => listSeasons(), [])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-primary-900">Seasons</h1>
          <p className="text-sm text-muted-foreground">Manage tournament seasons.</p>
        </div>
        <Button asChild>
          <Link to="/admin/seasons/create">
            <Plus className="h-4 w-4" /> Create Season
          </Link>
        </Button>
      </div>

      {loading ? (
        <LoadingState rows={4} />
      ) : error ? (
        <ErrorState message="Unable to load seasons." />
      ) : !seasons || seasons.length === 0 ? (
        <EmptyState
          title="No seasons created yet."
          icon={Trophy}
          action={
            <Button asChild>
              <Link to="/admin/seasons/create">Create Season</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {seasons.map((season) => (
            <Link key={season.id} to={`/admin/seasons/${season.id}`}>
              <Card className="flex h-full flex-col gap-2 p-5 transition-shadow hover:shadow-elevated">
                <div className="flex items-center justify-between">
                  <p className="font-display text-lg font-bold text-primary-900">{season.name}</p>
                  <Badge variant={season.status === 'ACTIVE' ? 'success' : season.status === 'COMPLETED' ? 'outline' : 'default'}>
                    {season.status}
                  </Badge>
                </div>
                <CardContent className="p-0 text-sm text-muted-foreground">
                  {season.start_date ? formatDate(season.start_date) : 'No start date'} –{' '}
                  {season.end_date ? formatDate(season.end_date) : 'No end date'}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
