import { useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SeasonSelector } from '@/components/shared/SeasonSelector'
import { LoadingState } from '@/components/shared/LoadingState'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { useSeasonFilter } from '@/hooks/useSeasonFilter'
import { useAsync } from '@/hooks/useAsync'
import { getPlayerStatsForScope } from '@/services/stats'
import { PLAYER_STAT_LABELS, isPlayerStatType, playerStatValue, playerStatDisplay } from '@/utils/statTypes'

export default function StatsPlayerFull() {
  const { statType = '' } = useParams()
  const [searchParams] = useSearchParams()
  const { seasons, selected, setSelected } = useSeasonFilter()
  const [search, setSearch] = useState('')

  const initialSeason = searchParams.get('season')
  useMemo(() => {
    if (initialSeason) setSelected(initialSeason)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { data: stats, loading, error } = useAsync(async () => {
    if (!selected) return []
    return getPlayerStatsForScope(selected)
  }, [selected])

  if (!isPlayerStatType(statType)) {
    return <ErrorState message="Unknown statistic." />
  }

  const filtered = (stats ?? [])
    .filter((s) => s.player.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => playerStatValue(b, statType) - playerStatValue(a, statType))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-primary-900">{PLAYER_STAT_LABELS[statType]}</h1>
        <p className="text-sm text-muted-foreground">Full player ranking.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SeasonSelector seasons={seasons} value={selected} onChange={setSelected} />
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search players…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {loading ? (
        <LoadingState rows={8} />
      ) : error ? (
        <ErrorState message="Unable to load statistics." />
      ) : filtered.length === 0 ? (
        <EmptyState title="No statistics available." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rank</TableHead>
              <TableHead>Player</TableHead>
              <TableHead>Team</TableHead>
              <TableHead className="text-right">{PLAYER_STAT_LABELS[statType]}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((s, i) => (
              <TableRow key={s.player.id}>
                <TableCell className="font-display font-extrabold text-primary-800">{i + 1}</TableCell>
                <TableCell className="font-semibold text-primary-900">{s.player.name}</TableCell>
                <TableCell className="text-muted-foreground">{s.team?.name ?? '—'}</TableCell>
                <TableCell className="text-right font-display font-bold text-primary-800">
                  {playerStatDisplay(s, statType)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
