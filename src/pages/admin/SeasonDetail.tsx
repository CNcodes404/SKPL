import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Trash2, Crown, Swords, Scale } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/shared/FormField'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { useAsync } from '@/hooks/useAsync'
import { getSeason, getSeasonTeams, getSeasonRoster, deleteSeasonSchedule, setSeasonMvp, updateSeason } from '@/services/seasons'
import { listMatchesRaw, createMatch } from '@/services/matches'
import { calculateStandings } from '@/utils/calculations'
import { cn } from '@/lib/utils'

export default function SeasonDetail() {
  const { seasonId = '' } = useParams()
  const { data, loading, error, reload } = useAsync(async () => {
    const [season, teams, roster, matches] = await Promise.all([
      getSeason(seasonId),
      getSeasonTeams(seasonId),
      getSeasonRoster(seasonId),
      listMatchesRaw(seasonId),
    ])
    return { season, teams, roster, matches }
  }, [seasonId])

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [tieBreakerOpen, setTieBreakerOpen] = useState(false)

  async function handleDeleteSchedule() {
    setDeleting(true)
    try {
      await deleteSeasonSchedule(seasonId)
      setDeleteOpen(false)
      reload()
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <LoadingState rows={6} />
  if (error || !data?.season) return <ErrorState message="Season not found." />

  const { season, teams, roster, matches } = data
  const standings = calculateStandings(teams, matches, season)
  const championTeam = teams.find((t) => t.id === season.champion_team_id)

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-bold text-primary-900">{season.name}</h1>
            <Badge variant={season.status === 'ACTIVE' ? 'success' : 'outline'}>{season.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {teams.length} teams · {matches.length} matches · {roster.length} players
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setTieBreakerOpen(true)}>
            <Scale className="h-4 w-4" /> Create Tie-Breaker
          </Button>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4" /> Delete Entire Schedule
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Standings</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {standings.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted-foreground">No regular-season results yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead className="text-center">MP</TableHead>
                    <TableHead className="text-center">W</TableHead>
                    <TableHead className="text-center">L</TableHead>
                    <TableHead className="text-center">+/-</TableHead>
                    <TableHead className="text-center">Pts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {standings.map((row, i) => (
                    <TableRow key={row.team.id}>
                      <TableCell className="font-bold">{i + 1}</TableCell>
                      <TableCell className="font-semibold">{row.team.name}</TableCell>
                      <TableCell className="text-center">{row.played}</TableCell>
                      <TableCell className="text-center">{row.wins}</TableCell>
                      <TableCell className="text-center">{row.losses}</TableCell>
                      <TableCell className={cn('text-center', row.scoreDiff >= 0 ? 'text-green-600' : 'text-red-600')}>
                        {row.scoreDiff > 0 ? '+' : ''}
                        {row.scoreDiff}
                      </TableCell>
                      <TableCell className="text-center font-bold">{row.points}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="h-4 w-4 text-accent-500" /> Champion
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-display text-lg font-bold text-primary-900">{championTeam?.name ?? 'Not decided yet'}</p>
              <p className="text-xs text-muted-foreground">
                Set automatically when a Final match is completed with a decisive score.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tournament MVP</CardTitle>
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
                  {roster.map((r) => (
                    <SelectItem key={r.player.id} value={r.player.id}>
                      {r.player.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <SeasonDescriptionCard seasonId={seasonId} description={season.description} onSaved={reload} />

          <Card>
            <CardHeader>
              <CardTitle>League Rules</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 text-sm">
              <RuleRow label="Winning Points" value={season.winning_points} />
              <RuleRow label="Matches / Opponent" value={season.matches_per_opponent} />
              <RuleRow label="Close-Loss" value={season.close_loss_enabled ? `${season.close_loss_points} pt` : 'Off'} />
              <RuleRow label="Max Diff" value={season.close_loss_max_difference} />
              <RuleRow label="Playoff Teams" value={season.playoff_team_count} />
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Entire Schedule"
        description="This deletes ALL matches and match statistics for this season. It does NOT delete the season, teams, players, or the season roster. This cannot be undone."
        confirmLabel="Delete Schedule"
        loading={deleting}
        onConfirm={handleDeleteSchedule}
      />

      <TieBreakerDialog
        open={tieBreakerOpen}
        onOpenChange={setTieBreakerOpen}
        seasonId={seasonId}
        teams={teams}
        onCreated={reload}
      />
    </div>
  )
}

function SeasonDescriptionCard({
  seasonId,
  description,
  onSaved,
}: {
  seasonId: string
  description: string | null
  onSaved: () => void
}) {
  const [text, setText] = useState(description ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      await updateSeason(seasonId, { description: text.trim() || null })
      setSaved(true)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>About This Season</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setSaved(false)
          }}
          placeholder="Optional intro shown on the public About page, e.g. how the season played out."
          className="min-h-[100px]"
        />
        <div className="flex items-center gap-3">
          <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Description'}
          </Button>
          {saved ? <span className="text-xs font-medium text-green-600">Saved</span> : null}
        </div>
      </CardContent>
    </Card>
  )
}

function RuleRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-bold text-primary-900">{value}</p>
    </div>
  )
}

function TieBreakerDialog({
  open,
  onOpenChange,
  seasonId,
  teams,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  seasonId: string
  teams: { id: string; name: string }[]
  onCreated: () => void
}) {
  const [teamA, setTeamA] = useState('')
  const [teamB, setTeamB] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleCreate() {
    if (!teamA || !teamB || teamA === teamB) {
      setError('Select two different teams.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createMatch({
        season_id: seasonId,
        team_a_id: teamA,
        team_b_id: teamB,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        match_type: 'TIE_BREAKER',
        stage_label: 'Tie-Breaker',
      })
      onOpenChange(false)
      onCreated()
    } catch {
      setError('Unable to create tie-breaker match.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Swords className="h-4 w-4" /> Create Tie-Breaker Match
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <FormField label="Team A" htmlFor="tb-a">
            <Select value={teamA} onValueChange={setTeamA}>
              <SelectTrigger id="tb-a">
                <SelectValue placeholder="Select team" />
              </SelectTrigger>
              <SelectContent>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Team B" htmlFor="tb-b">
            <Select value={teamB} onValueChange={setTeamB}>
              <SelectTrigger id="tb-b">
                <SelectValue placeholder="Select team" />
              </SelectTrigger>
              <SelectContent>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Date & Time" htmlFor="tb-date" error={error ?? undefined}>
            <Input id="tb-date" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? 'Creating…' : 'Create Match'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
