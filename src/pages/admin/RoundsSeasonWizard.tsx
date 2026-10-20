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
import { LoadingState } from '@/components/shared/LoadingState'
import { LineupTeamCard, type PickablePlayer } from '@/components/rounds/LineupTeamCard'
import { useAsync } from '@/hooks/useAsync'
import { listTeams } from '@/services/teams'
import { listPlayers } from '@/services/players'
import { createRoundsSeason, listSeasons } from '@/services/seasons'
import { listTournamentTeamIds } from '@/services/tournaments'
import { cn } from '@/lib/utils'
import type { Tournament } from '@/types'

const STEPS = ['Basics', 'Teams', 'Players', 'Confirm']

/** Season creation for round-based tournaments: basics, teams, manual player picks, confirm. */
export default function RoundsSeasonWizard({ tournament }: { tournament: Tournament }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)

  const { data: teams, loading: teamsLoading } = useAsync(async () => {
    const [allTeams, eligibleIds] = await Promise.all([listTeams(), listTournamentTeamIds(tournament.id)])
    return allTeams.filter((t) => eligibleIds.includes(t.id))
  }, [tournament.id])
  const { data: players, loading: playersLoading } = useAsync(() => listPlayers(), [])
  const { data: existingSeasons } = useAsync(() => listSeasons(tournament.id), [tournament.id])

  const [name, setName] = useState('')
  const [seasonNumber, setSeasonNumber] = useState(1)
  const [seasonNumberTouched, setSeasonNumberTouched] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [teamIds, setTeamIds] = useState<string[]>([])
  const [playersPerTeam, setPlayersPerTeam] = useState(4)
  // playerId -> teamId
  const [roster, setRoster] = useState<Record<string, string>>({})

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (seasonNumberTouched || !existingSeasons) return
    const next = Math.max(0, ...existingSeasons.map((s) => s.season_number)) + 1
    setSeasonNumber(next)
    setName((prev) => prev || `${tournament.short_name} Season ${next}`)
  }, [existingSeasons, seasonNumberTouched, tournament.short_name])

  const selectedTeams = useMemo(() => (teams ?? []).filter((t) => teamIds.includes(t.id)), [teams, teamIds])
  const teamById = useMemo(() => new Map((teams ?? []).map((t) => [t.id, t])), [teams])

  const candidates: PickablePlayer[] = useMemo(
    () =>
      (players ?? []).map((player) => ({
        player,
        assignedTo: roster[player.id] ? teamById.get(roster[player.id])?.short_name ?? null : null,
      })),
    [players, roster, teamById],
  )

  function toggleTeam(teamId: string) {
    const removing = teamIds.includes(teamId)
    setTeamIds((prev) => (removing ? prev.filter((id) => id !== teamId) : [...prev, teamId]))
    if (removing) {
      setRoster((prev) => Object.fromEntries(Object.entries(prev).filter(([, t]) => t !== teamId)))
    }
  }

  const playersOf = (teamId: string) => (players ?? []).filter((p) => roster[p.id] === teamId)
  const allTeamsFull = selectedTeams.length > 0 && selectedTeams.every((t) => playersOf(t.id).length === playersPerTeam)

  function canProceed(): boolean {
    switch (step) {
      case 0:
        return name.trim().length > 0 && seasonNumber > 0
      case 1:
        return teamIds.length >= 2
      case 2:
        return playersPerTeam > 0 && allTeamsFull
      default:
        return true
    }
  }

  async function handleCreate() {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const seasonId = await createRoundsSeason({
        tournament_id: tournament.id,
        name: name.trim(),
        season_number: seasonNumber,
        start_date: startDate || null,
        end_date: endDate || null,
        players_per_team: playersPerTeam,
        team_ids: teamIds,
        rosters: Object.entries(roster)
          .filter(([, teamId]) => teamIds.includes(teamId))
          .map(([player_id, team_id]) => ({ player_id, team_id })),
      })
      navigate(`/admin/seasons/${seasonId}`)
    } catch (err) {
      console.error(err)
      setSubmitError(err instanceof Error ? err.message : 'Unable to create season.')
    } finally {
      setSubmitting(false)
    }
  }

  if (teamsLoading || playersLoading) return <LoadingState rows={6} />

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-primary-900">Create Season</h1>
        <p className="text-sm text-muted-foreground">Set up a new {tournament.name} season.</p>
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
            <FormField label="Season Name" htmlFor="rs-name">
              <Input id="rs-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Bluelock Season 1" />
            </FormField>
            <FormField label="Season Number" htmlFor="rs-number">
              <Input
                id="rs-number"
                type="number"
                min={1}
                value={seasonNumber}
                onChange={(e) => {
                  setSeasonNumberTouched(true)
                  setSeasonNumber(Number(e.target.value))
                }}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Start Date" htmlFor="rs-start">
                <Input id="rs-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </FormField>
              <FormField label="End Date" htmlFor="rs-end">
                <Input id="rs-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </FormField>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Select at least two teams. Only teams registered for {tournament.name} are listed — set eligibility on the
              Teams page.
            </p>
            {(teams ?? []).length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                No teams are registered for {tournament.name} yet. Edit a team on the Teams page and tick this
                tournament under Eligible tournaments.
              </p>
            ) : (
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
            )}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-end gap-4">
              <FormField label="Players per Team" htmlFor="rs-ppt">
                <Input
                  id="rs-ppt"
                  type="number"
                  min={1}
                  className="w-32"
                  value={playersPerTeam}
                  onChange={(e) => setPlayersPerTeam(Math.max(1, Number(e.target.value) || 1))}
                />
              </FormField>
              <p className="pb-2 text-sm text-muted-foreground">
                Pick exactly {playersPerTeam} players for each team. These are the default lineups for Round 1 — you
                can change them in every round later.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {selectedTeams.map((team) => (
                <LineupTeamCard
                  key={team.id}
                  team={team}
                  players={playersOf(team.id)}
                  required={playersPerTeam}
                  candidates={candidates.filter((c) => roster[c.player.id] !== team.id)}
                  onAdd={(player) => setRoster((prev) => ({ ...prev, [player.id]: team.id }))}
                  onRemove={(playerId) =>
                    setRoster((prev) => {
                      const next = { ...prev }
                      delete next[playerId]
                      return next
                    })
                  }
                />
              ))}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryTile label="Season" value={`${name} (#${seasonNumber})`} />
              <SummaryTile label="Teams" value={String(teamIds.length)} />
              <SummaryTile label="Players per Team" value={String(playersPerTeam)} />
              <SummaryTile label="Players Picked" value={String(Object.keys(roster).length)} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {selectedTeams.map((team) => (
                <LineupTeamCard key={team.id} team={team} players={playersOf(team.id)} required={playersPerTeam} readOnly />
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              Creating the season also creates <Badge variant="outline">Round 1</Badge> with every team and these lineups.
            </p>

            {submitError ? <p className="text-sm font-medium text-destructive">{submitError}</p> : null}

            <Button size="lg" onClick={handleCreate} disabled={submitting} className="self-start">
              <Trophy className="h-4 w-4" /> {submitting ? 'Creating Season…' : 'Create Season'}
            </Button>
          </div>
        ) : null}
      </Card>

      {step < STEPS.length - 1 ? (
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

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary/50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-display font-bold text-primary-900">{value}</p>
    </div>
  )
}
