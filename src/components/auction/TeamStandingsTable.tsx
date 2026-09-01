import { Fragment, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TeamLogo } from '@/components/shared/Avatar'
import { formatLakh } from '@/utils/currency'
import { cn } from '@/lib/utils'
import type { AuctionTeamSummary } from '@/services/auction'
import type { TeamStrengthResult } from '@/utils/teamStrength'

/**
 * Compact team-standings table (Team | Purse | Squad | Slots Left |
 * Current Strength | Expected Strength) replacing the Phase 2 card-grid
 * layout for the Owner/Spectator screens. Admin keeps using
 * TeamOverviewGrid unchanged. Strength columns show "—" for any team
 * missing an entry in `strengthByTeamId` (e.g. before its first purchase).
 */
export function TeamStandingsTable({
  teamSummaries,
  maxSquadSize,
  highlightTeamId,
  title = 'Teams Overview',
  collapsedCount = 4,
  strengthByTeamId,
}: {
  teamSummaries: AuctionTeamSummary[]
  maxSquadSize: number | null
  highlightTeamId?: string
  title?: string
  collapsedCount?: number
  strengthByTeamId?: Record<string, TeamStrengthResult>
}) {
  const [expanded, setExpanded] = useState(false)
  const [openRosterId, setOpenRosterId] = useState<string | null>(null)

  const ordered = [...teamSummaries].sort((a, b) => {
    if (a.team.id === highlightTeamId) return -1
    if (b.team.id === highlightTeamId) return 1
    return 0
  })
  const visible = expanded ? ordered : ordered.slice(0, collapsedCount)
  const hasMore = ordered.length > collapsedCount

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="p-3">
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Team</TableHead>
              <TableHead className="text-right">Purse</TableHead>
              <TableHead className="text-right">Squad</TableHead>
              <TableHead className="text-right">Slots Left</TableHead>
              <TableHead className="text-right">Current Strength</TableHead>
              <TableHead className="text-right">Expected Strength</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((summary) => {
              const squadCount = summary.roster.length
              const remainingSlots = maxSquadSize != null ? Math.max(0, maxSquadSize - squadCount) : null
              const isHighlighted = summary.team.id === highlightTeamId
              const rosterOpen = openRosterId === summary.team.id
              const strength = strengthByTeamId?.[summary.team.id]
              return (
                <Fragment key={summary.team.id}>
                  <TableRow
                    className={cn('cursor-pointer', isHighlighted && 'bg-accent-50')}
                    onClick={() => setOpenRosterId(rosterOpen ? null : summary.team.id)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <TeamLogo name={summary.team.name} logoUrl={summary.team.logo_url} className="h-7 w-7 text-xs" />
                        <span className={cn('font-medium', isHighlighted && 'font-bold text-accent-700')}>
                          {summary.team.name}
                          {isHighlighted ? ' (You)' : ''}
                        </span>
                        <ChevronDown
                          className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', rosterOpen && 'rotate-180')}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{formatLakh(summary.purseRemaining)}</TableCell>
                    <TableCell className="text-right">
                      {squadCount}
                      {maxSquadSize != null ? `/${maxSquadSize}` : ''}
                    </TableCell>
                    <TableCell className="text-right">{remainingSlots ?? '—'}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {strength?.current != null ? strength.current.toFixed(0) : '—'}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {strength?.expected != null ? strength.expected.toFixed(0) : '—'}
                    </TableCell>
                  </TableRow>
                  {rosterOpen ? (
                    <TableRow>
                      <TableCell colSpan={6} className="bg-secondary/30 py-3">
                        {squadCount === 0 ? (
                          <p className="text-xs text-muted-foreground">No players acquired yet.</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {summary.roster.map((r) => (
                              <span
                                key={r.player.id}
                                className="rounded-full border border-border bg-white px-2.5 py-1 text-xs font-medium text-primary-800"
                              >
                                {r.player.name}
                                {r.price != null ? <span className="text-muted-foreground"> · {formatLakh(r.price)}</span> : null}
                              </span>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
        </div>
        {hasMore ? (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="flex w-full items-center justify-center gap-1 border-t border-border py-2.5 text-sm font-semibold text-primary-700 hover:bg-secondary/50"
          >
            {expanded ? 'Show less' : 'View all teams & rosters'}
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
          </button>
        ) : null}
      </CardContent>
    </Card>
  )
}
