import { PlayerAvatar } from '@/components/shared/Avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatKD } from '@/utils/calculations'
import { formatLakh } from '@/utils/currency'
import { PLAYER_ROLE_LABELS } from '@/types'
import { computePlayerTier } from '@/utils/playerTier'
import type { Player, SeasonAuctionPlayer } from '@/types'
import type { AuctionPlayerStats } from '@/utils/auctionPlayerStats'

/**
 * The player-detail half of the "on the block" hero — image, identity,
 * base price, and the 8-stat grid. Deliberately excludes bid/countdown
 * info (that lives alongside it, in a separate panel) so this can be
 * reused by both the Owner and Spectator screens regardless of how each
 * arranges the bidding side. Not used by Admin, which keeps its existing
 * CurrentPlayerPanel unchanged.
 */
export function PlayerShowcaseCard({
  player,
  poolEntry,
  stats,
}: {
  player: Player
  poolEntry: SeasonAuctionPlayer
  stats?: AuctionPlayerStats
}) {
  const tier = computePlayerTier(player.role, poolEntry.index_components, stats?.matchesPlayed ?? 0)

  return (
    <Card className="overflow-hidden border-2 border-primary-200">
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-start gap-4">
          <PlayerAvatar name={player.name} imageUrl={player.image_url} className="h-28 w-28 rounded-xl text-3xl" />
          <div className="flex-1">
            {poolEntry.order_no != null ? (
              <Badge variant="outline" className="mb-1">
                #{poolEntry.order_no}
              </Badge>
            ) : null}
            <p className="font-display text-2xl font-extrabold text-primary-900">{player.name}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {player.role ? <Badge variant="outline">{PLAYER_ROLE_LABELS[player.role]}</Badge> : null}
              {tier ? <Badge variant="outline">{tier.label}</Badge> : null}
              {poolEntry.attempt_no === 2 ? <Badge variant="accent">Round 2</Badge> : null}
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">Base Price: {formatLakh(poolEntry.base_price)}</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <StatTile label="Kills" value={stats?.kills ?? '—'} />
          <StatTile label="Deaths" value={stats?.deaths ?? '—'} />
          <StatTile label="Flags" value={stats?.flags ?? '—'} />
          <StatTile label="Win Rate" value={stats ? `${stats.winRate}%` : '—'} />
          <StatTile label="K/D" value={stats ? formatKD(stats.kills, stats.deaths) : '—'} />
          <StatTile label="Avg Kills" value={stats?.avgKills ?? '—'} />
          <StatTile label="Avg Flags" value={stats?.avgFlags ?? '—'} />
          <StatTile label="Rating" value={poolEntry.player_index != null ? poolEntry.player_index.toFixed(0) : '—'} />
        </div>

        <p className="flex items-start gap-1.5 rounded-md bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
          Performance stats are based on the player's tournament career.
        </p>
      </CardContent>
    </Card>
  )
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border p-2 text-center">
      <p className="font-display text-lg font-bold text-primary-800">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  )
}
