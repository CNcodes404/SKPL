import { useState } from 'react'
import { Swords } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FilterBar } from '@/components/shared/FilterBar'
import { SeasonSelector, ALL_SEASONS } from '@/components/shared/SeasonSelector'
import { MatchCard } from '@/components/shared/MatchCard'
import { LoadingGrid } from '@/components/shared/LoadingState'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { useSeasonFilter } from '@/hooks/useSeasonFilter'
import { useAsync } from '@/hooks/useAsync'
import { listMatches } from '@/services/matches'
import { listTeams } from '@/services/teams'

export default function Matches() {
  const { seasons, selected, setSelected } = useSeasonFilter()
  const [teamId, setTeamId] = useState<string>('ALL')
  const [tab, setTab] = useState<'upcoming' | 'recent'>('upcoming')

  const { data: teams } = useAsync(() => listTeams(), [])

  const { data: matches, loading, error } = useAsync(async () => {
    if (!selected) return []
    return listMatches({
      seasonId: selected === ALL_SEASONS ? undefined : selected,
      teamId: teamId === 'ALL' ? undefined : teamId,
    })
  }, [selected, teamId])

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
        <h1 className="font-display text-3xl font-bold text-primary-900">Matches</h1>
        <p className="text-sm text-muted-foreground">Fixtures and results across the league.</p>
      </div>

      <FilterBar>
        <SeasonSelector seasons={seasons} value={selected} onChange={setSelected} />
        <Select value={teamId} onValueChange={setTeamId}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Teams</SelectItem>
            {(teams ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'upcoming' | 'recent')}>
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="recent">Recent</TabsTrigger>
        </TabsList>
        <TabsContent value={tab}>
          {loading ? (
            <LoadingGrid items={6} />
          ) : error ? (
            <ErrorState message="Unable to load matches." />
          ) : list.length === 0 ? (
            <EmptyState
              title={tab === 'upcoming' ? 'No matches scheduled.' : 'No results yet.'}
              icon={Swords}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((m) => (
                <MatchCard key={m.id} match={m} linkTo={m.status === 'COMPLETED' ? `/matches/${m.id}` : undefined} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
