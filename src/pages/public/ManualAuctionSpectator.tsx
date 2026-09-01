import { useEffect, useRef, useState } from 'react'
import { Trophy } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { PlayerShowcaseCard } from '@/components/auction/PlayerShowcaseCard'
import { CurrentBidStatus } from '@/components/auction/CurrentBidStatus'
import { BidTicker } from '@/components/auction/BidTicker'
import { TeamStandingsTable } from '@/components/auction/TeamStandingsTable'
import { RemainingPlayerPool } from '@/components/auction/RemainingPlayerPool'
import { RoundIndicator } from '@/components/auction/RoundIndicator'
import { PlayerAvatar, TeamLogo } from '@/components/shared/Avatar'
import { useAsync } from '@/hooks/useAsync'
import { getAuctionPlayerStats, type AuctionPlayerStats } from '@/utils/auctionPlayerStats'
import { computeTeamStrengths } from '@/utils/teamStrength'
import { formatLakh } from '@/utils/currency'
import { AUCTION_MODE_LABELS, PLAYER_DRAW_MODE_LABELS } from '@/types'
import type { AuctionBidTickerEntry, AuctionTeamSummary } from '@/services/auction'
import type { Player, Season, SeasonAuction, SeasonAuctionPlayer, Team } from '@/types'

/**
 * Read-only broadcast view of a Manual/Live auction. Never calls place_bid,
 * draw_next_player, pause/resume, or resolve_expired_player — it only
 * renders whatever subscribeToAuction()'s Realtime feed (via the parent
 * AuctionViewer's reload) delivers. No owner-only figure (maximum safe
 * bid) is computed or displayed anywhere on this page.
 */
