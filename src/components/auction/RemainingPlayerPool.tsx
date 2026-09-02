import { useMemo, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { PlayerAvatar } from '@/components/shared/Avatar'
import { formatLakh } from '@/utils/currency'
import { PLAYER_ROLE_LABELS, PLAYER_ROLES } from '@/types'
import { computePlayerTier } from '@/utils/playerTier'
import type { AuctionPlayerStatus, Player, PlayerRole, SeasonAuctionPlayer } from '@/types'
import type { AuctionPlayerStats } from '@/utils/auctionPlayerStats'

const STATUS_BADGE: Record<AuctionPlayerStatus, { label: string; variant: 'default' | 'accent' | 'success' | 'destructive' | 'outline' }> = {
  PENDING: { label: 'Pending', variant: 'outline' },
  ON_BLOCK: { label: 'On Block', variant: 'accent' },
  SOLD: { label: 'Sold', variant: 'success' },
  UNSOLD: { label: 'Unsold', variant: 'destructive' },
}

const STATUS_ORDER: Record<AuctionPlayerStatus, number> = { ON_BLOCK: 0, PENDING: 1, UNSOLD: 2, SOLD: 3 }

export function RemainingPlayerPool({
  pool,
  statsByPlayer,
  collapsedCount,
}: {
  pool: (SeasonAuctionPlayer & { player: Player })[]
  statsByPlayer: Record<string, AuctionPlayerStats>
  /** When set, only this many rows show by default with a "View all" toggle below. Omit to always show everything (existing Admin behavior, unchanged). */
  collapsedCount?: number
}) {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'ALL' | PlayerRole>('ALL')
  const [showSold, setShowSold] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return pool
      .filter((p) => (showSold ? true : p.status !== 'SOLD'))
      .filter((p) => (roleFilter === 'ALL' ? true : p.player.role === roleFilter))
      .filter((p) => (term === '' ? true : p.player.name.toLowerCase().includes(term)))
      .sort((a, b) => {
        const diff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
        if (diff !== 0) return diff
        return (a.order_no ?? 0) - (b.order_no ?? 0)
      })
  }, [pool, search, roleFilter, showSold])

  const visible = collapsedCount != null && !expanded ? filtered.slice(0, collapsedCount) : filtered
  const hasMore = collapsedCount != null && filtered.length > collapsedCount

  const pendingCount = pool.filter((p) => p.status === 'PENDING').length
  const soldCount = pool.filter((p) => p.status === 'SOLD').length
  const unsoldCount = pool.filter((p) => p.status === 'UNSOLD').length

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>
          Player Pool
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {pendingCount} pending · {soldCount} sold · {unsoldCount} unsold
          </span>
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search player…"
              className="h-8 w-40 pl-8 text-xs"
            />
          </div>
          <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as 'ALL' | PlayerRole)}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Roles</SelectItem>
              {PLAYER_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {PLAYER_ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => setShowSold((s) => !s)}
            className="rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary"
          >
            {showSold ? 'Hide Sold' : 'Show Sold'}
          </button>
        </div>
      </CardHeader>
      <CardContent className={cn('p-0', collapsedCount == null && 'max-h-[520px] overflow-y-auto')}>
        <div className="p-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Player</TableHead>
              <TableHead>Role / Tier</TableHead>
              <TableHead className="text-right">Rating</TableHead>
              <TableHead className="text-right">K / D / F</TableHead>
              <TableHead className="text-right">Win% · KD</TableHead>
              <TableHead className="text-right">Base Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Round</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                  No players match.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((entry) => {
                const stats = statsByPlayer[entry.player.id]
                const badge = STATUS_BADGE[entry.status]
                return (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <PlayerAvatar name={entry.player.name} imageUrl={entry.player.image_url} className="h-8 w-8 text-xs" />
                        <span className="font-medium">{entry.player.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {entry.player.role ? PLAYER_ROLE_LABELS[entry.player.role] : '—'}
                      {' · '}
                      {computePlayerTier(
                        entry.player.role,
                        stats ? { kd: stats.kd, flagsPerMatch: stats.avgFlags } : null,
                        stats?.matchesPlayed ?? 0,
                      )?.label ?? '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {entry.player_index != null ? entry.player_index.toFixed(0) : '—'}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {stats ? `${stats.kills}/${stats.deaths}/${stats.flags}` : '—'}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {stats ? `${stats.winRate}% · ${stats.kd.toFixed(2)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right">{formatLakh(entry.base_price)}</TableCell>
                    <TableCell>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {entry.attempt_no === 2 ? 'Round 2' : 'Round 1'}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
        </div>
        {hasMore ? (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="flex w-full items-center justify-center gap-1 border-t border-border py-2.5 text-sm font-semibold text-primary-700 hover:bg-secondary/50"
          >
            {expanded ? 'Show less' : 'View all remaining players'}
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
          </button>
        ) : null}
      </CardContent>
    </Card>
  )
}
