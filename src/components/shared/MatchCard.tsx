import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TeamLogo } from '@/components/shared/Avatar'
import { matchPath, useLiveMatches } from '@/context/LiveMatchesContext'
import { cn, formatDateTime } from '@/lib/utils'
import { MATCH_TYPE_LABELS, type MatchWithTeams } from '@/types'

export function MatchCard({ match, linkTo }: { match: MatchWithTeams; linkTo?: string }) {
  const live = useLiveMatches().getLive(match.id)
  const isCompleted = match.status === 'COMPLETED'
  const isCancelled = match.status === 'CANCELLED'
  const showScore = isCompleted || Boolean(live)
  // While a match is being tracked, always link to its live scorecard.
  const href = live ? matchPath(match) : linkTo
  const content = (
    <Card
      className={cn(
        'flex flex-col gap-3 p-4 transition-shadow hover:shadow-elevated',
        live && 'ring-2 ring-red-500/70',
      )}
    >
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{formatDateTime(match.scheduled_at)}</span>
        <div className="flex items-center gap-2">
          {match.stage_label ? <Badge variant="outline">{match.stage_label}</Badge> : null}
          <Badge variant={match.match_type === 'REGULAR_SEASON' ? 'default' : 'accent'}>
            {MATCH_TYPE_LABELS[match.match_type]}
          </Badge>
          {isCancelled ? <Badge variant="destructive">Cancelled</Badge> : null}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <TeamRow team={match.team_a} score={live ? live.teamAScore : match.team_a_score} showScore={showScore} align="right" />
        <div className="flex flex-col items-center justify-center">
          {live ? (
            <span className="flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE
            </span>
          ) : (
            <span className="font-display text-sm font-extrabold text-primary-400">{isCompleted ? 'FT' : 'VS'}</span>
          )}
        </div>
        <TeamRow team={match.team_b} score={live ? live.teamBScore : match.team_b_score} showScore={showScore} align="left" />
      </div>

      {match.mvp_player ? (
        <p className="text-center text-xs font-semibold text-accent-600">MVP: {match.mvp_player.name}</p>
      ) : null}
    </Card>
  )

  return href ? <Link to={href}>{content}</Link> : content
}

function TeamRow({
  team,
  score,
  showScore,
  align,
}: {
  team: MatchWithTeams['team_a']
  score: number | null
  showScore: boolean
  align: 'left' | 'right'
}) {
  return (
    <div className={`flex items-center gap-2 ${align === 'right' ? 'flex-row-reverse text-right' : 'text-left'}`}>
      <TeamLogo name={team.name} logoUrl={team.logo_url} className="h-9 w-9 shrink-0 text-xs" />
      <div className="min-w-0">
        <p className="truncate font-display text-sm font-bold text-primary-900">{team.short_name}</p>
      </div>
      {showScore ? <span className="font-display text-xl font-extrabold text-primary-800">{score}</span> : null}
    </div>
  )
}
