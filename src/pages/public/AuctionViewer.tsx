import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Gavel } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SeasonSelector } from '@/components/shared/SeasonSelector'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { useAsync } from '@/hooks/useAsync'
import { getSeason } from '@/services/seasons'
import {
  getAuctionConfig,
  getAuctionPool,
  getAuctionTeamSummaries,
  getBidTicker,
  listAuctionSeasons,
  subscribeToAuction,
} from '@/services/auction'
import { formatLakh } from '@/utils/currency'
import ManualAuctionSpectator from '@/pages/public/ManualAuctionSpectator'

export default function AuctionViewer() {
  const { seasonId: paramSeasonId } = useParams()
  const navigate = useNavigate()

  const { data: auctionSeasons, loading: seasonsLoading } = useAsync(() => listAuctionSeasons(), [])

  const seasonId = paramSeasonId || auctionSeasons?.[0]?.id || ''

  useEffect(() => {
    if (!paramSeasonId && auctionSeasons && auctionSeasons.length > 0) {
      navigate(`/auction/${auctionSeasons[0].id}`, { replace: true })
    }
  }, [paramSeasonId, auctionSeasons, navigate])

  const { data, loading, error, reload } = useAsync(async () => {
    if (!seasonId) return null
    const [season, auctionConfig, pool, teamSummaries, ticker] = await Promise.all([
      getSeason(seasonId),
      getAuctionConfig(seasonId),
      getAuctionPool(seasonId),
      getAuctionTeamSummaries(seasonId),
      getBidTicker(seasonId),
    ])
    return { season, auctionConfig, pool, teamSummaries, ticker }
  }, [seasonId])

  useEffect(() => {
    if (!seasonId) return
    const unsubscribe = subscribeToAuction(seasonId, reload)
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId])

  if (seasonsLoading || (loading && !data)) return <LoadingState rows={8} />

  if (!auctionSeasons || auctionSeasons.length === 0) {
    return (
      <EmptyState
        icon={Gavel}
        title="No auctions yet"
        description="No season has run a live auction yet."
      />
    )
  }

  if (error || !data?.season) return <ErrorState message="Season not found." />

  const { season, auctionConfig, pool, teamSummaries, ticker } = data

  const seasonSwitcher =
    auctionSeasons.length > 1 ? (
      <SeasonSelector
        seasons={auctionSeasons}
        value={seasonId}
        onChange={(id) => navigate(`/auction/${id}`)}
        includeAllOption={false}
      />
    ) : null

  if (!auctionConfig || auctionConfig.status === 'DRAFT') {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 font-display text-3xl font-bold text-primary-900">
            <Gavel className="h-6 w-6" /> Auction
          </h1>
          {seasonSwitcher}
        </div>
        <EmptyState
          icon={Gavel}
          title="Auction hasn't started"
          description={`The ${season.name} auction hasn't begun yet. Check back once it's live.`}
        />
      </div>
    )
  }

  if (auctionConfig.auction_mode === 'MANUAL') {
    return (
      <ManualAuctionSpectator
        season={season}
        auctionConfig={auctionConfig}
        pool={pool}
        teamSummaries={teamSummaries}
        ticker={ticker}
        seasonSwitcher={seasonSwitcher}
      />
    )
  }

  const currentPlayerEntry = pool.find((p) => p.player_id === auctionConfig.current_player_id)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="flex items-center gap-2 font-display text-3xl font-bold text-primary-900">
            <Gavel className="h-6 w-6" /> {season.name} Auction
          </h1>
          <Badge variant="outline">{auctionConfig.status}</Badge>
        </div>
        {seasonSwitcher}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>On the Block</CardTitle>
        </CardHeader>
        <CardContent>
          {currentPlayerEntry ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-display text-xl font-bold text-primary-900">{currentPlayerEntry.player.name}</p>
                <p className="text-sm text-muted-foreground">{currentPlayerEntry.player.role ?? 'Unassigned role'}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Current Bid</p>
                <p className="font-display text-2xl font-bold text-primary-900">
                  {formatLakh(auctionConfig.current_high_bid ?? currentPlayerEntry.base_price)}
                </p>
                {auctionConfig.current_high_team_id ? (
                  <p className="text-sm text-muted-foreground">
                    {teamSummaries.find((t) => t.team.id === auctionConfig.current_high_team_id)?.team.name}
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {auctionConfig.status === 'COMPLETED' ? 'Auction complete.' : 'Waiting for the next player…'}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {teamSummaries.map((ts) => (
          <Card key={ts.team.id}>
            <CardHeader>
              <CardTitle className="text-base">{ts.team.name}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <p className="text-sm">
                Purse: {formatLakh(ts.purseRemaining)} / {formatLakh(ts.purseTotal)}
              </p>
              <p className="text-xs text-muted-foreground">{ts.roster.length} players</p>
              <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                {ts.roster.map((r) => (
                  <li key={r.player.id}>
                    {r.player.name} {r.price != null ? `— ${formatLakh(r.price)}` : ''}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bid Ticker</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {ticker.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">No bids yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ticker.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>{b.player.name}</TableCell>
                    <TableCell>{b.team.name}</TableCell>
                    <TableCell className="text-right">{formatLakh(b.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
