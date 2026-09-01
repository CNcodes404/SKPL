import { PlayerAvatar, TeamLogo } from '@/components/shared/Avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { CountdownTimer } from '@/components/auction/CountdownTimer'
import { formatKD } from '@/utils/calculations'
import { formatLakh } from '@/utils/currency'
import { PLAYER_ROLE_LABELS } from '@/types'
import { computePlayerTier } from '@/utils/playerTier'
import type { Player, SeasonAuction, SeasonAuctionPlayer, Team } from '@/types'
import type { AuctionPlayerStats } from '@/utils/auctionPlayerStats'

export function CurrentPlayerPanel({
  player,
  poolEntry,
  auction,
  highestBidderTeam,
  stats,
  minimumNextBid,
  resolving,
  paused = false,
}: {
  player: Player
  poolEntry: SeasonAuctionPlayer
  auction: SeasonAuction
  highestBidderTeam: Team | null
  stats: AuctionPlayerStats | undefined
  minimumNextBid: number | null
  resolving: boolean
  paused?: boolean
}) {
  const tier = computePlayerTier(player.role, poolEntry.index_components, stats?.matchesPlayed ?? 0)

  return (
    <Card className="overflow-hidden border-2 border-primary-200">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <PlayerAvatar name={player.name} imageUrl={player.image_url} className="h-14 w-14 text-base" />
            <div>
              <p className="font-display text-lg font-extrabold text-primary-900">{player.name}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {player.role ? <Badge variant="outline">{PLAYER_ROLE_LABELS[player.role]}</Badge> : null}
                {tier ? <Badge variant="outline">{tier.label}</Badge> : null}
                <Badge variant="default">Base {formatLakh(poolEntry.base_price)}</Badge>
                {poolEntry.attempt_no === 2 ? <Badge variant="accent">Round 2</Badge> : null}
              </div>
            </div>
          </div>
          <CountdownTimer expiresAt={auction.bid_expires_at} resolving={resolving} paused={paused} />
        </div>

        <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-secondary/40 p-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current Bid</p>
            <p className="font-display text-3xl font-extrabold text-primary-900">
              {formatLakh(auction.current_high_bid ?? poolEntry.base_price)}
            </p>
            {highestBidderTeam ? (
              <div className="mt-1 flex items-center gap-2">
                <TeamLogo name={highestBidderTeam.name} logoUrl={highestBidderTeam.logo_url} className="h-6 w-6 text-xs" />
                <span className="text-sm font-semibold text-primary-700">{highestBidderTeam.name}</span>
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">No bids yet</p>
            )}
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {highestBidderTeam ? 'Next Minimum Bid' : 'Starting Bid'}
            </p>
            <p className="font-display text-xl font-bold text-accent-700">
              {minimumNextBid != null ? formatLakh(minimumNextBid) : '—'}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Informational only — enforced server-side</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 lg:grid-cols-8">
          <StatTile label="Kills" value={stats?.kills ?? '—'} />
          <StatTile label="Deaths" value={stats?.deaths ?? '—'} />
          <StatTile label="Flags" value={stats?.flags ?? '—'} />
          <StatTile label="Win Rate" value={stats ? `${stats.winRate}%` : '—'} />
          <StatTile label="K/D" value={stats ? formatKD(stats.kills, stats.deaths) : '—'} />
          <StatTile label="Avg Kills" value={stats?.avgKills ?? '—'} />
          <StatTile label="Avg Flags" value={stats?.avgFlags ?? '—'} />
          <StatTile label="Rating" value={poolEntry.player_index != null ? poolEntry.player_index.toFixed(0) : '—'} />
        </div>
      </CardContent>
    </Card>
  )
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border p-1.5 text-center">
      <p className="font-display text-base font-bold text-primary-800">{value}</p>
      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  )
}
