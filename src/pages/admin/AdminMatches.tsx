import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2, ClipboardEdit, Swords } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FilterBar } from '@/components/shared/FilterBar'
import { FormField } from '@/components/shared/FormField'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { LoadingState } from '@/components/shared/LoadingState'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { useAsync } from '@/hooks/useAsync'
import { listSeasons, getSeasonTeams } from '@/services/seasons'
import { listTeams } from '@/services/teams'
import { listMatches, createMatch, updateMatchSchedule, deleteMatch } from '@/services/matches'
import { formatDateTime } from '@/lib/utils'
import { MATCH_TYPES, MATCH_TYPE_LABELS, type Match, type MatchStatus, type MatchType, type MatchWithTeams } from '@/types'

export default function AdminMatches() {
  const [seasonFilter, setSeasonFilter] = useState('ALL')
  const [typeFilter, setTypeFilter] = useState<'ALL' | MatchType>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | MatchStatus>('ALL')
  const [teamFilter, setTeamFilter] = useState('ALL')

  const { data: seasons } = useAsync(() => listSeasons(), [])
  const { data: teams } = useAsync(() => listTeams(true), [])

  const { data: matches, loading, error, reload } = useAsync(
    () =>
      listMatches({
        seasonId: seasonFilter === 'ALL' ? undefined : seasonFilter,
        matchType: typeFilter === 'ALL' ? undefined : typeFilter,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        teamId: teamFilter === 'ALL' ? undefined : teamFilter,
      }),
    [seasonFilter, typeFilter, statusFilter, teamFilter],
  )

  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [editing, setEditing] = useState<MatchWithTeams | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Match | null>(null)
  const [deleting, setDeleting] = useState(false)

  const sorted = [...(matches ?? [])].sort(
    (a, b) => new Date(b.scheduled_at ?? 0).getTime() - new Date(a.scheduled_at ?? 0).getTime(),
  )

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteMatch(deleteTarget.id)
      setDeleteTarget(null)
      reload()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-primary-900">Matches</h1>
          <p className="text-sm text-muted-foreground">Schedule, score, and manage every match.</p>
        </div>
        <Button onClick={() => setScheduleOpen(true)}>
          <Plus className="h-4 w-4" /> Schedule Match
        </Button>
      </div>

      <FilterBar>
        <Select value={seasonFilter} onValueChange={setSeasonFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Season" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Seasons</SelectItem>
            {(seasons ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Match Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Types</SelectItem>
            {MATCH_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {MATCH_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            <SelectItem value="SCHEDULED">Scheduled</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Teams</SelectItem>
            {(teams ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      {loading ? (
        <LoadingState rows={6} />
      ) : error ? (
        <ErrorState message="Unable to load matches." />
      ) : sorted.length === 0 ? (
        <EmptyState title="No matches found." icon={Swords} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Teams</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Score</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="whitespace-nowrap text-sm">{formatDateTime(m.scheduled_at)}</TableCell>
                <TableCell className="font-semibold">
                  {m.team_a.short_name} vs {m.team_b.short_name}
                </TableCell>
                <TableCell>{MATCH_TYPE_LABELS[m.match_type]}</TableCell>
                <TableCell>
                  <StatusBadge status={m.status} />
                </TableCell>
                <TableCell>{m.status === 'COMPLETED' ? `${m.team_a_score} - ${m.team_b_score}` : '—'}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(m)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button asChild size="sm" variant="secondary">
                      <Link to={`/admin/matches/${m.id}`}>
                        <ClipboardEdit className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(m)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ScheduleMatchDialog open={scheduleOpen} onOpenChange={setScheduleOpen} onCreated={reload} />
      {editing ? (
        <EditMatchDialog match={editing} onOpenChange={(open) => !open && setEditing(null)} onSaved={reload} />
      ) : null}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Match"
        description="This permanently deletes the match and all of its player statistics. Standings and statistics will recalculate. If this was the Final, the season champion will be cleared."
        confirmLabel="Delete Match"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  )
}

function ScheduleMatchDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const { data: seasons } = useAsync(() => listSeasons(), [open])
  const [seasonId, setSeasonId] = useState('')
  const [matchType, setMatchType] = useState<MatchType>('REGULAR_SEASON')
  const [teamAId, setTeamAId] = useState('')
  const [teamBId, setTeamBId] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [stageLabel, setStageLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const { data: seasonTeams } = useAsync(async () => {
    if (!seasonId) return []
    return getSeasonTeams(seasonId)
  }, [seasonId])

  async function handleSubmit() {
    if (!seasonId || !teamAId || !teamBId || teamAId === teamBId) {
      setError('Select a season and two different teams.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createMatch({
        season_id: seasonId,
        team_a_id: teamAId,
        team_b_id: teamBId,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        match_type: matchType,
        stage_label: stageLabel.trim() || null,
      })
      onOpenChange(false)
      onCreated()
      setSeasonId('')
      setTeamAId('')
      setTeamBId('')
      setScheduledAt('')
      setStageLabel('')
      setMatchType('REGULAR_SEASON')
    } catch {
      setError('Unable to schedule match.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule Match</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <FormField label="Season" htmlFor="m-season">
            <Select value={seasonId} onValueChange={setSeasonId}>
              <SelectTrigger id="m-season">
                <SelectValue placeholder="Select season" />
              </SelectTrigger>
              <SelectContent>
                {(seasons ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Match Type" htmlFor="m-type">
            <Select value={matchType} onValueChange={(v) => setMatchType(v as MatchType)}>
              <SelectTrigger id="m-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MATCH_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {MATCH_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Team A" htmlFor="m-a">
              <Select value={teamAId} onValueChange={setTeamAId} disabled={!seasonId}>
                <SelectTrigger id="m-a">
                  <SelectValue placeholder="Team A" />
                </SelectTrigger>
                <SelectContent>
                  {(seasonTeams ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Team B" htmlFor="m-b">
              <Select value={teamBId} onValueChange={setTeamBId} disabled={!seasonId}>
                <SelectTrigger id="m-b">
                  <SelectValue placeholder="Team B" />
                </SelectTrigger>
                <SelectContent>
                  {(seasonTeams ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <FormField label="Date & Time" htmlFor="m-date" hint="Optional round/stage label below.">
            <Input id="m-date" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </FormField>

          <FormField label="Round / Stage Label (optional)" htmlFor="m-stage" error={error ?? undefined}>
            <Input id="m-stage" value={stageLabel} onChange={(e) => setStageLabel(e.target.value)} placeholder="e.g. Playoffs Round 1" />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Scheduling…' : 'Schedule Match'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditMatchDialog({
  match,
  onOpenChange,
  onSaved,
}: {
  match: MatchWithTeams
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [scheduledAt, setScheduledAt] = useState(match.scheduled_at ? toLocalInputValue(new Date(match.scheduled_at)) : '')
  const [matchType, setMatchType] = useState<MatchType>(match.match_type)
  const [status, setStatus] = useState<MatchStatus>(match.status)
  const [stageLabel, setStageLabel] = useState(match.stage_label ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await updateMatchSchedule(match.id, {
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        match_type: matchType,
        status,
        stage_label: stageLabel.trim() || null,
      })
      onOpenChange(false)
      onSaved()
    } catch {
      setError('Unable to update match.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Edit Match — {match.team_a.short_name} vs {match.team_b.short_name}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <FormField label="Date & Time" htmlFor="e-date">
            <Input id="e-date" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </FormField>
          <FormField label="Match Type" htmlFor="e-type">
            <Select value={matchType} onValueChange={(v) => setMatchType(v as MatchType)}>
              <SelectTrigger id="e-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MATCH_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {MATCH_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField
            label="Status"
            htmlFor="e-status"
            hint={
              status === 'COMPLETED'
                ? 'To edit the score or stats of a completed match, use "Enter Score" instead.'
                : 'Completing a match requires entering its score and player stats via "Enter Score".'
            }
          >
            <Select value={status} onValueChange={(v) => setStatus(v as MatchStatus)} disabled={status === 'COMPLETED'}>
              <SelectTrigger id="e-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
                {status === 'COMPLETED' ? <SelectItem value="COMPLETED">Completed</SelectItem> : null}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Round / Stage Label" htmlFor="e-stage" error={error ?? undefined}>
            <Input id="e-stage" value={stageLabel} onChange={(e) => setStageLabel(e.target.value)} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
