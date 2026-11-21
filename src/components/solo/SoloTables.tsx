import { Link } from 'react-router-dom'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PlayerAvatar } from '@/components/shared/Avatar'
import { formatKD } from '@/utils/calculations'
import { ordinal, scoreResult, type SoloStandingRow } from '@/utils/soloStandings'
import { cn } from '@/lib/utils'
import type { Player, SoloRound, SoloRoundResult, SoloSeason } from '@/types'

const PODIUM_ROW = ['bg-yellow-50', 'bg-gray-50', 'bg-orange-50']
const PODIUM_RANK = ['text-yellow-600', 'text-gray-500', 'text-orange-600']

function PlayerCell({ player, link }: { player: Player | undefined; link: boolean }) {
  if (!player) return <span className="text-muted-foreground">Unknown player</span>
  const body = (
    <span className="flex items-center gap-2.5 font-semibold text-primary-900">
      <PlayerAvatar name={player.name} imageUrl={player.image_url} className="h-7 w-7 shrink-0 text-[10px]" />
      <span className="truncate">{player.name}</span>
    </span>
  )
  return link ? (
    <Link to={`/players/${player.id}`} className="hover:text-primary-700">
      {body}
    </Link>
  ) : (
    body
  )
}

/** Overall table: one column per completed round showing position · points. */
export function SoloStandingsTable({
  standings,
  rounds,
  players,
  linkPlayers = true,
}: {
  standings: SoloStandingRow[]
  rounds: SoloRound[]
  players: Player[]
  linkPlayers?: boolean
}) {
  const completed = rounds.filter((r) => r.status === 'COMPLETED')
  const playerById = new Map(players.map((p) => [p.id, p]))
  const anyPlayed = completed.length > 0

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">#</TableHead>
          <TableHead>Player</TableHead>
          {completed.map((r) => (
            <TableHead key={r.id} className="whitespace-nowrap text-center">
              R{r.round_number}
            </TableHead>
          ))}
          <TableHead className="text-center">Kills</TableHead>
          <TableHead className="text-center">Deaths</TableHead>
          <TableHead className="text-center">K/D</TableHead>
          <TableHead className="text-center">Wins</TableHead>
          <TableHead className="text-center">Best</TableHead>
          <TableHead className="text-center">Pts</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {standings.map((row) => {
          const podium = anyPlayed && row.rank <= 3 && row.roundsPlayed > 0 ? row.rank - 1 : -1
          return (
            <TableRow key={row.playerId} className={podium >= 0 ? PODIUM_ROW[podium] : undefined}>
              <TableCell className={cn('font-display font-extrabold', podium >= 0 ? PODIUM_RANK[podium] : 'text-primary-800')}>
                {row.rank}
              </TableCell>
              <TableCell className="min-w-[160px]">
                <PlayerCell player={playerById.get(row.playerId)} link={linkPlayers} />
              </TableCell>
              {completed.map((r) => {
                const score = row.perRound[r.id]
                return (
                  <TableCell key={r.id} className="whitespace-nowrap text-center text-xs">
                    {score ? (
                      <span>
                        <span className="font-semibold text-primary-900">{ordinal(score.position)}</span>
                        <span className="text-muted-foreground"> · {score.total}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">DNP</span>
                    )}
                  </TableCell>
                )
              })}
              <TableCell className="text-center">{row.kills}</TableCell>
              <TableCell className="text-center">{row.deaths}</TableCell>
              <TableCell className="text-center">{row.roundsPlayed ? formatKD(row.kills, row.deaths) : '–'}</TableCell>
              <TableCell className="text-center">{row.wins}</TableCell>
              <TableCell className="text-center">{row.bestFinish ? ordinal(row.bestFinish) : '–'}</TableCell>
              <TableCell className="text-center font-display text-base font-extrabold text-primary-900">{row.points}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

/** One round's finishing order with the points breakdown. */
export function SoloRoundTable({
  season,
  results,
  players,
  linkPlayers = true,
}: {
  season: SoloSeason
  results: SoloRoundResult[]
  players: Player[]
  linkPlayers?: boolean
}) {
  const playerById = new Map(players.map((p) => [p.id, p]))
  const rows = [...results].sort(
    (a, b) =>
      a.position - b.position ||
      (playerById.get(a.player_id)?.name ?? '').localeCompare(playerById.get(b.player_id)?.name ?? ''),
  )
  const tied = new Set(
    rows.filter((r, _, all) => all.filter((o) => o.position === r.position).length > 1).map((r) => r.position),
  )

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-14">Pos</TableHead>
          <TableHead>Player</TableHead>
          <TableHead className="text-center">Kills</TableHead>
          <TableHead className="text-center">Deaths</TableHead>
          <TableHead className="text-center">K/D</TableHead>
          <TableHead className="whitespace-nowrap text-center">Kill pts</TableHead>
          <TableHead className="whitespace-nowrap text-center">Pos pts</TableHead>
          <TableHead className="text-center">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const score = scoreResult(season, r)
          const podium = r.position <= 3 ? r.position - 1 : -1
          return (
            <TableRow key={r.id} className={podium >= 0 ? PODIUM_ROW[podium] : undefined}>
              <TableCell className={cn('whitespace-nowrap font-display font-extrabold', podium >= 0 ? PODIUM_RANK[podium] : 'text-primary-800')}>
                {tied.has(r.position) ? 'T-' : ''}
                {ordinal(r.position)}
              </TableCell>
              <TableCell className="min-w-[160px]">
                <PlayerCell player={playerById.get(r.player_id)} link={linkPlayers} />
              </TableCell>
              <TableCell className="text-center">{r.kills}</TableCell>
              <TableCell className="text-center">{r.deaths}</TableCell>
              <TableCell className="text-center">{formatKD(r.kills, r.deaths)}</TableCell>
              <TableCell className="text-center">{score.killPoints}</TableCell>
              <TableCell className="text-center">{score.positionPoints}</TableCell>
              <TableCell className="text-center font-display text-base font-extrabold text-primary-900">{score.total}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

/** "1 kill = 1 pt" plus the season's position-points table. */
export function SoloPointsRules({ season }: { season: SoloSeason }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/30 p-4">
      <p className="text-sm text-primary-900">
        <span className="font-semibold">Round points</span> = kills × {season.points_per_kill} + position points. Players
        with the same kills share a position. The most total points after all rounds wins; ties go to more kills, then the
        best single-round finish, then the latest round's position.
      </p>
      <div className="flex flex-wrap gap-2">
        {season.position_points.map((pts, i) => (
          <span
            key={i}
            className={cn(
              'rounded-md border px-2 py-1 text-xs font-semibold',
              i < 3 ? 'border-accent-300 bg-accent-50 text-accent-800' : 'border-border bg-white text-primary-800',
            )}
          >
            {ordinal(i + 1)}: {pts}
          </span>
        ))}
        <span className="rounded-md border border-border bg-white px-2 py-1 text-xs text-muted-foreground">
          Lower: 0
        </span>
      </div>
    </div>
  )
}
