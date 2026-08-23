import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronLeft, ChevronRight, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { FormField } from '@/components/shared/FormField'
import { TeamLogo } from '@/components/shared/Avatar'
import { PlayerAvatar } from '@/components/shared/Avatar'
import { LoadingState } from '@/components/shared/LoadingState'
import { useAsync } from '@/hooks/useAsync'
import { listTeams } from '@/services/teams'
import { listPlayers } from '@/services/players'
import { createSeasonWithSetup } from '@/services/seasons'
import { applyRosterPrices, computeManualSeasonPrices } from '@/services/legacyPricing'
import { generateSchedule, expectedMatchCount } from '@/utils/schedule'
import { cn } from '@/lib/utils'
import type { Team } from '@/types'

const STEPS = ['Basics', 'Teams', 'Rosters', 'Rules', 'Schedule', 'Confirm']

interface ScheduledMatch {
  team_a_id: string
  team_b_id: string
  scheduled_at: string
}

export default function SeasonCreateWizard() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)

  const { data: teams, loading: teamsLoading } = useAsync(() => listTeams(), [])
  const { data: players, loading: playersLoading } = useAsync(() => listPlayers(), [])

  // Step 1
  const [name, setName] = useState('')
  const [seasonNumber, setSeasonNumber] = useState(1)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Step 2
  const [teamIds, setTeamIds] = useState<string[]>([])

  // Step 3 — playerId -> teamId
  const [roster, setRoster] = useState<Record<string, string>>({})
  const [rosterMode, setRosterMode] = useState<'MANUAL' | 'AUCTION'>('MANUAL')
  const [maxRetentionsPerTeam, setMaxRetentionsPerTeam] = useState(2)
  const [retentionPriceIncreasePct, setRetentionPriceIncreasePct] = useState(20)

  // Step 4
  const [winningPoints, setWinningPoints] = useState(3)
  const [closeLossEnabled, setCloseLossEnabled] = useState(true)
  const [closeLossPoints, setCloseLossPoints] = useState(1)
  const [closeLossMaxDifference, setCloseLossMaxDifference] = useState(2)
  const [playoffTeamCount, setPlayoffTeamCount] = useState(4)
  const [matchesPerOpponent, setMatchesPerOpponent] = useState(1)

  // Step 5
  const [schedule, setSchedule] = useState<ScheduledMatch[]>([])
  const [scheduleGeneratedFor, setScheduleGeneratedFor] = useState<string>('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const selectedTeams = useMemo(() => (teams ?? []).filter((t) => teamIds.includes(t.id)), [teams, teamIds])
  const teamById = useMemo(() => new Map((teams ?? []).map((t) => [t.id, t])), [teams])
  const playerById = useMemo(() => new Map((players ?? []).map((p) => [p.id, p])), [players])

  const scheduleKey = `${teamIds.slice().sort().join(',')}|${matchesPerOpponent}`

  function regenerateSchedule() {
    const pairings = generateSchedule(teamIds, matchesPerOpponent)
    const base = startDate ? new Date(`${startDate}T18:00`) : new Date()
    const generated: ScheduledMatch[] = pairings.map((p, i) => {
      const d = new Date(base)
      d.setDate(d.getDate() + i * 3)
      return { ...p, scheduled_at: toLocalInputValue(d) }
    })
    setSchedule(generated)
    setScheduleGeneratedFor(scheduleKey)
  }

  useEffect(() => {
    if (step !== 4) return
    if (scheduleGeneratedFor === scheduleKey) return
    regenerateSchedule()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, scheduleKey])

  function toggleTeam(teamId: string) {
    setTeamIds((prev) => (prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]))
    setRoster((prev) => {
      const next = { ...prev }
      for (const playerId of Object.keys(next)) {
        if (next[playerId] === teamId && !teamIds.includes(teamId)) delete next[playerId]
      }
      return next
    })
  }

  function togglePlayer(playerId: string, teamId: string) {
    setRoster((prev) => {
      const next = { ...prev }
      if (next[playerId] === teamId) {
        delete next[playerId]
      } else {
        next[playerId] = teamId
      }
      return next
    })
  }

  function canProceed(): boolean {
    switch (step) {
      case 0:
        return name.trim().length > 0 && seasonNumber > 0
      case 1:
        return teamIds.length >= 2
      case 2:
        return true
      case 3:
        return winningPoints >= 0 && matchesPerOpponent > 0 && playoffTeamCount >= 0
      case 4:
        return schedule.length > 0
      default:
        return true
    }
  }

  async function handleCreate() {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const rosters =
        rosterMode === 'AUCTION' ? [] : Object.entries(roster).map(([player_id, team_id]) => ({ player_id, team_id }))
      const matches = schedule.map((m) => ({
        team_a_id: m.team_a_id,
        team_b_id: m.team_b_id,
        scheduled_at: new Date(m.scheduled_at).toISOString(),
      }))

      const seasonId = await createSeasonWithSetup({
        name: name.trim(),
        season_number: seasonNumber,
        start_date: startDate || null,
        end_date: endDate || null,
        winning_points: winningPoints,
        close_loss_enabled: closeLossEnabled,
        close_loss_points: closeLossPoints,
        close_loss_max_difference: closeLossMaxDifference,
        playoff_team_count: playoffTeamCount,
        matches_per_opponent: matchesPerOpponent,
        team_ids: teamIds,
        rosters,
        matches,
        enable_auction: rosterMode === 'AUCTION',
        max_retentions_per_team: rosterMode === 'AUCTION' ? maxRetentionsPerTeam : 0,
        retention_price_increase_pct: rosterMode === 'AUCTION' ? retentionPriceIncreasePct : 0,
      })

      if (rosterMode === 'MANUAL') {
        const teamInputs = teamIds.map((teamId) => ({
          teamId,
          currentPlayerIds: rosters.filter((r) => r.team_id === teamId).map((r) => r.player_id),
        }))
        const prices = await computeManualSeasonPrices(seasonId, teamInputs)
        await applyRosterPrices(seasonId, prices)
      }

      navigate(`/admin/seasons/${seasonId}`)
    } catch (err) {
      console.error(err)
      setSubmitError('Unable to create season. Please review the details and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (teamsLoading || playersLoading) return <LoadingState rows={6} />

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-primary-900">Create Season</h1>
        <p className="text-sm text-muted-foreground">Set up a new SKPL season in a few steps.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold',
                i < step ? 'bg-green-600 text-white' : i === step ? 'bg-primary-700 text-white' : 'bg-secondary text-muted-foreground',
              )}
            >
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span className={cn('text-sm font-semibold', i === step ? 'text-primary-900' : 'text-muted-foreground')}>
              {label}
            </span>
            {i < STEPS.length - 1 ? <div className="h-px w-6 bg-border sm:w-10" /> : null}
          </div>
        ))}
      </div>

      <Card className="p-6">
        {step === 0 ? (
          <div className="flex flex-col gap-4 sm:max-w-md">
            <FormField label="Season Name" htmlFor="s-name">
              <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="SKPL Season 1" />
            </FormField>
            <FormField label="Season Number" htmlFor="s-number">
              <Input
                id="s-number"
                type="number"
                min={1}
                value={seasonNumber}
                onChange={(e) => setSeasonNumber(Number(e.target.value))}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Start Date" htmlFor="s-start">
                <Input id="s-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </FormField>
              <FormField label="End Date" htmlFor="s-end">
                <Input id="s-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </FormField>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">Select at least two active teams to participate this season.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(teams ?? []).map((team) => (
                <label
                  key={team.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors',
                    teamIds.includes(team.id) ? 'border-primary-600 bg-primary-50' : 'border-border hover:bg-secondary/50',
                  )}
                >
                  <Checkbox checked={teamIds.includes(team.id)} onChange={() => toggleTeam(team.id)} />
                  <TeamLogo name={team.name} logoUrl={team.logo_url} className="h-9 w-9 text-xs" />
                  <span className="font-semibold text-primary-900">{team.name}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2 sm:max-w-md">
              <p className="text-sm font-semibold text-primary-900">How should rosters be decided?</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(
                  [
                    { value: 'MANUAL', label: 'Assign Manually', desc: 'Pick every player now, like today.' },
                    { value: 'AUCTION', label: 'Decide via Auction', desc: 'Skip this step — run an AI auction after creating the season.' },
                  ] as const
                ).map((opt) => (
                  <label
                    key={opt.value}
                    className={cn(
                      'flex cursor-pointer flex-col gap-1 rounded-lg border p-3',
                      rosterMode === opt.value ? 'border-primary-600 bg-primary-50' : 'border-border hover:bg-secondary/50',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="roster-mode"
                        checked={rosterMode === opt.value}
                        onChange={() => setRosterMode(opt.value)}
                      />
                      <span className="font-semibold text-primary-900">{opt.label}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{opt.desc}</span>
                  </label>
                ))}
              </div>
            </div>

            {rosterMode === 'AUCTION' ? (
              <div className="grid grid-cols-1 gap-4 sm:max-w-md sm:grid-cols-2">
                <FormField label="Max Retentions per Team" htmlFor="max-retentions">
                  <Input
                    id="max-retentions"
                    type="number"
                    min={0}
                    value={maxRetentionsPerTeam}
                    onChange={(e) => setMaxRetentionsPerTeam(Number(e.target.value))}
                  />
                </FormField>
                <FormField label="Retention Price Increase %" htmlFor="retention-pct">
                  <Input
                    id="retention-pct"
                    type="number"
                    min={0}
                    value={retentionPriceIncreasePct}
                    onChange={(e) => setRetentionPriceIncreasePct(Number(e.target.value))}
                  />
                </FormField>
                <p className="col-span-2 text-sm text-muted-foreground">
                  Team owners will be able to submit retention picks as soon as this season is created. You'll
                  configure purses and start the auction from the season page afterward.
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Assign each active player to exactly one team. Players not selected will not appear in this season.
                </p>
                {selectedTeams.map((team) => (
              <div key={team.id} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <TeamLogo name={team.name} logoUrl={team.logo_url} className="h-7 w-7 text-[10px]" />
                  <h3 className="font-display font-bold text-primary-900">{team.name}</h3>
                  <Badge variant="outline">{Object.values(roster).filter((t) => t === team.id).length} players</Badge>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {(players ?? []).map((player) => {
                    const assignedTo = roster[player.id]
                    const assignedElsewhere = assignedTo && assignedTo !== team.id ? assignedTo : null
                    return (
                      <label
                        key={player.id}
                        className={cn(
                          'flex items-center gap-2 rounded-md border p-2 text-sm',
                          assignedElsewhere ? 'cursor-not-allowed border-border bg-secondary/40 opacity-60' : 'cursor-pointer border-border hover:bg-secondary/50',
                          assignedTo === team.id && 'border-primary-600 bg-primary-50',
                        )}
                      >
                        <Checkbox
                          checked={assignedTo === team.id}
                          disabled={!!assignedElsewhere}
                          onChange={() => togglePlayer(player.id, team.id)}
                        />
                        <PlayerAvatar name={player.name} imageUrl={player.image_url} className="h-7 w-7 text-[10px]" />
                        <span className="truncate font-medium text-primary-900">{player.name}</span>
                        {assignedElsewhere ? (
                          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                            in {teamById.get(assignedElsewhere)?.short_name}
                          </span>
                        ) : null}
                      </label>
                    )
                  })}
                </div>
              </div>
                ))}
              </>
            )}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="grid grid-cols-1 gap-4 sm:max-w-lg sm:grid-cols-2">
            <FormField label="Matches per Opponent" htmlFor="r-mpo">
              <Input
                id="r-mpo"
                type="number"
                min={1}
                value={matchesPerOpponent}
                onChange={(e) => setMatchesPerOpponent(Number(e.target.value))}
              />
            </FormField>
            <FormField label="Winning Points" htmlFor="r-win">
              <Input id="r-win" type="number" min={0} value={winningPoints} onChange={(e) => setWinningPoints(Number(e.target.value))} />
            </FormField>
            <FormField label="Playoff Teams" htmlFor="r-playoff">
              <Input
                id="r-playoff"
                type="number"
                min={0}
                value={playoffTeamCount}
                onChange={(e) => setPlayoffTeamCount(Number(e.target.value))}
              />
            </FormField>
            <label className="col-span-2 flex items-center gap-2">
              <Checkbox checked={closeLossEnabled} onChange={() => setCloseLossEnabled((v) => !v)} />
              <span className="text-sm font-medium">Enable close-loss points</span>
            </label>
            {closeLossEnabled ? (
              <>
                <FormField label="Close-Loss Points" htmlFor="r-clp">
                  <Input
                    id="r-clp"
                    type="number"
                    min={0}
                    value={closeLossPoints}
                    onChange={(e) => setCloseLossPoints(Number(e.target.value))}
                  />
                </FormField>
                <FormField label="Max Score Difference" htmlFor="r-cld">
                  <Input
                    id="r-cld"
                    type="number"
                    min={0}
                    value={closeLossMaxDifference}
                    onChange={(e) => setCloseLossMaxDifference(Number(e.target.value))}
                  />
                </FormField>
              </>
            ) : null}
          </div>
        ) : null}

        {step === 4 ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {schedule.length} matches generated ({expectedMatchCount(teamIds.length, matchesPerOpponent)} expected). Adjust
                dates/times as needed.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={regenerateSchedule}>
                Regenerate
              </Button>
            </div>
            <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
              {schedule.map((m, i) => (
                <div key={i} className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
                  <span className="w-6 text-xs font-bold text-muted-foreground">#{i + 1}</span>
                  <TeamPill team={teamById.get(m.team_a_id)} />
                  <span className="text-xs text-muted-foreground">vs</span>
                  <TeamPill team={teamById.get(m.team_b_id)} />
                  <Input
                    type="datetime-local"
                    value={m.scheduled_at}
                    className="ml-auto w-auto"
                    onChange={(e) => {
                      const value = e.target.value
                      setSchedule((prev) => prev.map((row, idx) => (idx === i ? { ...row, scheduled_at: value } : row)))
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <SummaryTile label="Season" value={`${name} (#${seasonNumber})`} />
              <SummaryTile label="Teams" value={String(teamIds.length)} />
              <SummaryTile label="Players Assigned" value={String(Object.keys(roster).length)} />
              <SummaryTile label="Matches Generated" value={String(schedule.length)} />
              <SummaryTile label="Winning Points" value={String(winningPoints)} />
              <SummaryTile
                label="Close-Loss"
                value={closeLossEnabled ? `${closeLossPoints} pt (≤${closeLossMaxDifference})` : 'Disabled'}
              />
              <SummaryTile label="Playoff Teams" value={String(playoffTeamCount)} />
            </div>

            <div>
              <h3 className="mb-2 font-display font-bold text-primary-900">Teams</h3>
              <div className="flex flex-wrap gap-2">
                {selectedTeams.map((t) => (
                  <Badge key={t.id} variant="outline">
                    {t.name}
                  </Badge>
                ))}
              </div>
            </div>

            {submitError ? <p className="text-sm font-medium text-destructive">{submitError}</p> : null}

            <Button size="lg" onClick={handleCreate} disabled={submitting} className="self-start">
              <Trophy className="h-4 w-4" /> {submitting ? 'Creating Season…' : 'Create Season'}
            </Button>
          </div>
        ) : null}
      </Card>

      {step < 5 ? (
        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          <Button onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} disabled={!canProceed()}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex justify-start">
          <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
        </div>
      )}
    </div>
  )
}

function TeamPill({ team }: { team?: Team }) {
  if (!team) return null
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-primary-900">
      <TeamLogo name={team.name} logoUrl={team.logo_url} className="h-4 w-4 text-[8px]" />
      {team.short_name}
    </span>
  )
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary/50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-display font-bold text-primary-900">{value}</p>
    </div>
  )
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
