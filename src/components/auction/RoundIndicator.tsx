import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function RoundIndicator({
  round,
  pendingCount,
  soldCount,
  unsoldCount,
  round2Count,
}: {
  round: 1 | 2
  pendingCount: number
  soldCount: number
  unsoldCount: number
  round2Count: number
}) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-3">
          <Badge variant={round === 1 ? 'accent' : 'solid'} className="text-sm">
            Round {round}
          </Badge>
          {round === 2 ? (
            <p className="text-sm text-muted-foreground">
              {round2Count} player{round2Count === 1 ? '' : 's'} returning — unsold in Round 1, now getting a second
              opportunity.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Every player gets a first opportunity before any repeats.</p>
          )}
        </div>
        <div className="flex gap-5 text-center">
          <div>
            <p className="font-display text-lg font-bold text-primary-800">{pendingCount}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Remaining</p>
          </div>
          <div>
            <p className="font-display text-lg font-bold text-green-700">{soldCount}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sold</p>
          </div>
          <div>
            <p className="font-display text-lg font-bold text-red-600">{unsoldCount}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Unsold</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
