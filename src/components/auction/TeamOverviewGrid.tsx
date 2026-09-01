import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TeamLogo } from '@/components/shared/Avatar'
import { TeamStrengthDisplay } from '@/components/auction/TeamStrengthDisplay'
import { formatLakh } from '@/utils/currency'
import { cn } from '@/lib/utils'
import type { AuctionTeamSummary } from '@/services/auction'
import type { TeamStrengthResult } from '@/utils/teamStrength'

export function TeamOverviewGrid({
  teamSummaries,
  maxSquadSize,
  highlightTeamId,
  strengthByTeamId,
}: {
  teamSummaries: AuctionTeamSummary[]
  maxSquadSize: number | null
  /** Optional — visually distinguishes one team's card (e.g. the signed-in
   * owner's own team). Unused by Admin, so its rendering is unaffected. */
  highlightTeamId?: string
  strengthByTeamId?: Record<string, TeamStrengthResult>
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {teamSummaries.map((summary) => (
        <TeamOverviewCard
          key={summary.team.id}
          summary={summary}
          maxSquadSize={maxSquadSize}
          highlighted={summary.team.id === highlightTeamId}
          strength={strengthByTeamId?.[summary.team.id]}
        />
      ))}
    </div>
  )
}

function TeamOverviewCard({
  summary,
  maxSquadSize,
  highlighted = false,
  strength,
}: {
  summary: AuctionTeamSummary
  maxSquadSize: number | null
  highlighted?: boolean
  strength?: TeamStrengthResult
}) {
  const [expanded, setExpanded] = useState(false)
  const squadCount = summary.roster.length
  const remainingSlots = maxSquadSize != null ? Math.max(0, maxSquadSize - squadCount) : null
  const isFull = maxSquadSize != null && squadCount >= maxSquadSize

  return (
    <Card className={cn(highlighted && 'border-2 border-accent-400 bg-accent-50/40')}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <div className="flex items-center gap-2">
          <TeamLogo name={summary.team.name} logoUrl={summary.team.logo_url} className="h-9 w-9 text-sm" />
          <div>
            <CardTitle className="text-base">{summary.team.name}</CardTitle>
            <div className="mt-1 flex gap-1.5">
              {highlighted ? <Badge variant="accent">Your Team</Badge> : null}
              {isFull ? <Badge variant="destructive">Squad Full</Badge> : null}
            </div>
          </div>
        </div>
        <TeamStrengthDisplay current={strength?.current} expected={strength?.expected} />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="font-display text-base font-bold text-primary-800">{formatLakh(summary.purseRemaining)}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Purse Left</p>
          </div>
          <div>
            <p className="font-display text-base font-bold text-primary-800">
              {squadCount}
              {maxSquadSize != null ? ` / ${maxSquadSize}` : ''}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Squad</p>
          </div>
          <div>
            <p className="font-display text-base font-bold text-primary-800">{remainingSlots ?? '—'}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Slots Left</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary"
        >
          Roster ({squadCount})
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {expanded ? (
          <div className="flex flex-wrap gap-1.5">
            {squadCount === 0 ? (
              <p className="text-xs text-muted-foreground">No players acquired yet.</p>
            ) : (
              summary.roster.map((r) => (
                <span
                  key={r.player.id}
                  className="rounded-full border border-border bg-secondary/50 px-2.5 py-1 text-xs font-medium text-primary-800"
                >
                  {r.player.name}
                  {r.price != null ? <span className="text-muted-foreground"> · {formatLakh(r.price)}</span> : null}
                </span>
              ))
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
