import { useEffect } from 'react'
import { Gavel } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { PlayerShowcaseCard } from '@/components/auction/PlayerShowcaseCard'
import { CurrentBidStatus } from '@/components/auction/CurrentBidStatus'
import { BiddingControls } from '@/components/auction/BiddingControls'
import { BidTicker } from '@/components/auction/BidTicker'
import { TeamStandingsTable } from '@/components/auction/TeamStandingsTable'
import { TeamStrengthDisplay } from '@/components/auction/TeamStrengthDisplay'
import { RemainingPlayerPool } from '@/components/auction/RemainingPlayerPool'
import { TeamLogo } from '@/components/shared/Avatar'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/context/AuthContext'
import { getAuctionConfig, getAuctionPool, getAuctionTeamSummaries, getBidTicker, subscribeToAuction } from '@/services/auction'
import { calculateMaximumSafeBid, calculateMinimumNextBid, getActiveManualAuctionSeasonForTeam } from '@/services/manualAuction'
import { getAuctionPlayerStats, type AuctionPlayerStats } from '@/utils/auctionPlayerStats'
import { computeTeamStrengths, type TeamStrengthResult } from '@/utils/teamStrength'
import { formatLakh } from '@/utils/currency'
import { AUCTION_MODE_LABELS } from '@/types'

