import { Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { CountdownTimer } from '@/components/auction/CountdownTimer'
import { TeamLogo } from '@/components/shared/Avatar'
import { formatLakh } from '@/utils/currency'
import type { SeasonAuction, Team } from '@/types'

/**
 * Current bid + highest bidder + countdown — the read-only half of the
 * "on the block" hero, shared by Owner and Spectator (Owner additionally
 * renders BiddingControls below this; Spectator does not).
 */
export function CurrentBidStatus({
  auction,
  basePrice,
  highestBidderTeam,
  resolving,
  paused,
}: {
  auction: SeasonAuction
  basePrice: number
  highestBidderTeam: Team | null
  resolving: boolean
  paused: boolean
}) {
  return (
    <Card className="border-2 border-accent-200">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current Bid</p>
            <p className="font-display text-3xl font-extrabold text-primary-900">
              {formatLakh(auction.current_high_bid ?? basePrice)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Highest Bidder</p>
            {highestBidderTeam ? (
              <div className="mt-1 flex items-center justify-end gap-1.5">
                <TeamLogo name={highestBidderTeam.name} logoUrl={highestBidderTeam.logo_url} className="h-6 w-6 text-xs" />
                <span className="text-sm font-semibold text-primary-700">{highestBidderTeam.name}</span>
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">No bids yet</p>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center gap-1 rounded-lg border border-border bg-secondary/40 py-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> Time Remaining
          </div>
          <CountdownTimer expiresAt={auction.bid_expires_at} resolving={resolving} paused={paused} />
        </div>

        {!paused ? (
          <p className="rounded-md bg-accent-50 px-3 py-1.5 text-xs text-accent-800">Timer resets with every valid bid</p>
        ) : null}
      </CardContent>
    </Card>
  )
}
