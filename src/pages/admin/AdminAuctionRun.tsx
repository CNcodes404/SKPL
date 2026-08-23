import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Copy, Gavel, Pause, Play, RotateCcw, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/shared/FormField'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { useAsync } from '@/hooks/useAsync'
import { getSeason, getSeasonTeams } from '@/services/seasons'
import {
  advanceAuctionTick,
  getAuctionConfig,
  getAuctionPool,
  getAuctionTeamSummaries,
  getBidTicker,
  getLockedStrategies,
  pauseAuction,
  resetAuction,
  resumeAuction,
  skipPlayer,
  startAuction,
  subscribeToAuction,
  type AuctionBidTickerEntry,
  type AuctionTeamSummary,
} from '@/services/auction'
import { getRetentionSubmissionStatus } from '@/services/retention'
import { formatLakh } from '@/utils/currency'
import type { SeasonAuction, SeasonAuctionPlayer, Player, Team } from '@/types'

const ORDER_STRATEGY_LABELS: Record<string, string> = {
  RANDOM: 'Random',
  INDEX_DESC: 'Marquee First',
  ROLE_GROUPED: 'Grouped by Role',
}

export default function AdminAuctionRun() {
  const { seasonId = '' } = useParams()
  const { data, loading, error, reload } = useAsync(async () => {
    const [season, teams, auctionConfig, pool, teamSummaries, ticker, retentionStatus] = await Promise.all([
      getSeason(seasonId),
      getSeasonTeams(seasonId),
      getAuctionConfig(seasonId),
      getAuctionPool(seasonId),
      getAuctionTeamSummaries(seasonId),
      getBidTicker(seasonId),
      getRetentionSubmissionStatus(seasonId),
    ])
    return { season, teams, auctionConfig, pool, teamSummaries, ticker, retentionStatus }
  }, [seasonId])

  const driverTokenRef = useRef<string>(crypto.randomUUID())
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  function handleCopyViewerLink() {
    navigator.clipboard.writeText(`${window.location.origin}/auction/${seasonId}`)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  useEffect(() => {
    const unsubscribe = subscribeToAuction(seasonId, reload)
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId])

  useEffect(() => {
    if (data?.auctionConfig?.status !== 'RUNNING') return
    const interval = setInterval(() => {
      advanceAuctionTick(seasonId, driverTokenRef.current)
        .then(() => reload())
        .catch((err) => console.error(err))
    }, 1500)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId, data?.auctionConfig?.status])

  if (loading && !data) return <LoadingState rows={8} />
  if (error || !data?.season) return <ErrorState message="Season not found." />

  const { season, teams, auctionConfig, pool, teamSummaries, ticker, retentionStatus } = data

  if (!auctionConfig) {
    return <ErrorState message="This season was not created with an auction-based roster." />
  }

  async function handleReset() {
    setResetting(true)
    try {
      await resetAuction(seasonId)
      setResetOpen(false)
      reload()
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="flex items-center gap-2 font-display text-3xl font-bold text-primary-900">
            <Gavel className="h-6 w-6" /> {season.name} Auction
          </h1>
          <Badge variant="outline">{auctionConfig.status}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {auctionConfig.status !== 'DRAFT' ? (
            <Button variant="outline" onClick={handleCopyViewerLink}>
              <Copy className="h-4 w-4" /> {linkCopied ? 'Link Copied!' : 'Copy Viewer Link'}
            </Button>
          ) : null}
          {auctionConfig.status !== 'DRAFT' ? (
            <Button variant="destructive" onClick={() => setResetOpen(true)}>
              <RotateCcw className="h-4 w-4" /> Reset Auction
            </Button>
          ) : null}
        </div>
      </div>

      {auctionConfig.status === 'DRAFT' ? (
        <ConfigurePanel
          seasonId={seasonId}
          teams={teams}
          retentionStatus={retentionStatus}
          onStarted={reload}
        />
      ) : (
        <LivePanel
          seasonId={seasonId}
          auctionConfig={auctionConfig}
          pool={pool}
          teamSummaries={teamSummaries}
          ticker={ticker}
          onChanged={reload}
        />
      )}

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset Auction"
        description="This deletes every roster slot decided by this auction (retained players are safe) and returns it to Configure. This cannot be undone."
        confirmLabel="Reset"
        loading={resetting}
        onConfirm={handleReset}
      />
    </div>
  )
}

function ConfigurePanel({
  seasonId,
  teams,
  retentionStatus,
  onStarted,
}: {
  seasonId: string
  teams: Team[]
  retentionStatus: { team_id: string; retention_submitted: boolean }[]
  onStarted: () => void
}) {
  const [purseDefault, setPurseDefault] = useState(40_000_000)
  const [categoryPriceA, setCategoryPriceA] = useState(3_000_000)
  const [categoryPriceB, setCategoryPriceB] = useState(2_000_000)
  const [categoryPriceC, setCategoryPriceC] = useState(1_000_000)
  const [minSquadSize, setMinSquadSize] = useState(4)
  const [maxSquadSize, setMaxSquadSize] = useState(6)
  const [orderStrategy, setOrderStrategy] = useState<'RANDOM' | 'INDEX_DESC' | 'ROLE_GROUPED'>('RANDOM')
  const [purseOverrides, setPurseOverrides] = useState<Record<string, string>>({})
  const [starting, setStarting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const submittedCount = retentionStatus.filter((r) => r.retention_submitted).length
  const allSubmitted = teams.length > 0 && submittedCount === teams.length

  async function handleStart() {
    setStarting(true)
    setFormError(null)
    try {
      await startAuction({
        seasonId,
        purseDefault,
        minSquadSize,
        maxSquadSize,
        orderStrategy,
        purseOverrides: Object.entries(purseOverrides)
          .filter(([, v]) => v.trim() !== '')
          .map(([team_id, v]) => ({ team_id, purse_total: Number(v) })),
        categoryBands: [
          { label: 'C', minPercentile: 0, price: categoryPriceC },
          { label: 'B', minPercentile: 0.4, price: categoryPriceB },
          { label: 'A', minPercentile: 0.75, price: categoryPriceA },
        ],
      })
      onStarted()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to start the auction.')
    } finally {
      setStarting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configure Auction</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="rounded-lg border border-border p-3 text-sm">
          Retention decisions: {submittedCount} / {teams.length} teams submitted
          {!allSubmitted ? (
            <p className="text-muted-foreground">All teams must submit a retention decision before you can start.</p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Default Purse" htmlFor="purse-default">
            <Input
              id="purse-default"
              type="number"
              min={0}
              value={purseDefault}
              onChange={(e) => setPurseDefault(Number(e.target.value))}
            />
          </FormField>
          <FormField label="Minimum Squad Size" htmlFor="min-squad">
            <Input
              id="min-squad"
              type="number"
              min={1}
              value={minSquadSize}
              onChange={(e) => setMinSquadSize(Number(e.target.value))}
            />
          </FormField>
          <FormField label="Maximum Squad Size" htmlFor="max-squad">
            <Input
              id="max-squad"
              type="number"
              min={1}
              value={maxSquadSize}
              onChange={(e) => setMaxSquadSize(Number(e.target.value))}
            />
          </FormField>
          <FormField label="Player Order" htmlFor="order-strategy">
            <Select value={orderStrategy} onValueChange={(v) => setOrderStrategy(v as typeof orderStrategy)}>
              <SelectTrigger id="order-strategy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ORDER_STRATEGY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-primary-900">
            Category Base Prices (by Player Index percentile within the pool)
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Category A (top ~25%)" htmlFor="category-a">
              <Input
                id="category-a"
                type="number"
                min={0}
                value={categoryPriceA}
                onChange={(e) => setCategoryPriceA(Number(e.target.value))}
              />
            </FormField>
            <FormField label="Category B (next ~35%)" htmlFor="category-b">
              <Input
                id="category-b"
                type="number"
                min={0}
                value={categoryPriceB}
                onChange={(e) => setCategoryPriceB(Number(e.target.value))}
              />
            </FormField>
            <FormField label="Category C (remaining ~40%)" htmlFor="category-c">
              <Input
                id="category-c"
                type="number"
                min={0}
                value={categoryPriceC}
                onChange={(e) => setCategoryPriceC(Number(e.target.value))}
              />
            </FormField>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-primary-900">Per-Team Purse Overrides (optional)</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {teams.map((team) => (
              <FormField key={team.id} label={team.name} htmlFor={`purse-${team.id}`}>
                <Input
                  id={`purse-${team.id}`}
                  type="number"
                  placeholder={String(purseDefault)}
                  value={purseOverrides[team.id] ?? ''}
                  onChange={(e) => setPurseOverrides((o) => ({ ...o, [team.id]: e.target.value }))}
                />
              </FormField>
            ))}
          </div>
        </div>

        {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

        <Button onClick={handleStart} disabled={!allSubmitted || starting} className="self-start">
          {starting ? 'Starting…' : 'Start Auction'}
        </Button>
      </CardContent>
    </Card>
  )
}

function LivePanel({
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
  const [skipping, setSkipping] = useState(false)
  const currentPlayerEntry = pool.find((p) => p.player_id === auctionConfig.current_player_id)

  async function handlePause() {
    await pauseAuction(seasonId)
    onChanged()
  }
  async function handleResume() {
    await resumeAuction(seasonId)
    onChanged()
  }
  async function handleSkip() {
    if (!auctionConfig.current_player_id) return
    setSkipping(true)
    try {
      await skipPlayer(seasonId, auctionConfig.current_player_id)
      onChanged()
    } finally {
      setSkipping(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        {auctionConfig.status === 'RUNNING' ? (
          <Button variant="outline" onClick={handlePause}>
            <Pause className="h-4 w-4" /> Pause
          </Button>
        ) : auctionConfig.status === 'PAUSED' ? (
          <Button onClick={handleResume}>
            <Play className="h-4 w-4" /> Resume
          </Button>
        ) : null}
        {auctionConfig.current_player_id && auctionConfig.status !== 'COMPLETED' ? (
          <Button variant="outline" onClick={handleSkip} disabled={skipping}>
            <SkipForward className="h-4 w-4" /> Skip Player
          </Button>
        ) : null}
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

      {auctionConfig.status === 'COMPLETED' ? <StrategyReveal seasonId={seasonId} /> : null}
    </div>
  )
}

function StrategyReveal({ seasonId }: { seasonId: string }) {
  const { data, loading } = useAsync(() => getLockedStrategies(seasonId), [seasonId])

  if (loading || !data) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Strategy Reveal (Admin Only)</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Team</TableHead>
              <TableHead className="text-center">Aggressiveness</TableHead>
              <TableHead className="text-center">Budget Discipline</TableHead>
              <TableHead className="text-center">Persistence</TableHead>
              <TableHead>Top Weights</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => {
              const weights: [string, number][] = (
                [
                  ['Kills', row.weight_kills],
                  ['Deaths', row.weight_deaths],
                  ['Flags', row.weight_flags],
                  ['K/D', row.weight_kd],
                  ['Win Rate', row.weight_winrate],
                  ['MVP', row.weight_mvp],
                  ['Experience', row.weight_experience],
                  ['Form', row.weight_form],
                ] as [string, number][]
              ).sort((a, b) => b[1] - a[1])
              return (
                <TableRow key={row.team_id}>
                  <TableCell className="font-semibold">{row.team.name}</TableCell>
                  <TableCell className="text-center">{row.aggressiveness}</TableCell>
                  <TableCell className="text-center">{row.budget_discipline}</TableCell>
                  <TableCell className="text-center">{row.persistence}</TableCell>
                  <TableCell>
                    {weights
                      .slice(0, 3)
                      .map(([label, value]) => `${label} (${value.toFixed(1)})`)
                      .join(', ')}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
