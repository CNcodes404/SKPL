import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TeamLogo } from '@/components/shared/Avatar'
import { formatLakh } from '@/utils/currency'
import { cn } from '@/lib/utils'
import type { AuctionBidTickerEntry } from '@/services/auction'

export function BidTicker({
  entries,
  title = 'Bid History',
  layout = 'table',
}: {
  entries: AuctionBidTickerEntry[]
  title?: string
  /** 'table' (default, unchanged) is the Admin/Spectator-sidebar list;
   * 'ticker' is a single-row horizontal strip, used as the Owner screen's
   * footer bar. */
  layout?: 'table' | 'ticker'
}) {
  if (layout === 'ticker') {
    return (
      <Card className="overflow-hidden">
        <CardContent className="flex items-center gap-4 p-3">
          <p className="shrink-0 text-xs font-bold uppercase tracking-wide text-primary-700">{title}</p>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bids yet.</p>
          ) : (
            <div className="flex flex-1 items-center gap-6 overflow-x-auto">
              {entries.map((entry, i) => (
                <div key={entry.id} className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm">
                  <TeamLogo name={entry.team.name} logoUrl={entry.team.logo_url} className="h-6 w-6 text-[10px]" />
                  <span className={cn('font-medium', i === 0 && 'font-bold text-accent-700')}>{entry.team.name}</span>
                  <span className={cn('font-semibold text-primary-800', i === 0 && 'text-accent-700')}>
                    {formatLakh(entry.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="max-h-80 overflow-y-auto p-0">
        {entries.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">No bids yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TableHead>Player</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry, i) => (
                <TableRow key={entry.id} className={cn(i === 0 && 'bg-accent-50')}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <TeamLogo name={entry.team.name} logoUrl={entry.team.logo_url} className="h-6 w-6 text-[10px]" />
                      <span className={cn('font-medium', i === 0 && 'font-bold text-accent-700')}>{entry.team.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{entry.player.name}</TableCell>
                  <TableCell className={cn('text-right font-semibold', i === 0 && 'text-accent-700')}>
                    {formatLakh(entry.amount)}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {new Date(entry.created_at).toLocaleTimeString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
