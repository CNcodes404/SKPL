import { useState } from 'react'
import { Plus, Pencil, Ban, CheckCircle2, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FormField } from '@/components/shared/FormField'
import { LoadingState } from '@/components/shared/LoadingState'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { PlayerAvatar } from '@/components/shared/Avatar'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useAsync } from '@/hooks/useAsync'
import { listPlayers, createPlayer, updatePlayer, setPlayerActive } from '@/services/players'
import type { Player } from '@/types'

interface FormState {
  name: string
  image_url: string
}

const EMPTY_FORM: FormState = { name: '', image_url: '' }

export default function AdminPlayers() {
  const { data: players, loading, error, reload } = useAsync(() => listPlayers(true), [])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Player | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [toggleTarget, setToggleTarget] = useState<Player | null>(null)
  const [toggling, setToggling] = useState(false)

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setDialogOpen(true)
  }

  function openEdit(player: Player) {
    setEditing(player)
    setForm({ name: player.name, image_url: player.image_url ?? '' })
    setFormError(null)
    setDialogOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      setFormError('Name is required.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const payload = { name: form.name.trim(), image_url: form.image_url.trim() || null }
      if (editing) {
        await updatePlayer(editing.id, payload)
      } else {
        await createPlayer(payload)
      }
      setDialogOpen(false)
      reload()
    } catch {
      setFormError('Unable to save player.')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle() {
    if (!toggleTarget) return
    setToggling(true)
    try {
      await setPlayerActive(toggleTarget.id, !toggleTarget.is_active)
      setToggleTarget(null)
      reload()
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-primary-900">Players</h1>
          <p className="text-sm text-muted-foreground">Manage the player pool.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add Player
        </Button>
      </div>

      {loading ? (
        <LoadingState rows={5} />
      ) : error ? (
        <ErrorState message="Unable to load players." />
      ) : !players || players.length === 0 ? (
        <EmptyState title="No players found." icon={UserRound} action={<Button onClick={openCreate}>Add Player</Button>} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Player</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {players.map((player) => (
              <TableRow key={player.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <PlayerAvatar name={player.name} imageUrl={player.image_url} className="h-9 w-9 text-xs" />
                    <span className="font-semibold text-primary-900">{player.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={player.is_active ? 'success' : 'outline'}>
                    {player.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(player)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant={player.is_active ? 'destructive' : 'secondary'}
                      onClick={() => setToggleTarget(player)}
                    >
                      {player.is_active ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Player' : 'Add Player'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <FormField label="Name" htmlFor="player-name">
              <Input id="player-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </FormField>
            <FormField
              label="Image URL"
              htmlFor="player-image"
              hint="Optional. Paste an image URL."
              error={formError ?? undefined}
            >
              <Input
                id="player-image"
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save Player'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!toggleTarget}
        onOpenChange={(open) => !open && setToggleTarget(null)}
        title={toggleTarget?.is_active ? 'Deactivate Player' : 'Reactivate Player'}
        description={
          toggleTarget?.is_active
            ? 'This player will no longer be selectable for future seasons. Historical matches and statistics are preserved.'
            : 'This player will become selectable for future seasons again.'
        }
        confirmLabel={toggleTarget?.is_active ? 'Deactivate' : 'Reactivate'}
        destructive={!!toggleTarget?.is_active}
        loading={toggling}
        onConfirm={handleToggle}
      />
    </div>
  )
}
