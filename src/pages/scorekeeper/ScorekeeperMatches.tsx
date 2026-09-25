import { Link } from 'react-router-dom'
import { Radio, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TeamLogo } from '@/components/shared/Avatar'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { useAuth } from '@/context/AuthContext'
import { useAsync } from '@/hooks/useAsync'
import { listTrackableMatches } from '@/services/scorekeeper'
import { formatDateTime } from '@/lib/utils'
import { MATCH_TYPE_LABELS, type MatchLiveSession } from '@/types'

/** Matches the database treats as locked by someone else (heartbeat in the last 2 minutes). */
function isLockedByOther(session: MatchLiveSession | undefined, userId: string | undefined) {
  if (!session || session.status !== 'LIVE' || session.scorekeeper_id === userId) return false
  return Date.now() - new Date(session.heartbeat_at).getTime() < 2 * 60 * 1000
}

export default function ScorekeeperMatches() {
  const { user } = useAuth()
  const { data, loading, error, reload } = useAsync(listTrackableMatches, [])

  if (loading) return <LoadingState rows={4} />
  if (error || !data) return <ErrorState message={error ?? 'Unable to load matches.'} />

  const sessionByMatch = new Map(data.sessions.map((s) => [s.match_id, s]))

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-primary-900">Track a match</h1>
          <p className="text-sm text-muted-foreground">Pick the scheduled match you are spectating.</p>
        </div>
        <Button variant="outline" size="sm" onClick={reload}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {data.matches.length === 0 ? (
        <EmptyState title="No scheduled matches" description="There is nothing to track right now." />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Scheduled matches</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border p-0">
            {data.matches.map((match) => {
              const session = sessionByMatch.get(match.id)
              const lockedByOther = isLockedByOther(session, user?.id)
              const mine = session?.status === 'LIVE' && session.scorekeeper_id === user?.id
              return (
                <div key={match.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <TeamLogo name={match.team_a.name} logoUrl={match.team_a.logo_url} className="h-9 w-9 text-xs" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-primary-900">
                        {match.team_a.name} vs {match.team_b.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(match.scheduled_at)} · {MATCH_TYPE_LABELS[match.match_type]}
                        {match.stage_label ? ` · ${match.stage_label}` : ''}
                      </p>
                    </div>
                    <TeamLogo name={match.team_b.name} logoUrl={match.team_b.logo_url} className="h-9 w-9 text-xs" />
                  </div>
                  <div className="flex items-center gap-2">
                    {lockedByOther ? <Badge variant="accent">Being tracked</Badge> : null}
                    {mine ? <Badge variant="success">You are tracking</Badge> : null}
                    {lockedByOther ? (
                      <Button size="sm" variant="outline" disabled>
                        <Radio className="h-4 w-4" /> Track
                      </Button>
                    ) : (
                      <Button asChild size="sm">
                        <Link to={`/scorekeeper/matches/${match.id}`}>
                          <Radio className="h-4 w-4" /> {mine ? 'Resume' : 'Track'}
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