export default function ManualAuctionSpectator({
  season,
  auctionConfig,
  pool,
  teamSummaries,
  ticker,
  seasonSwitcher,
}: {
  season: Season
  auctionConfig: SeasonAuction
  pool: (SeasonAuctionPlayer & { player: Player })[]
  teamSummaries: AuctionTeamSummary[]
  ticker: AuctionBidTickerEntry[]
  seasonSwitcher: React.ReactNode
}) {
  const poolKey = pool.map((p) => p.id).join(',')
  const { data: statsByPlayer } = useAsync<Record<string, AuctionPlayerStats>>(
    () => getAuctionPlayerStats(pool.map((p) => p.player)),
    [poolKey],
  )

  const rosterKey = teamSummaries.map((t) => `${t.team.id}:${t.roster.map((r) => r.player.id).join(',')}`).join('|')
  const { data: strengthByTeamId } = useAsync(
    () => computeTeamStrengths(teamSummaries, pool, auctionConfig.min_squad_size),
    [poolKey, rosterKey, auctionConfig.min_squad_size],
  )

  // Same transient-result pattern as the Admin/Owner screens: remember the
  // player that was just on the block so a brief SOLD/UNSOLD announcement
  // can show once Realtime clears current_player_id.
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

  const currentEntry = pool.find((p) => p.player_id === auctionConfig.current_player_id)
  const highestBidderTeam = auctionConfig.current_high_team_id
    ? teamSummaries.find((t) => t.team.id === auctionConfig.current_high_team_id)?.team ?? null
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
  const isLive = auctionConfig.status === 'RUNNING'
  const isPaused = auctionConfig.status === 'PAUSED'
  const isCompleted = auctionConfig.status === 'COMPLETED'
  const processed = soldCount + unsoldCount

  return (
    <div className="flex flex-col gap-4">
      {/* Broadcast header */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-base font-bold text-primary-900">{season.name}</p>
            {isLive ? (
              <span className="flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> Live Auction
              </span>
            ) : isPaused ? (
              <span className="rounded-full bg-yellow-400 px-3 py-1 text-xs font-bold uppercase tracking-wide text-yellow-950">
                ⏸ Paused
              </span>
            ) : isCompleted ? (
              <span className="flex items-center gap-1.5 rounded-full bg-green-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                <Trophy className="h-3.5 w-3.5" /> Complete
              </span>
            ) : (
              <Badge variant="outline">{auctionConfig.status}</Badge>
            )}
            <Badge variant={round === 1 ? 'accent' : 'solid'}>Round {round}</Badge>
            <Badge variant="outline">{AUCTION_MODE_LABELS[auctionConfig.auction_mode]}</Badge>
            <Badge variant="outline">{PLAYER_DRAW_MODE_LABELS[auctionConfig.player_draw_mode]}</Badge>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {processed} / {pool.length} players
              </span>
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary-600"
                  style={{ width: `${pool.length ? Math.round((processed / pool.length) * 100) : 0}%` }}
                />
              </div>
            </div>
          </div>
          {seasonSwitcher}
        </CardContent>
      </Card>

      <RoundIndicator
        round={round}
        pendingCount={pendingCount}
        soldCount={soldCount}
        unsoldCount={unsoldCount}
        round2Count={round2Count}
      />

      {/* SOLD / UNSOLD transition */}
      {lastResult ? (
        <Card className={lastResult.sold ? 'border-2 border-green-400 bg-green-50' : 'border-2 border-red-300 bg-red-50'}>
          <CardContent className="flex flex-col items-center gap-2 p-6 text-center">
            <p
              className={
                lastResult.sold
                  ? 'font-display text-2xl font-extrabold text-green-700'
                  : 'font-display text-2xl font-extrabold text-red-600'
              }
            >
              {lastResult.sold ? 'SOLD!' : 'UNSOLD'}
            </p>
            <div className="flex items-center gap-2">
              <PlayerAvatar name={lastResult.player.name} imageUrl={lastResult.player.image_url} className="h-10 w-10 text-sm" />
              <p className="font-display text-lg font-bold text-primary-900">{lastResult.player.name}</p>
            </div>
            {lastResult.sold ? (
              <>
                <p className="font-display text-xl font-bold text-primary-900">{formatLakh(lastResult.price)}</p>
                {lastResult.team ? (
                  <div className="flex items-center gap-2">
                    <TeamLogo name={lastResult.team.name} logoUrl={lastResult.team.logo_url} className="h-6 w-6 text-xs" />
                    <span className="text-sm font-semibold text-primary-700">{lastResult.team.name}</span>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No bids received.</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Main (2/3) + sidebar (1/3) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {currentEntry ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
              <div className="sm:col-span-3">
                <PlayerShowcaseCard
                  player={currentEntry.player}
                  poolEntry={currentEntry}
                  stats={statsByPlayer?.[currentEntry.player.id]}
                />
              </div>
              <div className="sm:col-span-2">
                <CurrentBidStatus
                  auction={auctionConfig}
                  basePrice={currentEntry.base_price}
                  highestBidderTeam={highestBidderTeam}
                  resolving={false}
                  paused={isPaused}
                />
              </div>
            </div>
          ) : (
            <Card>
              <CardContent className="p-10 text-center">
                {isCompleted ? (
                  <div className="flex flex-col items-center gap-2">
                    <Trophy className="h-8 w-8 text-accent-500" />
                    <p className="font-display text-xl font-bold text-primary-900">Auction Complete</p>
                    <p className="text-sm text-muted-foreground">Final team standings are shown alongside.</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Waiting for the next player…</p>
                )}
              </CardContent>
            </Card>
          )}

          <RemainingPlayerPool pool={pool} statsByPlayer={statsByPlayer ?? {}} collapsedCount={6} />
        </div>

        <div className="flex flex-col gap-4">
          <BidTicker entries={ticker} title="Live Bids" />
          <TeamStandingsTable
            teamSummaries={teamSummaries}
            maxSquadSize={auctionConfig.max_squad_size}
            title="Team Standings"
            strengthByTeamId={strengthByTeamId ?? undefined}
          />
        </div>
      </div>
    </div>
  )
}
