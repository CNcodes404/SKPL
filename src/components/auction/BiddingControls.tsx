import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { describeAuctionError, placeBid } from '@/services/manualAuction'
import { formatLakh } from '@/utils/currency'
import type { SeasonAuction } from '@/types'

/**
 * Owner bidding controls. Every displayed number here is informational —
 * place_bid() independently re-derives and enforces minimum/maximum bid,
 * ownership, squad size, and expiry from authoritative database state, so
 * a stale/incorrect client value can never actually place an illegal bid.
 *
 * Custom-bid entry is intentionally not offered — owners can only submit
 * the current minimum legal bid.
 */
export function BiddingControls({
  seasonId,
  teamId,
  auction,
  hasCurrentPlayer,
  minimumNextBid,
  maximumSafeBid,
  isFull,
}: {
  seasonId: string
  teamId: string
  auction: SeasonAuction
  hasCurrentPlayer: boolean
  minimumNextBid: number | null
  maximumSafeBid: number | null
  isFull: boolean
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isHighestBidder = auction.current_high_team_id === teamId

  let ineligibleReason: string | null = null
  if (auction.status === 'PAUSED') ineligibleReason = 'Bidding is paused.'
  else if (auction.status === 'COMPLETED') ineligibleReason = 'The auction has ended.'
  else if (auction.status !== 'RUNNING') ineligibleReason = 'The auction is not currently live.'
  else if (!hasCurrentPlayer) ineligibleReason = 'No player is currently on the block.'
  else if (isHighestBidder) ineligibleReason = 'You currently hold the highest bid.'
  else if (isFull) ineligibleReason = 'You have reached the maximum squad size.'
  else if (minimumNextBid != null && maximumSafeBid != null && maximumSafeBid < minimumNextBid) {
    ineligibleReason = 'You cannot safely bid for this player while maintaining your minimum squad requirement.'
  }

  const canBid = ineligibleReason === null

  async function submitBid(amount: number) {
    setSubmitting(true)
    setError(null)
    try {
      await placeBid(seasonId, teamId, amount)
      // Realtime (subscribeToAuction) delivers the confirmed state to every
      // client, including this one — no optimistic local update here.
    } catch (err) {
      setError(describeAuctionError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="border-2 border-accent-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Your Bid</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border p-2 text-center">
            <p className="font-display text-lg font-bold text-primary-900">
              {minimumNextBid != null ? formatLakh(minimumNextBid) : '—'}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Minimum Next Bid</p>
          </div>
          <div className="rounded-lg border border-border p-2 text-center">
            <p className="font-display text-lg font-bold text-primary-900">
              {maximumSafeBid != null ? formatLakh(Math.max(0, maximumSafeBid)) : '—'}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Maximum Safe Bid</p>
          </div>
        </div>

        <Button
          size="lg"
          disabled={!canBid || submitting || minimumNextBid == null}
          onClick={() => minimumNextBid != null && submitBid(minimumNextBid)}
        >
          {submitting ? 'Submitting…' : minimumNextBid != null ? `BID ${formatLakh(minimumNextBid)}` : 'BID'}
        </Button>

        {error ? (
          <p className="text-sm font-medium text-destructive">{error}</p>
        ) : ineligibleReason ? (
          <p className="rounded-md border border-border bg-secondary/50 p-2 text-sm font-medium text-muted-foreground">
            {ineligibleReason}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 rounded-md bg-green-50 p-2 text-sm font-medium text-green-700">
            <CheckCircle2 className="h-4 w-4" /> You are eligible to bid
          </p>
        )}
      </CardContent>
    </Card>
  )
}
