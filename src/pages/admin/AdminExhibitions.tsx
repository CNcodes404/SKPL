import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2, ClipboardEdit, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FormField } from '@/components/shared/FormField'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { TeamLogo, PlayerAvatar } from '@/components/shared/Avatar'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { LoadingState } from '@/components/shared/LoadingState'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { useAsync } from '@/hooks/useAsync'
import { listTeams } from '@/services/teams'
import { listPlayers } from '@/services/players'
import { listExhibitionMatches, createExhibitionMatch, deleteMatch } from '@/services/matches'
import { formatDateTime } from '@/lib/utils'
import type { Match } from '@/types'

export default function AdminExhibitions() {
  const { data: matches, loading, error, reload } = useAsync(() => listExhibitionMatches(), [])

  const [createOpen, setCreateOpen] = useState(false)
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
          <h1 className="font-display text-3xl font-bold text-primary-900">Exhibition Matches</h1>
          <p className="text-sm text-muted-foreground">
            One-off matches outside any tournament season. Their stats only count toward player/team totals when the
            "Include Exhibitions" filter is turned on.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Create Exhibition Match
        </Button>
      </div>

      {loading ? (
        <LoadingState rows={6} />
      ) : error ? (
        <ErrorState message="Unable to load exhibition matches." />
      ) : sorted.length === 0 ? (
        <EmptyState title="No exhibition matches yet." icon={Zap} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Teams</TableHead>
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
                <TableCell>
                  <StatusBadge status={m.status} />
                </TableCell>
                <TableCell>{m.status === 'COMPLETED' ? `${m.team_a_score} - ${m.team_b_score}` : '—'}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button asChild size="sm" variant="secondary">
                      <Link to={`/admin/exhibitions/${m.id}`}>
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

      <CreateExhibitionMatchDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={reload} />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Exhibition Match"
        description="This permanently deletes the match and all of its player statistics."
        confirmLabel="Delete Match"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  )
}

function CreateExhibitionMatchDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const { data: teams } = useAsync(() => listTeams(true), [open])
  const { data: players } = useAsync(() => listPlayers(true), [open])

  const [teamAId, setTeamAId] = useState('')
  const [teamBId, setTeamBId] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [assignments, setAssignments] = useState<Record<string, 'A' | 'B'>>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function togglePlayer(playerId: string, side: 'A' | 'B') {
    setAssignments((prev) => {
      const next = { ...prev }
      if (next[playerId] === side) delete next[playerId]
      else next[playerId] = side
      return next
    })
  }

  function reset() {
    setTeamAId('')
    setTeamBId('')
    setScheduledAt('')
    setAssignments({})
    setError(null)
  }

  async function handleSubmit() {
    const teamAPlayerIds = Object.entries(assignments).filter(([, side]) => side === 'A').map(([id]) => id)
    const teamBPlayerIds = Object.entries(assignments).filter(([, side]) => side === 'B').map(([id]) => id)

    if (!teamAId || !teamBId || teamAId === teamBId) {
      setError('Select two different teams.')
      return
    }
    if (teamAPlayerIds.length === 0 || teamBPlayerIds.length === 0) {
      setError('Select at least one player for each team.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await createExhibitionMatch({
        team_a_id: teamAId,
        team_b_id: teamBId,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        team_a_player_ids: teamAPlayerIds,
        team_b_player_ids: teamBPlayerIds,
      })
      onOpenChange(false)
      onCreated()
      reset()
    } catch (err) {
      console.error(err)
      const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : null
      setError(message || 'Unable to create exhibition match.')
    } finally {
      setSaving(false)
    }
  }

  const teamA = (teams ?? []).find((t) => t.id === teamAId) ?? null
  const teamB = (teams ?? []).find((t) => t.id === teamBId) ?? null

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Exhibition Match</DialogTitle>
        </DialogHeader>
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Team A" htmlFor="ex-a">
              <Select value={teamAId} onValueChange={setTeamAId}>
                <SelectTrigger id="ex-a">
                  <SelectValue placeholder="Team A" />
                </SelectTrigger>
                <SelectContent>
                  {(teams ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Team B" htmlFor="ex-b">
              <Select value={teamBId} onValueChange={setTeamBId}>
                <SelectTrigger id="ex-b">
                  <SelectValue placeholder="Team B" />
                </SelectTrigger>
                <SelectContent>
                  {(teams ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <FormField label="Date & Time (optional)" htmlFor="ex-date">
            <Input id="ex-date" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </FormField>

          {(['A', 'B'] as const).map((side) => {
            const team = side === 'A' ? teamA : teamB
            const count = Object.values(assignments).filter((s) => s === side).length
            return (
              <div key={side} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  {team ? <TeamLogo name={team.name} logoUrl={team.logo_url} className="h-7 w-7 text-[10px]" /> : null}
                  <h3 className="font-display font-bold text-primary-900">{team ? team.name : `Team ${side}`}</h3>
                  <Badge variant="outline">{count} players</Badge>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(players ?? []).map((player) => {
                    const assignedTo = assignments[player.id]
                    const assignedElsewhere = assignedTo && assignedTo !== side ? assignedTo : null
                    return (
                      <label
                        key={player.id}
                        className={cn(
                          'flex items-center gap-2 rounded-md border p-2 text-sm',
                          assignedElsewhere
                            ? 'cursor-not-allowed border-border bg-secondary/40 opacity-60'
                            : 'cursor-pointer border-border hover:bg-secondary/50',
                          assignedTo === side && 'border-primary-600 bg-primary-50',
                        )}
                      >
                        <Checkbox
                          checked={assignedTo === side}
                          disabled={!!assignedElsewhere}
                          onChange={() => togglePlayer(player.id, side)}
                        />
                        <PlayerAvatar name={player.name} imageUrl={player.image_url} className="h-7 w-7 text-[10px]" />
                        <span className="truncate font-medium text-primary-900">{player.name}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Creating…' : 'Create Match'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
