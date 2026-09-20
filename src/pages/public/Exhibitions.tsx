import { useState } from 'react'
import { Zap } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MatchCard } from '@/components/shared/MatchCard'
import { LoadingGrid } from '@/components/shared/LoadingState'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { useAsync } from '@/hooks/useAsync'
import { listExhibitionMatches } from '@/services/matches'

export default function Exhibitions() {
  const [tab, setTab] = useState<'upcoming' | 'recent'>('recent')

  const { data: matches, loading, error } = useAsync(() => listExhibitionMatches(), [])

  const upcoming = (matches ?? [])
    .filter((m) => m.status === 'SCHEDULED')
    .sort((a, b) => new Date(a.scheduled_at ?? 0).getTime() - new Date(b.scheduled_at ?? 0).getTime())

  const recent = (matches ?? [])
    .filter((m) => m.status !== 'SCHEDULED')
    .sort((a, b) => new Date(b.scheduled_at ?? 0).getTime() - new Date(a.scheduled_at ?? 0).getTime())

  const list = tab === 'upcoming' ? upcoming : recent

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-primary-900">Exhibition Matches</h1>
        <p className="text-sm text-muted-foreground">
          One-off matches outside any tournament season. Turn on "Include Exhibitions" on Stats, Player, and Team
          pages to see how these factor into all-time numbers.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'upcoming' | 'recent')}>
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="recent">Recent</TabsTrigger>
        </TabsList>
        <TabsContent value={tab}>
          {loading ? (
            <LoadingGrid items={6} />
          ) : error ? (
            <ErrorState message="Unable to load exhibition matches." />
          ) : list.length === 0 ? (
            <EmptyState title={tab === 'upcoming' ? 'No exhibitions scheduled.' : 'No exhibition results yet.'} icon={Zap} />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((m) => (
                <MatchCard key={m.id} match={m} linkTo={m.status === 'COMPLETED' ? `/exhibitions/${m.id}` : undefined} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
