import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertCircle,
  ChevronLeft,
  ClipboardEdit,
  Crown,
  Pencil,
  Plus,
  Swords,
  Trash2,
  UserMinus,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FormField } from '@/components/shared/FormField'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PlayerAvatar, TeamLogo } from '@/components/shared/Avatar'
import { SeasonDescriptionCard } from '@/components/admin/SeasonDescriptionCard'
import { LineupTeamCard, type PickablePlayer } from '@/components/rounds/LineupTeamCard'
import { useAsync } from '@/hooks/useAsync'
import { deleteSeason, getSeason, getSeasonTeams, setSeasonMvp } from '@/services/seasons'
import { getTournament } from '@/services/tournaments'
import { listPlayers } from '@/services/players'
import { createMatch, deleteMatch, listMatches } from '@/services/matches'
import {
  createSeasonRound,
  deleteSeasonRound,
  listSeasonRounds,
  setRoundLineup,
  updateSeasonRound,
  type RoundWithLineups,
} from '@/services/rounds'
import { cn, formatDateTime } from '@/lib/utils'
import { MATCH_TYPES, MATCH_TYPE_LABELS, type MatchType, type MatchWithTeams, type Player, type Team } from '@/types'

const ROUND_MATCH_TYPES = MATCH_TYPES.filter((t) => t !== 'REGULAR_SEASON')

