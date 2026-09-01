import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CurrentPlayerPanel } from '@/components/auction/CurrentPlayerPanel'
import { BidTicker } from '@/components/auction/BidTicker'
import { TeamOverviewGrid } from '@/components/auction/TeamOverviewGrid'
import { RemainingPlayerPool } from '@/components/auction/RemainingPlayerPool'
import { RoundIndicator } from '@/components/auction/RoundIndicator'
import { PlayerAvatar } from '@/components/shared/Avatar'
import { useAsync } from '@/hooks/useAsync'
import {
  drawNextPlayer,
  pauseManualAuction,
  resumeManualAuction,
  resolveExpiredPlayer,
  calculateMinimumNextBid,
  describeAuctionError,
} from '@/services/manualAuction'
import { getAuctionPlayerStats } from '@/utils/auctionPlayerStats'
import { computeTeamStrengths } from '@/utils/teamStrength'
import { formatLakh } from '@/utils/currency'
import { AUCTION_MODE_LABELS, PLAYER_DRAW_MODE_LABELS } from '@/types'
import type { AuctionBidTickerEntry, AuctionTeamSummary } from '@/services/auction'
import type { Player, SeasonAuction, SeasonAuctionPlayer, Team } from '@/types'

export function ManualAuctionLivePanel({
  seasonId,
  auctionConfig,
  pool,
  teamSummaries,
  ticker,
  onChanged,
}: {
  seasonId: string
  auctionConfig: SeasonAuction
  pool: (SeasonAuctionPlayer & { player: Player })[]
  teamSummaries: AuctionTeamSummary[]
  ticker: AuctionBidTickerEntry[]
  onChanged: () => void
}) {
  const [drawing, setDrawing] = useState(false)
  const [pausing, setPausing] = useState(false)
  const [resuming, setResuming] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [drawDialogOpen, setDrawDialogOpen] = useState(false)
  const [resolving, setResolving] = useState(false)

  const poolKey = pool.map((p) => p.id).join(',')
  const { data: statsByPlayer } = useAsync(() => getAuctionPlayerStats(pool.map((p) => p.player)), [poolKey])

  const rosterKey = teamSummaries.map((t) => `${t.team.id}:${t.roster.map((r) => r.player.id).join(',')}`).join('|')
  const { data: strengthByTeamId } = useAsync(
    () => computeTeamStrengths(teamSummaries, pool, auctionConfig.min_squad_size),
    [poolKey, rosterKey, auctionConfig.min_squad_size],
  )

  // Tracks the previously on-block player so a brief SOLD/UNSOLD banner can
  // be shown once resolve_expired_player clears current_player_id.
  const prevPlayerRef = useRef<string | null>(null)
  const [lastResult, setLastResult] = useState<{
    player: Player
    sold: boolean
    price: number | null
    team: Team | null
  } | null>(null)

  useEffect(() => {
    if (auctionConfig.current_player_id) {
      prevPlayerRef.current = auctionConfig.current_player_id
      setLastResult(null)
      return
    }
    const prevId = prevPlayerRef.current
    if (!prevId) return
    const entry = pool.find((p) => p.player_id === prevId)
    if (entry && (entry.status === 'SOLD' || entry.status === 'UNSOLD')) {
      const team = entry.sold_team_id ? teamSummaries.find((t) => t.team.id === entry.sold_team_id)?.team ?? null : null
      setLastResult({ player: entry.player, sold: entry.status === 'SOLD', price: entry.sold_price, team })
    }
    prevPlayerRef.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctionConfig.current_player_id])

  // The admin's browser is the one that notices expiry and asks Postgres
  // to resolve it — Postgres independently re-checks clock_timestamp()
  // against bid_expires_at (+1s grace) itself, so an early or duplicate
  // call is always a safe no-op. This is the only polling on the screen;
  // every other update rides the existing Realtime subscription.
  useEffect(() => {
    if (auctionConfig.status !== 'RUNNING' || !auctionConfig.current_player_id || !auctionConfig.bid_expires_at) return
    const expiresAtMs = new Date(auctionConfig.bid_expires_at).getTime()
    const interval = setInterval(async () => {
      if (Date.now() < expiresAtMs) return
      setResolving(true)
      try {
        await resolveExpiredPlayer(seasonId)
        onChanged()
      } catch (err) {
        console.error(err)
      } finally {
        setResolving(false)
      }
    }, 1000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId, auctionConfig.status, auctionConfig.current_player_id, auctionConfig.bid_expires_at])

  const currentEntry = pool.find((p) => p.player_id === auctionConfig.current_player_id)
  const highestBidderTeam = auctionConfig.current_high_team_id
    ? teamSummaries.find((t) => t.team.id === auctionConfig.current_high_team_id)?.team ?? null
    : null

  const minimumNextBid =
    currentEntry &&
    auctionConfig.current_high_bid != null &&
    auctionConfig.initial_bid_increment != null &&
    auctionConfig.increment_step_range != null &&
    auctionConfig.increment_increase != null
      ? calculateMinimumNextBid(
          auctionConfig.current_high_bid,
          currentEntry.base_price,
          auctionConfig.initial_bid_increment,
          auctionConfig.increment_step_range,
          auctionConfig.increment_increase,
          auctionConfig.current_high_team_id != null,
        )
      : null

  const pendingCount = pool.filter((p) => p.status === 'PENDING').length
  const soldCount = pool.filter((p) => p.status === 'SOLD').length
  const unsoldCount = pool.filter((p) => p.status === 'UNSOLD').length
  const round: 1 | 2 = pool.some((p) => p.status === 'PENDING' && p.attempt_no === 1)
    ? 1
    : pool.some((p) => p.attempt_no === 2)
      ? 2
      : 1
  const round2Count = pool.filter((p) => p.attempt_no === 2).length
  const eligibleForManualDraw = pool
    .filter((p) => p.status === 'PENDING')
    .sort((a, b) => (a.order_no ?? 0) - (b.order_no ?? 0))

  async function handleDraw(playerId?: string) {
    setDrawing(true)
    setActionError(null)
    try {
      await drawNextPlayer(seasonId, playerId)
      onChanged()
      setDrawDialogOpen(false)
    } catch (err) {
      setActionError(describeAuctionError(err))
    } finally {
      setDrawing(false)
    }
  }

  async function handlePause() {
    setPausing(true)
    setActionError(null)
    try {
      await pauseManualAuction(seasonId)
      onChanged()
    } catch (err) {
      setActionError(describeAuctionError(err))
    } finally {
      setPausing(false)
    }
  }

  async function handleResume() {
    setResuming(true)
    setActionError(null)
    try {
      await resumeManualAuction(seasonId)
      onChanged()
    } catch (err) {
      setActionError(describeAuctionError(err))
    } finally {
      setResuming(false)
    }
  }

  const canDraw = auctionConfig.status === 'RUNNING' && !auctionConfig.current_player_id
  const isCompleted = auctionConfig.status === 'COMPLETED'
  const isPaused = auctionConfig.status === 'PAUSED'

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Auction header */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <Badge variant="solid">{AUCTION_MODE_LABELS[auctionConfig.auction_mode]}</Badge>
          <Badge variant="outline">{PLAYER_DRAW_MODE_LABELS[auctionConfig.player_draw_mode]}</Badge>
          <Badge variant={isPaused ? 'destructive' : 'default'}>
            {isPaused ? 'Paused' : auctionConfig.status === 'RUNNING' ? 'Live' : auctionConfig.status}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {soldCount + unsoldCount} of {pool.length} players processed
          </span>
        </CardContent>
      </Card>

      {actionError ? (
        <Card className="border-destructive/40 bg-red-50">
          <CardContent className="p-3 text-sm text-destructive">{actionError}</CardContent>
        </Card>
      ) : null}

      {/* 5. Admin controls */}
      {!isCompleted ? (
        <div className="flex flex-wrap items-center gap-2">
          {auctionConfig.status === 'RUNNING' ? (
            <Button variant="outline" onClick={handlePause} disabled={pausing}>
              {pausing ? 'Pausing…' : 'Pause'}
            </Button>
          ) : isPaused ? (
            <Button onClick={handleResume} disabled={resuming}>
              {resuming ? 'Resuming…' : 'Resume'}
            </Button>
          ) : null}
          {canDraw ? (
            auctionConfig.player_draw_mode === 'AUTO' ? (
              <Button onClick={() => handleDraw()} disabled={drawing}>
                {drawing ? 'Drawing…' : 'Draw Next Player'}
              </Button>
            ) : (
              <Button onClick={() => setDrawDialogOpen(true)} disabled={drawing || eligibleForManualDraw.length === 0}>
                Choose Next Player
              </Button>
            )
          ) : null}
        </div>
      ) : null}

      {lastResult ? (
        <Card className={lastResult.sold ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}>
          <CardContent className="flex items-center gap-3 p-4">
            <PlayerAvatar name={lastResult.player.name} imageUrl={lastResult.player.image_url} className="h-10 w-10 text-sm" />
            <p className="text-sm font-semibold">
              {lastResult.sold
                ? `${lastResult.player.name} SOLD to ${lastResult.team?.name ?? 'a team'} for ${formatLakh(lastResult.price)}`
                : `${lastResult.player.name} went UNSOLD`}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* 9. Round information */}
      <RoundIndicator
        round={round}
        pendingCount={pendingCount}
        soldCount={soldCount}
        unsoldCount={unsoldCount}
        round2Count={round2Count}
      />

      {/* 2 & 3 & 4 (bid info) & 12. Current player / countdown / bid info */}
      {currentEntry ? (
        <CurrentPlayerPanel
          player={currentEntry.player}
          poolEntry={currentEntry}
          auction={auctionConfig}
          highestBidderTeam={highestBidderTeam}
          stats={statsByPlayer?.[currentEntry.player.id]}
          minimumNextBid={minimumNextBid}
          resolving={resolving}
          paused={isPaused}
        />
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {isCompleted ? 'Auction complete.' : 'No player currently on the block — draw the next player to begin bidding.'}
          </CardContent>
        </Card>
      )}

      {/* 6 & 7 & 10. Team overview, rosters, team strength placeholder */}
      <TeamOverviewGrid
        teamSummaries={teamSummaries}
        maxSquadSize={auctionConfig.max_squad_size}
        strengthByTeamId={strengthByTeamId ?? undefined}
      />

      {/* 4. Bid history */}
      <BidTicker entries={ticker} />

      {/* 8. Remaining player pool */}
      <RemainingPlayerPool pool={pool} statsByPlayer={statsByPlayer ?? {}} />

      <Dialog open={drawDialogOpen} onOpenChange={setDrawDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose Next Player</DialogTitle>
          </DialogHeader>
          <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
            {eligibleForManualDraw.length === 0 ? (
              <p className="text-sm text-muted-foreground">No eligible player remains.</p>
            ) : (
              eligibleForManualDraw.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => handleDraw(entry.player_id)}
                  disabled={drawing}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-secondary disabled:opacity-50"
                >
                  <span className="flex items-center gap-2">
                    <PlayerAvatar name={entry.player.name} imageUrl={entry.player.image_url} className="h-8 w-8 text-xs" />
                    <span className="font-medium">{entry.player.name}</span>
                    {entry.attempt_no === 2 ? <Badge variant="accent">Round 2</Badge> : null}
                  </span>
                  <span className="text-muted-foreground">{formatLakh(entry.base_price)}</span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
