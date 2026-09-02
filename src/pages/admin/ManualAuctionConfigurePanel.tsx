import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FormField } from '@/components/shared/FormField'
import { useAsync } from '@/hooks/useAsync'
import { startManualAuction, describeAuctionError } from '@/services/manualAuction'
import { listPlayers } from '@/services/players'
import { getSeasonRetentions } from '@/services/retention'
import { formatLakh } from '@/utils/currency'
import type { PlayerDrawModeType, Team } from '@/types'

const ORDER_STRATEGY_LABELS: Record<string, string> = {
  RANDOM: 'Random',
  INDEX_DESC: 'Marquee First',
  ROLE_GROUPED: 'Grouped by Role',
}

export function ManualAuctionConfigurePanel({
  seasonId,
  teams,
  retentionStatus,
  maxRetentionsPerTeam,
  onStarted,
}: {
  seasonId: string
  teams: Team[]
  retentionStatus: { team_id: string; retention_submitted: boolean }[]
  maxRetentionsPerTeam: number
  onStarted: () => void
}) {
  const [purseDefault, setPurseDefault] = useState(40_000_000)
  const [minSquadSize, setMinSquadSize] = useState(4)
  const [maxSquadSize, setMaxSquadSize] = useState(6)
  const [orderStrategy, setOrderStrategy] = useState<'RANDOM' | 'INDEX_DESC' | 'ROLE_GROUPED'>('RANDOM')
  const [playerDrawMode, setPlayerDrawMode] = useState<PlayerDrawModeType>('AUTO')
  const [basePriceDefault, setBasePriceDefault] = useState(1_000_000)
  const [initialBidIncrement, setInitialBidIncrement] = useState(100_000)
  const [incrementStepRange, setIncrementStepRange] = useState(1_000_000)
  const [incrementIncrease, setIncrementIncrease] = useState(100_000)
  const [bidTimerSeconds, setBidTimerSeconds] = useState(30)
  const [purseOverrides, setPurseOverrides] = useState<Record<string, string>>({})
  const [directAssignments, setDirectAssignments] = useState<Record<string, { playerId: string; price: string }>>({})
  const [starting, setStarting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const retentionDisabled = maxRetentionsPerTeam === 0
  const submittedCount = retentionStatus.filter((r) => r.retention_submitted).length
  const allSubmitted = retentionDisabled || (teams.length > 0 && submittedCount === teams.length)

  const { data: assignmentPickerData } = useAsync(async () => {
    const [players, retentions] = await Promise.all([listPlayers(false), getSeasonRetentions(seasonId)])
    return { players, retainedPlayerIds: new Set(retentions.map((r) => r.player_id)) }
  }, [seasonId])

  async function handleStart() {
    setStarting(true)
    setFormError(null)
    try {
      await startManualAuction({
        seasonId,
        purseDefault,
        minSquadSize,
        maxSquadSize,
        orderStrategy,
        playerDrawMode,
        initialBidIncrement,
        incrementStepRange,
        incrementIncrease,
        bidTimerSeconds,
        basePriceDefault,
        purseOverrides: Object.entries(purseOverrides)
          .filter(([, v]) => v.trim() !== '')
          .map(([team_id, v]) => ({ team_id, purse_total: Number(v) })),
        directAssignments: Object.entries(directAssignments)
          .filter(([, a]) => a.playerId && a.price.trim() !== '')
          .map(([team_id, a]) => ({ team_id, player_id: a.playerId, price: Number(a.price) })),
      })
      onStarted()
    } catch (err) {
      setFormError(describeAuctionError(err))
    } finally {
      setStarting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configure Manual Auction</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="rounded-lg border border-border p-3 text-sm">
          {retentionDisabled ? (
            <p className="text-muted-foreground">Retention is disabled for this season (0 allowed) — no submissions required.</p>
          ) : (
            <>
              Retention decisions: {submittedCount} / {teams.length} teams submitted
              {!allSubmitted ? (
                <p className="text-muted-foreground">All teams must submit a retention decision before you can start.</p>
              ) : null}
            </>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Default Purse" htmlFor="m-purse-default">
            <Input
              id="m-purse-default"
              type="number"
              min={0}
              value={purseDefault}
              onChange={(e) => setPurseDefault(Number(e.target.value))}
            />
          </FormField>
          <FormField label="Default Base Price" htmlFor="m-base-price" hint="A player's base price is their starting bid.">
            <Input
              id="m-base-price"
              type="number"
              min={0}
              value={basePriceDefault}
              onChange={(e) => setBasePriceDefault(Number(e.target.value))}
            />
          </FormField>
          <FormField label="Minimum Squad Size" htmlFor="m-min-squad">
            <Input
              id="m-min-squad"
              type="number"
              min={1}
              value={minSquadSize}
              onChange={(e) => setMinSquadSize(Number(e.target.value))}
            />
          </FormField>
          <FormField label="Maximum Squad Size" htmlFor="m-max-squad">
            <Input
              id="m-max-squad"
              type="number"
              min={1}
              value={maxSquadSize}
              onChange={(e) => setMaxSquadSize(Number(e.target.value))}
            />
          </FormField>
          <FormField label="Player Order" htmlFor="m-order-strategy">
            <Select value={orderStrategy} onValueChange={(v) => setOrderStrategy(v as typeof orderStrategy)}>
              <SelectTrigger id="m-order-strategy">
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
          <FormField label="Player Draw Mode" htmlFor="m-draw-mode" hint="Controls who selects the next player — not how teams bid.">
            <Select value={playerDrawMode} onValueChange={(v) => setPlayerDrawMode(v as PlayerDrawModeType)}>
              <SelectTrigger id="m-draw-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AUTO">Auto Draw — system selects the next player</SelectItem>
                <SelectItem value="MANUAL">Manual Draw — admin selects the next player</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-primary-900">Bidding Rules</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FormField label="Initial Bid Increment" htmlFor="m-initial-increment">
              <Input
                id="m-initial-increment"
                type="number"
                min={0}
                value={initialBidIncrement}
                onChange={(e) => setInitialBidIncrement(Number(e.target.value))}
              />
            </FormField>
            <FormField label="Increment Step Range" htmlFor="m-step-range">
              <Input
                id="m-step-range"
                type="number"
                min={1}
                value={incrementStepRange}
                onChange={(e) => setIncrementStepRange(Number(e.target.value))}
              />
            </FormField>
            <FormField label="Increment Increase" htmlFor="m-increment-increase">
              <Input
                id="m-increment-increase"
                type="number"
                min={0}
                value={incrementIncrease}
                onChange={(e) => setIncrementIncrease(Number(e.target.value))}
              />
            </FormField>
            <FormField label="Bid Timer (seconds)" htmlFor="m-bid-timer">
              <Input
                id="m-bid-timer"
                type="number"
                min={1}
                value={bidTimerSeconds}
                onChange={(e) => setBidTimerSeconds(Number(e.target.value))}
              />
            </FormField>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            The required raise grows by {formatLakh(incrementIncrease)} every time the bid climbs another{' '}
            {formatLakh(incrementStepRange)} above the starting price. Example: starting at {formatLakh(basePriceDefault)}{' '}
            with a {formatLakh(initialBidIncrement)} initial increment, the increment steps up once the bid passes{' '}
            {formatLakh(basePriceDefault + incrementStepRange)}, again past{' '}
            {formatLakh(basePriceDefault + incrementStepRange * 2)}, and so on — enforced server-side; this is explanatory
            only.
          </p>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-primary-900">Per-Team Purse Overrides (optional)</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {teams.map((team) => (
              <FormField key={team.id} label={team.name} htmlFor={`m-purse-${team.id}`}>
                <Input
                  id={`m-purse-${team.id}`}
                  type="number"
                  placeholder={String(purseDefault)}
                  value={purseOverrides[team.id] ?? ''}
                  onChange={(e) => setPurseOverrides((o) => ({ ...o, [team.id]: e.target.value }))}
                />
              </FormField>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1 text-sm font-semibold text-primary-900">Direct Player-Owner Assignment (optional)</p>
          <p className="mb-2 text-xs text-muted-foreground">
            SKPL has no separate team owner — one of the team's own players bids on its behalf. Assign that player
            straight to their team here at a set price; they skip the auction pool entirely and can't also be a
            retained player this season.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {teams.map((team) => {
              const assignment = directAssignments[team.id] ?? { playerId: '', price: '' }
              const pickedElsewhere = new Set(
                Object.entries(directAssignments)
                  .filter(([tid]) => tid !== team.id)
                  .map(([, a]) => a.playerId)
                  .filter(Boolean),
              )
              const eligiblePlayers = (assignmentPickerData?.players ?? []).filter(
                (p) => !assignmentPickerData?.retainedPlayerIds.has(p.id) && !pickedElsewhere.has(p.id),
              )
              return (
                <div key={team.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                  <p className="text-sm font-semibold text-primary-900">{team.name}</p>
                  <Select
                    value={assignment.playerId || 'NONE'}
                    onValueChange={(v) =>
                      setDirectAssignments((d) => ({ ...d, [team.id]: { ...assignment, playerId: v === 'NONE' ? '' : v } }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="No direct assignment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">No direct assignment</SelectItem>
                      {eligiblePlayers.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    placeholder="Price"
                    disabled={!assignment.playerId}
                    value={assignment.price}
                    onChange={(e) => setDirectAssignments((d) => ({ ...d, [team.id]: { ...assignment, price: e.target.value } }))}
                  />
                  {assignment.playerId && assignment.price.trim() === '' ? (
                    <p className="text-xs text-destructive">Enter a price, or this assignment won't be applied.</p>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>

        {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

        <Button onClick={handleStart} disabled={!allSubmitted || starting} className="self-start">
          {starting ? 'Starting…' : 'Start Manual Auction'}
        </Button>
      </CardContent>
    </Card>
  )
}
