import { Link } from 'react-router-dom'
import { Crown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TeamLogo } from '@/components/shared/Avatar'
import { cn } from '@/lib/utils'
import type { MatchWithTeams, Season, SeasonRound, Team } from '@/types'

/**
 * Public progress of a round-based season: each round's teams and results,
 * who went through and who was eliminated, ending with the champion.
 */
export function RoundsProgressView({
  season,
  rounds,
  roundTeams,
  teams,
  matches,
}: {
  season: Season
  rounds: SeasonRound[]
  /** roundId → team ids in that round */
  roundTeams: Record<string, string[]>
  teams: Team[]
  matches: MatchWithTeams[]
}) {
  const teamById = new Map(teams.map((t) => [t.id, t]))
  const champion = season.champion_team_id ? teamById.get(season.champion_team_id) : undefined
  const ordered = [...rounds].sort((a, b) => a.round_number - b.round_number)

  return (
    <div className="flex flex-col gap-6">
      {champion ? (
        <Card className="flex items-center gap-4 border-accent-300 bg-accent-50 p-5">
          <Crown className="h-8 w-8 shrink-0 text-accent-500" />
          <TeamLogo name={champion.name} logoUrl={champion.logo_url} className="h-12 w-12 text-sm" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent-700">Champion</p>
            <Link to={`/teams/${champion.id}`} className="font-display text-2xl font-bold text-primary-900 hover:text-primary-700">
              {champion.name}
            </Link>
          </div>
        </Card>
      ) : null}

      {ordered.map((round, i) => {
        const teamIds = roundTeams[round.id] ?? []
        const next = ordered[i + 1]
        const nextIds = next ? roundTeams[next.id] ?? [] : null
        const roundMatches = matches
          .filter((m) => m.round_id === round.id)
          .sort((a, b) => new Date(a.scheduled_at ?? 0).getTime() - new Date(b.scheduled_at ?? 0).getTime())
        return (
          <Card key={round.id}>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-xl">{round.name}</CardTitle>
              <Badge variant="outline">{teamIds.length} teams</Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                {teamIds.map((id) => {
                  const team = teamById.get(id)
                  if (!team) return null
                  const out = nextIds ? !nextIds.includes(id) : false
                  const through = nextIds ? nextIds.includes(id) : false
                  return (
                    <Link
                      key={id}
                      to={`/teams/${id}`}
                      className={cn(
                        'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold',
                        out && 'border-red-200 bg-red-50 text-red-700 line-through decoration-red-400',
                        through && 'border-green-200 bg-green-50 text-green-800',
                        !out && !through && 'border-border text-primary-900',
                      )}
                    >
                      <TeamLogo name={team.name} logoUrl={team.logo_url} className="h-5 w-5 text-[8px]" />
                      {team.short_name}
                    </Link>
                  )
                })}
              </div>

              {roundMatches.length === 0 ? (
                <p className="text-sm text-muted-foreground">No matches scheduled yet.</p>
              ) : (
                <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
                  {roundMatches.map((m) => {
                    const done = m.status === 'COMPLETED'
                    const aWon = done && (m.team_a_score ?? 0) > (m.team_b_score ?? 0)
                    const bWon = done && (m.team_b_score ?? 0) > (m.team_a_score ?? 0)
                    const row = (
                      <>
                        <span className={cn('truncate text-right', aWon ? 'font-bold text-primary-900' : 'text-muted-foreground')}>
                          {m.team_a.name}
                        </span>
                        <span className="font-display font-extrabold text-primary-800">
                          {done ? `${m.team_a_score} – ${m.team_b_score}` : m.status === 'CANCELLED' ? 'Cancelled' : 'vs'}
                        </span>
                        <span className={cn('truncate', bWon ? 'font-bold text-primary-900' : 'text-muted-foreground')}>
                          {m.team_b.name}
                        </span>
                      </>
                    )
                    const rowClass = 'grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-2.5 text-sm'
                    return done ? (
                      <Link key={m.id} to={`/matches/${m.id}`} className={cn(rowClass, 'hover:bg-secondary/40')}>
                        {row}
                      </Link>
                    ) : (
                      <div key={m.id} className={rowClass}>
                        {row}
                      </div>
                    )
                  })}
                </div>
              )}

              {nextIds && teamIds.some((id) => !nextIds.includes(id)) ? (
                <p className="text-xs font-semibold text-red-700">
                  Eliminated:{' '}
                  {teamIds
                    .filter((id) => !nextIds.includes(id))
                    .map((id) => teamById.get(id)?.name)
                    .filter(Boolean)
                    .join(', ')}
                </p>
              ) : null}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
