import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TeamLogo } from '@/components/shared/Avatar'
import { formatDateTime } from '@/lib/utils'
import { MATCH_TYPE_LABELS, type MatchWithTeams } from '@/types'

export function MatchCard({ match, linkTo }: { match: MatchWithTeams; linkTo?: string }) {
  const isCompleted = match.status === 'COMPLETED'
  const isCancelled = match.status === 'CANCELLED'
  const content = (
    <Card className="flex flex-col gap-3 p-4 transition-shadow hover:shadow-elevated">
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
        <TeamRow team={match.team_a} score={match.team_a_score} isCompleted={isCompleted} align="right" />
        <div className="flex flex-col items-center justify-center">
          <span className="font-display text-sm font-extrabold text-primary-400">{isCompleted ? 'FT' : 'VS'}</span>
        </div>
        <TeamRow team={match.team_b} score={match.team_b_score} isCompleted={isCompleted} align="left" />
      </div>

      {match.mvp_player ? (
        <p className="text-center text-xs font-semibold text-accent-600">MVP: {match.mvp_player.name}</p>
      ) : null}
    </Card>
  )

  return linkTo ? <Link to={linkTo}>{content}</Link> : content
}

function TeamRow({
  team,
  score,
  isCompleted,
  align,
}: {
  team: MatchWithTeams['team_a']
  score: number | null
  isCompleted: boolean
  align: 'left' | 'right'
}) {
  return (
    <div className={`flex items-center gap-2 ${align === 'right' ? 'flex-row-reverse text-right' : 'text-left'}`}>
      <TeamLogo name={team.name} logoUrl={team.logo_url} className="h-9 w-9 shrink-0 text-xs" />
      <div className="min-w-0">
        <p className="truncate font-display text-sm font-bold text-primary-900">{team.short_name}</p>
      </div>
      {isCompleted ? <span className="font-display text-xl font-extrabold text-primary-800">{score}</span> : null}
    </div>
  )
}