export default function OwnerAuction() {
  const { ownerTeamId } = useAuth()

  const { data: seasonInfo, loading: seasonLoading, error: seasonError } = useAsync(async () => {
    if (!ownerTeamId) return null
    return getActiveManualAuctionSeasonForTeam(ownerTeamId)
  }, [ownerTeamId])

  const seasonId = seasonInfo?.seasonId ?? ''

  const { data, loading, error, reload } = useAsync(async () => {
    if (!seasonId || !ownerTeamId) return null
    const [auctionConfig, pool, teamSummaries, ticker] = await Promise.all([
      getAuctionConfig(seasonId),
      getAuctionPool(seasonId),
      getAuctionTeamSummaries(seasonId),
      getBidTicker(seasonId),
    ])
    return { auctionConfig, pool, teamSummaries, ticker }
  }, [seasonId, ownerTeamId])

  useEffect(() => {
    if (!seasonId) return
    const unsubscribe = subscribeToAuction(seasonId, reload)
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId])

  const poolKey = data?.pool.map((p) => p.id).join(',') ?? ''
  const { data: statsByPlayer } = useAsync<Record<string, AuctionPlayerStats>>(
    () => (data?.pool ? getAuctionPlayerStats(data.pool.map((p) => p.player)) : Promise.resolve({})),
    [poolKey],
  )

  const rosterKey = data?.teamSummaries.map((t) => `${t.team.id}:${t.roster.map((r) => r.player.id).join(',')}`).join('|') ?? ''
  const { data: strengthByTeamId } = useAsync<Record<string, TeamStrengthResult>>(
    () =>
      data?.pool && data?.teamSummaries && data?.auctionConfig
        ? computeTeamStrengths(data.teamSummaries, data.pool, data.auctionConfig.min_squad_size)
        : Promise.resolve({}),
    [poolKey, rosterKey, data?.auctionConfig?.min_squad_size],
  )

  if (seasonLoading) return <LoadingState rows={8} />
  if (seasonError) return <ErrorState message="Unable to load your team's auction." />
  if (!ownerTeamId) return <ErrorState message="This account is not linked to a team." />
  if (!seasonInfo) {
    return (
      <EmptyState
        icon={Gavel}
        title="No live manual auction"
        description="There is no manual auction currently associated with your team."
      />
    )
  }

  if (loading && !data) return <LoadingState rows={8} />
  if (error || !data || !data.auctionConfig) return <ErrorState message="Unable to load auction state." />

  const { auctionConfig, pool, teamSummaries, ticker } = data

  if (auctionConfig.status === 'DRAFT') {
    return (
      <EmptyState
        icon={Gavel}
        title="Auction hasn't started"
        description={`The ${seasonInfo.seasonName} auction hasn't begun yet. Check back once the admin starts it.`}
      />
    )
  }

  const currentEntry = pool.find((p) => p.player_id === auctionConfig.current_player_id)
  const highestBidderTeam = auctionConfig.current_high_team_id
    ? teamSummaries.find((t) => t.team.id === auctionConfig.current_high_team_id)?.team ?? null
    : null
  const ownTeamSummary = teamSummaries.find((t) => t.team.id === ownerTeamId)
  const squadCount = ownTeamSummary?.roster.length ?? 0
  const isFull = auctionConfig.max_squad_size != null && squadCount >= auctionConfig.max_squad_size
  const remainingSlots = auctionConfig.max_squad_size != null ? Math.max(0, auctionConfig.max_squad_size - squadCount) : null

  const hasIncrementConfig =
    auctionConfig.initial_bid_increment != null &&
    auctionConfig.increment_step_range != null &&
    auctionConfig.increment_increase != null

  const minimumNextBid =
    currentEntry && auctionConfig.current_high_bid != null && hasIncrementConfig
      ? calculateMinimumNextBid(
          auctionConfig.current_high_bid,
          currentEntry.base_price,
          auctionConfig.initial_bid_increment!,
          auctionConfig.increment_step_range!,
          auctionConfig.increment_increase!,
          auctionConfig.current_high_team_id != null,
        )
      : null

  const maximumSafeBid =
    currentEntry && ownTeamSummary && auctionConfig.max_squad_size != null
      ? calculateMaximumSafeBid(ownTeamSummary.purseRemaining, auctionConfig.max_squad_size, squadCount, currentEntry.base_price)
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
  const isCompleted = auctionConfig.status === 'COMPLETED'
  const processed = soldCount + unsoldCount

  return (
    <div className="flex flex-col gap-4">
      {/* Header: season + live/round/progress */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <h1 className="flex items-center gap-1.5 font-display text-base font-bold text-primary-900">
            <Gavel className="h-4 w-4" /> {seasonInfo.seasonName}
          </h1>
          <Badge variant="solid">{AUCTION_MODE_LABELS[auctionConfig.auction_mode]}</Badge>
          <Badge variant={auctionConfig.status === 'PAUSED' ? 'destructive' : 'default'}>
            {auctionConfig.status === 'PAUSED' ? 'Paused' : auctionConfig.status === 'RUNNING' ? 'Live' : auctionConfig.status}
          </Badge>
          <Badge variant={round === 1 ? 'accent' : 'solid'}>Round {round}</Badge>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {processed} / {pool.length} players processed{round === 2 ? ` · ${round2Count} returning` : ''}
            </span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary-600"
                style={{ width: `${pool.length ? Math.round((processed / pool.length) * 100) : 0}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current player (left) + bidding (right) — the primary decision-making area, side by side so it fits above the fold */}
      {currentEntry ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="flex flex-col gap-4 lg:col-span-3">
            <PlayerShowcaseCard
              player={currentEntry.player}
              poolEntry={currentEntry}
              stats={statsByPlayer?.[currentEntry.player.id]}
            />
            {ownTeamSummary ? (
              <Card className="border-2 border-accent-300 bg-accent-50/40">
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="flex items-center gap-3">
                    <TeamLogo name={ownTeamSummary.team.name} logoUrl={ownTeamSummary.team.logo_url} className="h-12 w-12 text-lg" />
                    <div>
                      <Badge variant="accent" className="mb-1">
                        Your Team
                      </Badge>
                      <p className="font-display text-lg font-bold text-primary-900">{ownTeamSummary.team.name}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-6 text-center">
                    <div>
                      <p className="font-display text-lg font-bold text-primary-800">{formatLakh(ownTeamSummary.purseRemaining)}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Purse</p>
                    </div>
                    <div>
                      <p className="font-display text-lg font-bold text-primary-800">
                        {squadCount}
                        {auctionConfig.max_squad_size != null ? ` / ${auctionConfig.max_squad_size}` : ''}
                      </p>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Squad</p>
                    </div>
                    <div>
                      <p className="font-display text-lg font-bold text-primary-800">{remainingSlots ?? '—'}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Slots Left</p>
                    </div>
                    <TeamStrengthDisplay
                      current={strengthByTeamId?.[ownTeamSummary.team.id]?.current}
                      expected={strengthByTeamId?.[ownTeamSummary.team.id]?.expected}
                    />
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
          <div className="flex flex-col gap-3 lg:col-span-2">
            <CurrentBidStatus
              auction={auctionConfig}
              basePrice={currentEntry.base_price}
              highestBidderTeam={highestBidderTeam}
              resolving={false}
              paused={auctionConfig.status === 'PAUSED'}
            />
            <BiddingControls
              seasonId={seasonId}
              teamId={ownerTeamId}
              auction={auctionConfig}
              hasCurrentPlayer={Boolean(currentEntry)}
              minimumNextBid={minimumNextBid}
              maximumSafeBid={maximumSafeBid}
              isFull={isFull}
            />
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {isCompleted ? 'Auction complete.' : 'No player is currently on the block. Waiting for the admin to draw the next player…'}
          </CardContent>
        </Card>
      )}

      {/* Teams overview + remaining players, side by side */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TeamStandingsTable
          teamSummaries={teamSummaries}
          maxSquadSize={auctionConfig.max_squad_size}
          highlightTeamId={ownerTeamId}
          strengthByTeamId={strengthByTeamId ?? undefined}
        />
        <RemainingPlayerPool pool={pool} statsByPlayer={statsByPlayer ?? {}} collapsedCount={5} />
      </div>

      {/* Footer live-bids ticker */}
      <BidTicker entries={ticker} title="Live Bids" layout="ticker" />
    </div>
  )
}