/** Admin page for a round-based (Bluelock) season. */
export default function RoundsSeasonDetail({ seasonId }: { seasonId: string }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const { data, error, reload } = useAsync(async () => {
    const season = await getSeason(seasonId)
    if (!season) return null
    const [tournament, teams, rounds, matches, players] = await Promise.all([
      getTournament(season.tournament_id),
      getSeasonTeams(seasonId),
      listSeasonRounds(seasonId),
      listMatches({ seasonId }),
      listPlayers(),
    ])
    return { season, tournament, teams, rounds, matches, players }
  }, [seasonId])

  const [createRoundOpen, setCreateRoundOpen] = useState(false)
  const [editRoundOpen, setEditRoundOpen] = useState(false)
  const [deleteRoundOpen, setDeleteRoundOpen] = useState(false)
  const [deletingRound, setDeletingRound] = useState(false)
  const [deleteSeasonOpen, setDeleteSeasonOpen] = useState(false)
  const [deletingSeason, setDeletingSeason] = useState(false)
  const [deleteMatchTarget, setDeleteMatchTarget] = useState<MatchWithTeams | null>(null)
  const [deletingMatch, setDeletingMatch] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [savingLineup, setSavingLineup] = useState<string | null>(null)

  const teamById = useMemo(() => new Map((data?.teams ?? []).map((t) => [t.id, t] as [string, Team])), [data?.teams])

  if (!data && !error) return <LoadingState rows={6} />
  if (error || !data) return <ErrorState message="Season not found." />

  const { season, tournament, teams, rounds, matches, players } = data
  const selectedRoundId = searchParams.get('round')
  const roundIndex = Math.max(
    0,
    rounds.findIndex((r) => r.id === selectedRoundId) >= 0
      ? rounds.findIndex((r) => r.id === selectedRoundId)
      : rounds.length - 1,
  )
  const round: RoundWithLineups | undefined = rounds[roundIndex]
  const nextRound = rounds[roundIndex + 1]
  const isLatestRound = roundIndex === rounds.length - 1
  const roundMatches = round ? matches.filter((m) => m.round_id === round.id) : []
  const championTeam = teams.find((t) => t.id === season.champion_team_id)

  const eliminatedHere = round && nextRound ? round.teamIds.filter((id) => !nextRound.teamIds.includes(id)) : []
  const outEarlier = round ? teams.filter((t) => !round.teamIds.includes(t.id)) : []

  // Everyone who has been in any lineup this season — the season MVP options.
  const seasonPlayers = new Map<string, Player>()
  for (const r of rounds) for (const list of Object.values(r.lineups)) for (const p of list) seasonPlayers.set(p.id, p)

  function selectRound(id: string) {
    setActionError(null)
    setSearchParams({ round: id }, { replace: true })
  }

  async function changeLineup(teamId: string, playerIds: string[]) {
    if (!round) return
    setActionError(null)
    setSavingLineup(teamId)
    try {
      await setRoundLineup(round.id, teamId, playerIds)
      reload()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to update the lineup.')
    } finally {
      setSavingLineup(null)
    }
  }

  async function handleDeleteRound() {
    if (!round) return
    setDeletingRound(true)
    try {
      await deleteSeasonRound(round.id)
      setDeleteRoundOpen(false)
      setSearchParams({}, { replace: true })
      reload()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to delete the round.')
    } finally {
      setDeletingRound(false)
    }
  }

  async function handleDeleteMatch() {
    if (!deleteMatchTarget) return
    setDeletingMatch(true)
    try {
      await deleteMatch(deleteMatchTarget.id)
      setDeleteMatchTarget(null)
      reload()
    } finally {
      setDeletingMatch(false)
    }
  }

  async function handleDeleteSeason() {
    setDeletingSeason(true)
    try {
      await deleteSeason(seasonId)
      navigate(tournament ? `/admin/tournaments/${tournament.slug}` : '/admin/tournaments')
    } finally {
      setDeletingSeason(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {tournament ? (
            <Link
              to={`/admin/tournaments/${tournament.slug}`}
              className="mb-1 flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-primary-900"
            >
              <ChevronLeft className="h-4 w-4" /> {tournament.name}
            </Link>
          ) : null}
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-bold text-primary-900">{season.name}</h1>
            <Badge variant={season.status === 'ACTIVE' ? 'success' : 'outline'}>{season.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {teams.length} teams · {rounds.length} rounds · {matches.length} matches
            {season.players_per_team ? ` · ${season.players_per_team} players per team at start` : ''}
          </p>
        </div>
        <Button variant="destructive" onClick={() => setDeleteSeasonOpen(true)}>
          <Trash2 className="h-4 w-4" /> Delete Season
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-accent-500" /> Champion
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-lg font-bold text-primary-900">{championTeam?.name ?? 'Not decided yet'}</p>
            <p className="text-xs text-muted-foreground">
              Set automatically when a match of type Final is completed with a decisive score.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Season MVP</CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={season.mvp_player_id ?? 'NONE'}
              onValueChange={(v) => setSeasonMvp(seasonId, v === 'NONE' ? null : v).then(reload)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select MVP" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Not selected</SelectItem>
                {[...seasonPlayers.values()]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <SeasonDescriptionCard seasonId={seasonId} description={season.description} onSaved={reload} />
      </div>

      {/* Round tabs */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {rounds.map((r, i) => (
            <button
              key={r.id}
              type="button"
              onClick={() => selectRound(r.id)}
              className={cn(
                'flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
                i === roundIndex
                  ? 'border-primary-700 bg-primary-700 text-white'
                  : 'border-border bg-white text-primary-900 hover:bg-secondary',
              )}
            >
              {r.name}
              <span
                className={cn(
                  'rounded-full px-1.5 text-[10px]',
                  i === roundIndex ? 'bg-white/20 text-white' : 'bg-secondary text-muted-foreground',
                )}
              >
                {r.teamIds.length} teams
              </span>
            </button>
          ))}
          <Button variant="outline" size="sm" onClick={() => setCreateRoundOpen(true)} className="rounded-full">
            <Plus className="h-4 w-4" /> Create Round
          </Button>
        </div>

        {actionError ? (
          <p className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm font-medium text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" /> {actionError}
          </p>
        ) : null}

        {!round ? (
          <Card className="p-6 text-sm text-muted-foreground">No rounds yet. Create Round 1 to get started.</Card>
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-xl">{round.name}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {round.teamIds.length} teams · {roundMatches.length} matches
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditRoundOpen(true)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit Round
                  </Button>
                  {isLatestRound ? (
                    <Button size="sm" variant="destructive" onClick={() => setDeleteRoundOpen(true)}>
                      <Trash2 className="h-3.5 w-3.5" /> Delete Round
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              {eliminatedHere.length > 0 || outEarlier.length > 0 ? (
                <CardContent className="flex flex-col gap-2 text-sm">
                  {eliminatedHere.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1 font-semibold text-destructive">
                        <UserMinus className="h-4 w-4" /> Eliminated after this round:
                      </span>
                      {eliminatedHere.map((id) => (
                        <Badge key={id} variant="destructive">
                          {teamById.get(id)?.name}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {outEarlier.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-muted-foreground">Not in this round:</span>
                      {outEarlier.map((t) => (
                        <Badge key={t.id} variant="outline" className="opacity-70">
                          {t.name}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              ) : null}
            </Card>

            <section className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary-700" />
                <h2 className="font-display text-xl font-bold text-primary-900">Lineups</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Changes apply to this round's matches that aren't completed yet. Saved stats of completed matches are
                kept. Picking a player who is on another team moves them.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {round.teamIds.map((teamId) => {
                  const team = teamById.get(teamId)
                  if (!team) return null
                  const lineup = round.lineups[teamId] ?? []
                  const candidates: PickablePlayer[] = players
                    .filter((p) => !lineup.some((l) => l.id === p.id))
                    .map((player) => {
                      const otherTeamId = round.teamIds.find(
                        (id) => id !== teamId && (round.lineups[id] ?? []).some((l) => l.id === player.id),
                      )
                      return { player, assignedTo: otherTeamId ? teamById.get(otherTeamId)?.short_name : null }
                    })
                  return (
                    <LineupTeamCard
                      key={teamId}
                      team={team}
                      players={lineup}
                      candidates={candidates}
                      onAdd={(player) => changeLineup(teamId, [...lineup.map((p) => p.id), player.id])}
                      onRemove={(playerId) =>
                        changeLineup(
                          teamId,
                          lineup.map((p) => p.id).filter((id) => id !== playerId),
                        )
                      }
                      footer={
                        savingLineup === teamId ? <p className="text-xs text-muted-foreground">Saving…</p> : null
                      }
                    />
                  )
                })}
              </div>
            </section>

            <section className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Swords className="h-5 w-5 text-primary-700" />
                <h2 className="font-display text-xl font-bold text-primary-900">Matches</h2>
              </div>
              <RoundMatchBuilder
                key={round.id}
                round={round}
                teamById={teamById}
                roundMatches={roundMatches}
                seasonId={seasonId}
                onCreated={reload}
              />
              <RoundMatchList
                matches={roundMatches}
                round={round}
                onDelete={setDeleteMatchTarget}
              />
            </section>
          </>
        )}
      </div>

      <RoundDialog
        mode="create"
        open={createRoundOpen}
        onOpenChange={setCreateRoundOpen}
        teams={teams}
        defaultName={`Round ${rounds.length + 1}`}
        defaultTeamIds={rounds.at(-1)?.teamIds ?? teams.map((t) => t.id)}
        lastRound={rounds.at(-1)}
        lastRoundMatches={rounds.at(-1) ? matches.filter((m) => m.round_id === rounds.at(-1)!.id) : []}
        onSubmit={async (name, teamIds) => {
          const id = await createSeasonRound(seasonId, name, teamIds)
          setSearchParams({ round: id }, { replace: true })
          reload()
        }}
      />

      {round ? (
        <RoundDialog
          key={`edit-${round.id}-${editRoundOpen}`}
          mode="edit"
          open={editRoundOpen}
          onOpenChange={setEditRoundOpen}
          teams={teams}
          defaultName={round.name}
          defaultTeamIds={round.teamIds}
          lastRound={rounds[roundIndex - 1]}
          lastRoundMatches={rounds[roundIndex - 1] ? matches.filter((m) => m.round_id === rounds[roundIndex - 1].id) : []}
          onSubmit={async (name, teamIds) => {
            await updateSeasonRound(round.id, name, teamIds)
            reload()
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deleteRoundOpen}
        onOpenChange={setDeleteRoundOpen}
        title={`Delete ${round?.name ?? 'Round'}`}
        description="This deletes the round, its lineups, and all of its matches and match statistics. This cannot be undone."
        confirmLabel="Delete Round"
        loading={deletingRound}
        onConfirm={handleDeleteRound}
      />

      <ConfirmDialog
        open={!!deleteMatchTarget}
        onOpenChange={(open) => !open && setDeleteMatchTarget(null)}
        title="Delete Match"
        description="This permanently deletes the match and all of its player statistics. If this was the Final, the season champion will be cleared."
        confirmLabel="Delete Match"
        loading={deletingMatch}
        onConfirm={handleDeleteMatch}
      />

      <ConfirmDialog
        open={deleteSeasonOpen}
        onOpenChange={setDeleteSeasonOpen}
        title="Delete Season"
        description="This permanently deletes this season and everything tied to it — rounds, lineups, all matches and stats. This cannot be undone."
        confirmLabel="Delete Season"
        loading={deletingSeason}
        onConfirm={handleDeleteSeason}
      />
    </div>
  )
}

/** Pick two teams (seeing their lineups), set time and type, add the match to the round. */
function RoundMatchBuilder({
  round,
  teamById,
  roundMatches,
  seasonId,
  onCreated,
}: {
  round: RoundWithLineups
  teamById: Map<string, Team>
  roundMatches: MatchWithTeams[]
  seasonId: string
  onCreated: () => void
}) {
  const isFinalRound = round.teamIds.length === 2
  const [teamA, setTeamA] = useState<string | null>(isFinalRound ? round.teamIds[0] : null)
  const [teamB, setTeamB] = useState<string | null>(isFinalRound ? round.teamIds[1] : null)
  const [scheduledAt, setScheduledAt] = useState('')
  const [matchType, setMatchType] = useState<MatchType>(isFinalRound ? 'FINAL' : 'ELIMINATOR')
  const [stageLabel, setStageLabel] = useState(round.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const matchCount = (teamId: string) => roundMatches.filter((m) => m.team_a_id === teamId || m.team_b_id === teamId).length

  function toggle(teamId: string) {
    setError(null)
    if (teamA === teamId) return setTeamA(null)
    if (teamB === teamId) return setTeamB(null)
    if (!teamA) return setTeamA(teamId)
    if (!teamB) return setTeamB(teamId)
    setTeamB(teamId)
  }

  async function handleCreate() {
    if (!teamA || !teamB) return
    setSaving(true)
    setError(null)
    try {
      await createMatch({
        season_id: seasonId,
        round_id: round.id,
        team_a_id: teamA,
        team_b_id: teamB,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        match_type: matchType,
        stage_label: stageLabel.trim() || null,
      })
      if (!isFinalRound) {
        setTeamA(null)
        setTeamB(null)
      }
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create the match.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Match</CardTitle>
        <p className="text-sm text-muted-foreground">Click two teams to pair them. Each card shows the team's lineup for this round.</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {round.teamIds.map((teamId) => {
            const team = teamById.get(teamId)
            if (!team) return null
            const side = teamA === teamId ? 'A' : teamB === teamId ? 'B' : null
            const count = matchCount(teamId)
            const lineup = round.lineups[teamId] ?? []
            return (
              <button
                key={teamId}
                type="button"
                onClick={() => toggle(teamId)}
                className={cn(
                  'flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors',
                  side ? 'border-primary-600 bg-primary-50 ring-2 ring-primary-200' : 'border-border bg-white hover:bg-secondary/50',
                )}
              >
                <div className="flex items-center gap-2">
                  <TeamLogo name={team.name} logoUrl={team.logo_url} className="h-7 w-7 text-[10px]" />
                  <span className="min-w-0 flex-1 truncate font-display font-bold text-primary-900">{team.short_name}</span>
                  {side ? <Badge variant="solid">Team {side}</Badge> : null}
                </div>
                <div className="flex flex-wrap gap-1">
                  {lineup.length === 0 ? (
                    <span className="text-xs text-muted-foreground">No players</span>
                  ) : (
                    lineup.map((p) => (
                      <span key={p.id} className="rounded bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-primary-900">
                        {p.name}
                      </span>
                    ))
                  )}
                </div>
                {count > 0 ? (
                  <span className="text-[11px] font-semibold text-accent-700">
                    {count} match{count === 1 ? '' : 'es'} in this round
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>

        {teamA || teamB ? (
          <div className="grid grid-cols-1 items-start gap-4 rounded-lg border border-border bg-secondary/30 p-4 md:grid-cols-[1fr_auto_1fr]">
            <SidePreview team={teamA ? teamById.get(teamA) : undefined} players={teamA ? round.lineups[teamA] ?? [] : []} label="Team A" />
            <span className="self-center text-center font-display text-xl font-extrabold text-primary-400">VS</span>
            <SidePreview team={teamB ? teamById.get(teamB) : undefined} players={teamB ? round.lineups[teamB] ?? [] : []} label="Team B" />
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField label="Date & Time" htmlFor="rm-date">
            <Input id="rm-date" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </FormField>
          <FormField label="Match Type" htmlFor="rm-type" hint="Use Final for the deciding match — it crowns the champion.">
            <Select value={matchType} onValueChange={(v) => setMatchType(v as MatchType)}>
              <SelectTrigger id="rm-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROUND_MATCH_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {MATCH_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Stage Label" htmlFor="rm-stage">
            <Input id="rm-stage" value={stageLabel} onChange={(e) => setStageLabel(e.target.value)} />
          </FormField>
        </div>

        {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}

        <Button onClick={handleCreate} disabled={!teamA || !teamB || saving} className="self-start">
          <Plus className="h-4 w-4" /> {saving ? 'Adding…' : 'Add Match'}
        </Button>
      </CardContent>
    </Card>
  )
}

function SidePreview({ team, players, label }: { team?: Team; players: Player[]; label: string }) {
  if (!team) {
    return (
      <div className="flex min-h-[80px] items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
        Pick {label}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <TeamLogo name={team.name} logoUrl={team.logo_url} className="h-8 w-8 text-[10px]" />
        <p className="font-display font-bold text-primary-900">{team.name}</p>
      </div>
      <ul className="flex flex-col gap-1">
        {players.map((p) => (
          <li key={p.id} className="flex items-center gap-2 text-sm">
            <PlayerAvatar name={p.name} imageUrl={p.image_url} className="h-6 w-6 text-[9px]" />
            <span className="font-medium text-primary-900">{p.name}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function RoundMatchList({
  matches,
  round,
  onDelete,
}: {
  matches: MatchWithTeams[]
  round: RoundWithLineups
  onDelete: (match: MatchWithTeams) => void
}) {
  if (matches.length === 0) {
    return <p className="text-sm text-muted-foreground">No matches in {round.name} yet.</p>
  }
  const sorted = [...matches].sort(
    (a, b) => new Date(a.scheduled_at ?? 0).getTime() - new Date(b.scheduled_at ?? 0).getTime(),
  )
  return (
    <div className="flex flex-col gap-3">
      {sorted.map((m) => (
        <Card key={m.id} className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{formatDateTime(m.scheduled_at)}</span>
            <div className="flex flex-wrap items-center gap-2">
              {m.stage_label ? <Badge variant="outline">{m.stage_label}</Badge> : null}
              <Badge variant="accent">{MATCH_TYPE_LABELS[m.match_type]}</Badge>
              <StatusBadge status={m.status} />
            </div>
          </div>
          <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-[1fr_auto_1fr]">
            <MatchSide team={m.team_a} players={round.lineups[m.team_a_id] ?? []} />
            <div className="self-center text-center font-display text-lg font-extrabold text-primary-800">
              {m.status === 'COMPLETED' ? `${m.team_a_score} – ${m.team_b_score}` : 'VS'}
            </div>
            <MatchSide team={m.team_b} players={round.lineups[m.team_b_id] ?? []} align="right" />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button asChild size="sm" variant="secondary">
              <Link to={`/admin/matches/${m.id}`}>
                <ClipboardEdit className="h-3.5 w-3.5" /> {m.status === 'COMPLETED' ? 'Edit Scores' : 'Enter Scores'}
              </Link>
            </Button>
            <Button size="sm" variant="destructive" onClick={() => onDelete(m)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </Card>
      ))}
    </div>
  )
}

function MatchSide({ team, players, align = 'left' }: { team: Team; players: Player[]; align?: 'left' | 'right' }) {
  return (
    <div className={cn('flex flex-col gap-1.5', align === 'right' && 'md:items-end md:text-right')}>
      <div className={cn('flex items-center gap-2', align === 'right' && 'md:flex-row-reverse')}>
        <TeamLogo name={team.name} logoUrl={team.logo_url} className="h-7 w-7 text-[10px]" />
        <span className="font-display font-bold text-primary-900">{team.name}</span>
      </div>
      <div className={cn('flex flex-wrap gap-1', align === 'right' && 'md:justify-end')}>
        {players.map((p) => (
          <span key={p.id} className="rounded bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-primary-900">
            {p.name}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Create the next round, or edit a round: its name and which teams are in it. */
function RoundDialog({
  mode,
  open,
  onOpenChange,
  teams,
  defaultName,
  defaultTeamIds,
  lastRound,
  lastRoundMatches,
  onSubmit,
}: {
  mode: 'create' | 'edit'
  open: boolean
  onOpenChange: (open: boolean) => void
  teams: Team[]
  defaultName: string
  defaultTeamIds: string[]
  lastRound?: RoundWithLineups
  lastRoundMatches: MatchWithTeams[]
  onSubmit: (name: string, teamIds: string[]) => Promise<void>
}) {
  const [name, setName] = useState(defaultName)
  const [teamIds, setTeamIds] = useState<string[]>(defaultTeamIds)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openedWith, setOpenedWith] = useState(false)

  // Reset the form each time the dialog opens.
  if (open && !openedWith) {
    setOpenedWith(true)
    setName(defaultName)
    setTeamIds(defaultTeamIds)
    setError(null)
  }
  if (!open && openedWith) setOpenedWith(false)

  // Previous round's record per team, to help pick who goes through.
  const record = (teamId: string) => {
    let w = 0
    let l = 0
    for (const m of lastRoundMatches) {
      if (m.status !== 'COMPLETED' || m.team_a_score == null || m.team_b_score == null) continue
      if (m.team_a_id !== teamId && m.team_b_id !== teamId) continue
      const mine = m.team_a_id === teamId ? m.team_a_score : m.team_b_score
      const theirs = m.team_a_id === teamId ? m.team_b_score : m.team_a_score
      if (mine > theirs) w++
      else if (mine < theirs) l++
    }
    return { w, l }
  }

  const listed = mode === 'create' && lastRound ? teams.filter((t) => lastRound.teamIds.includes(t.id)) : teams
  const others = mode === 'create' && lastRound ? teams.filter((t) => !lastRound.teamIds.includes(t.id)) : []

  async function handleSubmit() {
    if (teamIds.length < 2) {
      setError('A round needs at least two teams.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit(name.trim(), teamIds)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save the round.')
    } finally {
      setSaving(false)
    }
  }

  const toggle = (id: string) => setTeamIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const teamRow = (team: Team, faded = false) => {
    const { w, l } = record(team.id)
    const checked = teamIds.includes(team.id)
    return (
      <label
        key={team.id}
        className={cn(
          'flex cursor-pointer items-center gap-3 rounded-md border p-2.5',
          checked ? 'border-primary-600 bg-primary-50' : 'border-border hover:bg-secondary/50',
          faded && !checked && 'opacity-60',
        )}
      >
        <Checkbox checked={checked} onChange={() => toggle(team.id)} />
        <TeamLogo name={team.name} logoUrl={team.logo_url} className="h-7 w-7 text-[10px]" />
        <span className="flex-1 font-semibold text-primary-900">{team.name}</span>
        {lastRound && lastRound.teamIds.includes(team.id) && w + l > 0 ? (
          <span className="text-xs font-semibold text-muted-foreground">
            {lastRound.name}: {w}W – {l}L
          </span>
        ) : null}
        {!checked && lastRound?.teamIds.includes(team.id) && mode === 'create' ? (
          <Badge variant="destructive">Eliminated</Badge>
        ) : null}
      </label>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Create Round' : 'Edit Round'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <FormField label="Round Name" htmlFor="round-name">
            <Input id="round-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Round 2, Semi Final, Final…" />
          </FormField>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-primary-900">
              {mode === 'create' ? 'Teams going through' : 'Teams in this round'}
            </p>
            <p className="text-xs text-muted-foreground">
              {mode === 'create'
                ? 'Untick the teams that are eliminated. Each team starts with its lineup from the previous round.'
                : 'A team that already has a match in this round can’t be removed. Added teams get their previous lineup.'}
            </p>
            <div className="flex max-h-[340px] flex-col gap-2 overflow-y-auto pr-1">
              {listed.map((t) => teamRow(t))}
              {others.length > 0 ? (
                <>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Out earlier</p>
                  {others.map((t) => teamRow(t, true))}
                </>
              ) : null}
            </div>
          </div>
          {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : mode === 'create' ? `Create Round (${teamIds.length} teams)` : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
