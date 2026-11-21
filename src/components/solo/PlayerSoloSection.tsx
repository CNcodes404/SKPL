import { Link } from 'react-router-dom'
import { Crosshair, Trophy } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAsync } from '@/hooks/useAsync'
import { getPlayerSoloHistory } from '@/services/solo'
import { formatKD } from '@/utils/calculations'
import { ordinal } from '@/utils/soloStandings'

/**
 * Player profile: Solo League record across every season, kept separate from
 * the team stats above it. Hidden for players who never played solo.
 */
export function PlayerSoloSection({ playerId }: { playerId: string }) {
  const { data: history } = useAsync(async () => {
    try {
      return await getPlayerSoloHistory(playerId)
    } catch (err) {
      // Solo tables not created yet, or a network error: just hide the section.
      console.error(err)
      return []
    }
  }, [playerId])

  if (!history || history.length === 0) return null

  const totals = history.reduce(
    (acc, { row }) => ({
      rounds: acc.rounds + row.roundsPlayed,
      points: acc.points + row.points,
      kills: acc.kills + row.kills,
      deaths: acc.deaths + row.deaths,
      wins: acc.wins + row.wins,
      podiums: acc.podiums + row.podiums,
    }),
    { rounds: 0, points: 0, kills: 0, deaths: 0, wins: 0, podiums: 0 },
  )
  const hasPlayed = (h: (typeof history)[number]) => h.row.roundsPlayed > 0
  const titles = history.filter((h) => h.data.season.status === 'COMPLETED' && h.row.rank === 1 && hasPlayed(h)).length
  const finishes = history.filter(hasPlayed).map((h) => h.row.rank)
  const bestSeasonFinish = finishes.length ? Math.min(...finishes) : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Crosshair className="h-4 w-4 text-accent-500" /> Solo League
          {titles > 0 ? (
            <Badge variant="outline" className="flex items-center gap-1 border-yellow-500 bg-yellow-200 text-yellow-900">
              <Trophy className="h-3.5 w-3.5" /> Champion ×{titles}
            </Badge>
          ) : null}
        </CardTitle>
        <p className="text-xs text-muted-foreground">All Solo League seasons. Not included in the team stats above.</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
          <Stat label="Seasons" value={history.length} />
          <Stat label="Best Finish" value={bestSeasonFinish ? ordinal(bestSeasonFinish) : '–'} />
          <Stat label="Rounds Played" value={totals.rounds} />
          <Stat label="Round Wins" value={totals.wins} />
          <Stat label="Points" value={totals.points} />
          <Stat label="Kills" value={totals.kills} />
          <Stat label="Deaths" value={totals.deaths} />
          <Stat label="KD" value={totals.rounds ? formatKD(totals.kills, totals.deaths) : '–'} />
        </div>

        <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {history.map(({ data, row }) => {
            const completed = data.rounds.filter((r) => r.status === 'COMPLETED')
            const isDone = data.season.status === 'COMPLETED'
            return (
              <Link
                key={data.season.id}
                to={`/solo-league?season=${data.season.id}`}
                className="flex flex-col gap-2 p-4 transition-colors hover:bg-secondary/40 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-primary-900">
                    {data.season.name}
                    {row.roundsPlayed > 0 ? (
                      <Badge variant={isDone && row.rank === 1 ? 'accent' : 'outline'}>
                        {isDone ? '' : 'Currently '}
                        {ordinal(row.rank)} of {data.standings.length}
                      </Badge>
                    ) : (
                      <Badge variant="outline">No rounds played yet</Badge>
                    )}
                    {!isDone ? <Badge variant="success">In progress</Badge> : null}
                  </p>
                  {completed.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {completed
                        .map((r) => {
                          const s = row.perRound[r.id]
                          return `R${r.round_number}: ${s ? `${ordinal(s.position)} (${s.total} pts)` : 'DNP'}`
                        })
                        .join(' · ')}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-5 text-right">
                  <MiniStat label="Pts" value={row.points} />
                  <MiniStat label="Kills" value={row.kills} />
                  <MiniStat label="KD" value={row.roundsPlayed ? formatKD(row.kills, row.deaths) : '–'} />
                </div>
              </Link>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center sm:text-left">
      <p className="font-display text-2xl font-extrabold text-primary-800">{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="font-display text-lg font-extrabold text-primary-900">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  )
}
