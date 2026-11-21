import { Link } from 'react-router-dom'
import { ArrowRight, Crosshair, Trophy } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PlayerAvatar } from '@/components/shared/Avatar'
import { useAsync } from '@/hooks/useAsync'
import { getFeaturedSoloSeason } from '@/services/solo'
import { formatKD } from '@/utils/calculations'
import { cn } from '@/lib/utils'

const MEDAL = ['bg-yellow-400 text-yellow-950', 'bg-gray-300 text-gray-800', 'bg-orange-300 text-orange-950']

/** Home page: the current (or latest) Solo League season's top 3. Hidden when there is no season. */
export function SoloHomeCard() {
  const { data } = useAsync(() => getFeaturedSoloSeason(), [], { cache: 'solo-home' })
  if (!data) return null

  const { season, standings, rounds, players } = data
  const completed = rounds.filter((r) => r.status === 'COMPLETED').length
  const top = completed > 0 ? standings.filter((r) => r.roundsPlayed > 0).slice(0, 3) : []
  const playerById = new Map(players.map((p) => [p.id, p]))
  const isDone = season.status === 'COMPLETED'

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-2xl font-bold text-primary-900">
          <Crosshair className="h-6 w-6 text-accent-500" /> Solo League
        </h2>
        <Link to={`/solo-league?season=${season.id}`} className="text-sm font-semibold text-primary-700 hover:underline">
          View standings
        </Link>
      </div>
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-display text-lg font-bold text-primary-900">{season.name}</p>
          <Badge variant={isDone ? 'outline' : 'success'}>{isDone ? 'Completed' : 'In progress'}</Badge>
          <span className="text-sm text-muted-foreground">
            {completed} of {rounds.length} rounds played · {players.length} players
          </span>
        </div>

        {top.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            Standings appear after the first round is completed.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {top.map((row, i) => {
              const player = playerById.get(row.playerId)
              return (
                <Link
                  key={row.playerId}
                  to={`/players/${row.playerId}`}
                  className="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-secondary/50"
                >
                  <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-display text-sm font-extrabold', MEDAL[i])}>
                    {i + 1}
                  </span>
                  <PlayerAvatar name={player?.name ?? '?'} imageUrl={player?.image_url} className="h-9 w-9 shrink-0 text-xs" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 truncate font-semibold text-primary-900">
                      {player?.name ?? 'Unknown'}
                      {isDone && i === 0 ? <Trophy className="h-3.5 w-3.5 shrink-0 text-accent-500" /> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.kills} kills · K/D {formatKD(row.kills, row.deaths)}
                    </p>
                  </div>
                  <span className="font-display text-lg font-extrabold text-primary-900">{row.points}</span>
                </Link>
              )
            })}
          </div>
        )}

        <Link
          to={`/solo-league?season=${season.id}`}
          className="flex items-center justify-center gap-1 self-start text-sm font-semibold text-primary-700 hover:underline"
        >
          Full standings and round results <ArrowRight className="h-4 w-4" />
        </Link>
      </Card>
    </section>
  )
}
