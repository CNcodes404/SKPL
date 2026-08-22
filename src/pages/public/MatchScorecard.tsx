import { useParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TeamLogo, PlayerAvatar } from '@/components/shared/Avatar'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { useAsync } from '@/hooks/useAsync'
import { getMatch, getMatchStatsWithPlayers, type MatchPlayerStatWithPlayer } from '@/services/matches'
import { formatDateTime, cn } from '@/lib/utils'
import { formatKD } from '@/utils/calculations'
import { MATCH_TYPE_LABELS } from '@/types'

export default function MatchScorecard() {
  const { matchId = '' } = useParams()

  const { data, loading, error } = useAsync(async () => {
    const match = await getMatch(matchId)
    if (!match) return null
    const stats = await getMatchStatsWithPlayers(matchId)
    return {
      match,
      teamAStats: stats.filter((s) => s.team_id === match.team_a_id),
      teamBStats: stats.filter((s) => s.team_id === match.team_b_id),
    }
  }, [matchId])

  if (loading) return <LoadingState rows={6} />
  if (error || !data) return <ErrorState message="Match not found." />

  const { match, teamAStats, teamBStats } = data
  const isCompleted = match.status === 'COMPLETED'

  const teamATotals = sumStats(teamAStats)
  const teamBTotals = sumStats(teamBStats)

  return (
    <div className="flex flex-col gap-8">
      <Card className="overflow-hidden">
        <div className="bg-skpl-gradient p-6 sm:p-8">
          <div className="mb-4 flex items-center justify-center gap-2 text-xs font-semibold text-primary-100">
            <span>{formatDateTime(match.scheduled_at)}</span>
            <span>·</span>
            <span>{MATCH_TYPE_LABELS[match.match_type]}</span>
            {match.stage_label ? (
              <>
                <span>·</span>
                <span>{match.stage_label}</span>
              </>
            ) : null}
          </div>
          <div className="flex items-center justify-center gap-2 sm:gap-6">
            <TeamHero team={match.team_a} />
            {isCompleted ? <ScoreValue value={match.team_a_score} /> : null}
            <div className="flex shrink-0 flex-col items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/40 font-display text-sm font-extrabold text-white sm:h-12 sm:w-12">
                {isCompleted ? 'FT' : 'VS'}
              </span>
              <StatusBadge status={match.status} />
            </div>
            {isCompleted ? <ScoreValue value={match.team_b_score} accent /> : null}
            <TeamHero team={match.team_b} />
          </div>
          {isCompleted && match.team_a_score != null && match.team_b_score != null && match.team_a_score !== match.team_b_score ? (
            <p className="mt-4 text-center text-sm font-semibold text-primary-100">
              {match.team_a_score > match.team_b_score ? match.team_a.name : match.team_b.name} beat{' '}
              {match.team_a_score > match.team_b_score ? match.team_b.name : match.team_a.name} (
              {Math.max(match.team_a_score, match.team_b_score)}-{Math.min(match.team_a_score, match.team_b_score)})
            </p>
          ) : null}
          {match.mvp_player ? (
            <p className="mt-2 text-center text-xs font-bold uppercase tracking-wide text-accent-300">
              Match MVP: {match.mvp_player.name}
            </p>
          ) : null}
        </div>
      </Card>

      {isCompleted ? (
        <Card>
          <CardHeader>
            <CardTitle>Team Comparison</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <TeamStatBar
              label="Flags"
              leftLabel={match.team_a.short_name}
              rightLabel={match.team_b.short_name}
              leftValue={teamATotals.flags}
              rightValue={teamBTotals.flags}
            />
            <TeamStatBar
              label="Kills"
              leftLabel={match.team_a.short_name}
              rightLabel={match.team_b.short_name}
              leftValue={teamATotals.kills}
              rightValue={teamBTotals.kills}
            />
            <TeamStatBar
              label="Deaths"
              leftLabel={match.team_a.short_name}
              rightLabel={match.team_b.short_name}
              leftValue={teamATotals.deaths}
              rightValue={teamBTotals.deaths}
            />
            <TeamStatBar
              label="KD"
              leftLabel={match.team_a.short_name}
              rightLabel={match.team_b.short_name}
              leftValue={Number(formatKD(teamATotals.kills, teamATotals.deaths))}
              rightValue={Number(formatKD(teamBTotals.kills, teamBTotals.deaths))}
              formatValue={(v) => v.toFixed(2)}
            />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PlayerStatsCard teamLabel={match.team_a.name} rows={teamAStats} />
        <PlayerStatsCard teamLabel={match.team_b.name} rows={teamBStats} />
      </div>
    </div>
  )
}

function TeamHero({ team }: { team: { name: string; short_name: string; logo_url: string | null } }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2 sm:flex-none sm:w-32">
      <TeamLogo name={team.name} logoUrl={team.logo_url} className="h-16 w-16 shrink-0 text-xl sm:h-24 sm:w-24 sm:text-2xl" />
      <p className="line-clamp-2 text-center font-display text-sm font-bold text-white sm:text-base">{team.name}</p>
    </div>
  )
}

function ScoreValue({ value, accent = false }: { value: number | null; accent?: boolean }) {
  return (
    <span className={cn('font-display text-4xl font-extrabold sm:text-6xl', accent ? 'text-accent-400' : 'text-white')}>
      {value}
    </span>
  )
}

function TeamStatBar({
  label,
  leftLabel,
  rightLabel,
  leftValue,
  rightValue,
  formatValue = (v: number) => String(v),
}: {
  label: string
  leftLabel: string
  rightLabel: string
  leftValue: number
  rightValue: number
  formatValue?: (v: number) => string
}) {
  const total = leftValue + rightValue
  const leftPct = total > 0 ? (leftValue / total) * 100 : 50

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wide text-muted-foreground">
        <span>{leftLabel}</span>
        <span>{label}</span>
        <span>{rightLabel}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="w-10 shrink-0 text-right font-display text-sm font-extrabold text-primary-800">
          {formatValue(leftValue)}
        </span>
        <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
          <div className="h-full bg-primary-700" style={{ width: `${leftPct}%` }} />
          <div className="h-full bg-accent-500" style={{ width: `${100 - leftPct}%` }} />
        </div>
        <span className="w-10 shrink-0 text-left font-display text-sm font-extrabold text-primary-800">
          {formatValue(rightValue)}
        </span>
      </div>
    </div>
  )
}

function sumStats(rows: MatchPlayerStatWithPlayer[]) {
  return rows.reduce(
    (acc, r) => ({ kills: acc.kills + r.kills, deaths: acc.deaths + r.deaths, flags: acc.flags + r.flags }),
    { kills: 0, deaths: 0, flags: 0 },
  )
}

function PlayerStatsCard({ teamLabel, rows }: { teamLabel: string; rows: MatchPlayerStatWithPlayer[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{teamLabel}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">No statistics recorded yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead className="text-center">K</TableHead>
                <TableHead className="text-center">D</TableHead>
                <TableHead className="text-center">F</TableHead>
                <TableHead className="text-center">KD</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <PlayerAvatar name={row.player.name} imageUrl={row.player.image_url} className="h-7 w-7 text-[10px]" />
                      <span className="font-medium text-primary-900">{row.player.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">{row.kills}</TableCell>
                  <TableCell className="text-center">{row.deaths}</TableCell>
                  <TableCell className="text-center">{row.flags}</TableCell>
                  <TableCell className="text-center font-semibold">{formatKD(row.kills, row.deaths)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
