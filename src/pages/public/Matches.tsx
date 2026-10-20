import { useState } from 'react'
import { Swords } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FilterBar } from '@/components/shared/FilterBar'
import { SeasonSelector, ALL_SEASONS } from '@/components/shared/SeasonSelector'
import { TournamentSelector } from '@/components/shared/TournamentSelector'
import { MatchCard } from '@/components/shared/MatchCard'
import { LoadingGrid } from '@/components/shared/LoadingState'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { useSeasonFilter } from '@/hooks/useSeasonFilter'
import { useAsync } from '@/hooks/useAsync'
import { listMatches } from '@/services/matches'
import { listTeams } from '@/services/teams'
import { listRoundsForSeasons } from '@/services/rounds'
import type { MatchWithTeams } from '@/types'
import { useLiveMatches } from '@/context/LiveMatchesContext'

export default function Matches() {
  const { seasons, selected, setSelected, selectedSeason, tournaments, tournament, setTournament, tournamentScope } =
    useSeasonFilter()
  const [teamId, setTeamId] = useState<string>('ALL')
  const [tab, setTab] = useState<'upcoming' | 'recent'>('upcoming')

  const { getLive } = useLiveMatches()
  const { data: teams } = useAsync(() => listTeams(), [])

  const { data: matches, loading, error } = useAsync(async () => {
    if (!selected) return []
    const list = await listMatches({
      seasonId: selected === ALL_SEASONS ? undefined : selected,
      teamId: teamId === 'ALL' ? undefined : teamId,
    })
    if (selected !== ALL_SEASONS || !tournamentScope) return list
    // All seasons of one tournament.
    const seasonIds = new Set(seasons.map((s) => s.id))
    return list.filter((m) => m.season_id && seasonIds.has(m.season_id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, teamId, tournamentScope])

  // Round-based seasons list their matches round by round.
  const isRoundsSeason = tournaments.find((t) => t.id === selectedSeason?.tournament_id)?.format === 'ROUNDS'
  const { data: rounds } = useAsync(async () => {
    if (!isRoundsSeason || !selectedSeason) return []
    return listRoundsForSeasons([selectedSeason.id])
  }, [isRoundsSeason, selectedSeason?.id])

  const upcoming = (matches ?? [])
    .filter((m) => m.status === 'SCHEDULED')
    .sort(
      (a, b) =>
        Number(Boolean(getLive(b.id))) - Number(Boolean(getLive(a.id))) ||
        new Date(a.scheduled_at ?? 0).getTime() - new Date(b.scheduled_at ?? 0).getTime(),
    )

  const recent = (matches ?? [])
    .filter((m) => m.status !== 'SCHEDULED')
    .sort((a, b) => new Date(b.scheduled_at ?? 0).getTime() - new Date(a.scheduled_at ?? 0).getTime())

  const list = tab === 'upcoming' ? upcoming : recent

  const groups: { key: string; title: string | null; matches: MatchWithTeams[] }[] =
    isRoundsSeason && rounds && rounds.length > 0
      ? [...rounds]
          .sort((a, b) => (tab === 'upcoming' ? a.round_number - b.round_number : b.round_number - a.round_number))
          .map((r) => ({ key: r.id, title: r.name, matches: list.filter((m) => m.round_id === r.id) }))
          .concat([{ key: 'none', title: 'Other', matches: list.filter((m) => !m.round_id) }])
          .filter((g) => g.matches.length > 0)
      : [{ key: 'all', title: null, matches: list }]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-primary-900">Matches</h1>
        <p className="text-sm text-muted-foreground">Fixtures and results across the league.</p>
      </div>

      <FilterBar>
        <TournamentSelector tournaments={tournaments} value={tournament} onChange={setTournament} />
        <SeasonSelector seasons={seasons} value={selected} onChange={setSelected} tournaments={tournaments} />
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
            <div className="flex flex-col gap-6">
              {groups.map((group) => (
                <div key={group.key} className="flex flex-col gap-3">
                  {group.title ? (
                    <h2 className="font-display text-lg font-bold text-primary-900">{group.title}</h2>
                  ) : null}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {group.matches.map((m) => (
                      <MatchCard key={m.id} match={m} linkTo={m.status === 'COMPLETED' ? `/matches/${m.id}` : undefined} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
