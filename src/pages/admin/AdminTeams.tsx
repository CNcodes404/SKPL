import { useState } from 'react'
import { Plus, Pencil, Ban, CheckCircle2, Users, KeyRound, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FormField } from '@/components/shared/FormField'
import { ImageUploadField } from '@/components/shared/ImageUploadField'
import { LoadingState } from '@/components/shared/LoadingState'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { TeamLogo } from '@/components/shared/Avatar'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useAsync } from '@/hooks/useAsync'
import { listTeams, createTeam, updateTeam, setTeamActive } from '@/services/teams'
import { listTeamTournaments, listTournaments, setTeamTournaments } from '@/services/tournaments'
import { Checkbox } from '@/components/ui/checkbox'
import {
  createOwnerInvite,
  getOwnerProfiles,
  getPendingInvites,
  removeOwner,
  revokeOwnerInvite,
  type OwnerProfileInfo,
  type PendingInvite,
} from '@/services/ownerInvites'
import type { Team } from '@/types'

interface FormState {
  name: string
  short_name: string
  logo_url: string
  description: string
  mascot_name: string
  mascot_tagline: string
  mascot_bio: string
  mascot_color: string
  mascot_video_url: string
  mascot_video_safari_url: string
  mascot_poster_url: string
}

const EMPTY_FORM: FormState = {
  name: '',
  short_name: '',
  logo_url: '',
  description: '',
  mascot_name: '',
  mascot_tagline: '',
  mascot_bio: '',
  mascot_color: '',
  mascot_video_url: '',
  mascot_video_safari_url: '',
  mascot_poster_url: '',
}

const MASCOT_FIELDS = [
  'mascot_name',
  'mascot_tagline',
  'mascot_bio',
  'mascot_color',
  'mascot_video_url',
  'mascot_video_safari_url',
  'mascot_poster_url',
] as const

export default function AdminTeams() {
  const { data: teams, loading, error, reload } = useAsync(() => listTeams(true), [])
  const { data: tournamentData, reload: reloadTournaments } = useAsync(async () => {
    const [tournaments, byTeam] = await Promise.all([listTournaments(), listTeamTournaments()])
    return { tournaments, byTeam }
  }, [])
  const [formTournamentIds, setFormTournamentIds] = useState<string[]>([])
  const {
    data: ownerData,
    reload: reloadOwners,
  } = useAsync(async () => {
    const [profiles, invites] = await Promise.all([getOwnerProfiles(), getPendingInvites()])
    return { profiles, invites }
  }, [])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Team | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [toggleTarget, setToggleTarget] = useState<Team | null>(null)
  const [toggling, setToggling] = useState(false)
  const [ownerDialogTeam, setOwnerDialogTeam] = useState<Team | null>(null)

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormTournamentIds([])
    setFormError(null)
    setDialogOpen(true)
  }

  function openEdit(team: Team) {
    setEditing(team)
    setForm({
      name: team.name,
      short_name: team.short_name,
      logo_url: team.logo_url ?? '',
      description: team.description ?? '',
      ...Object.fromEntries(MASCOT_FIELDS.map((field) => [field, team[field] ?? ''])),
    } as FormState)
    setFormTournamentIds(tournamentData?.byTeam[team.id] ?? [])
    setFormError(null)
    setDialogOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.short_name.trim()) {
      setFormError('Name and short name are required.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const payload = {
        name: form.name.trim(),
        short_name: form.short_name.trim(),
        logo_url: form.logo_url.trim() || null,
        description: form.description.trim() || null,
        ...Object.fromEntries(MASCOT_FIELDS.map((field) => [field, form[field].trim() || null])),
      }
      const saved = editing ? await updateTeam(editing.id, payload) : await createTeam(payload)
      await setTeamTournaments(saved.id, formTournamentIds)
      setDialogOpen(false)
      reload()
      reloadTournaments()
    } catch {
      setFormError('Unable to save team. Please check the entered details.')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle() {
    if (!toggleTarget) return
    setToggling(true)
    try {
      await setTeamActive(toggleTarget.id, !toggleTarget.is_active)
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
          <h1 className="font-display text-3xl font-bold text-primary-900">Teams</h1>
          <p className="text-sm text-muted-foreground">Manage league franchises.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add Team
        </Button>
      </div>

      {loading ? (
        <LoadingState rows={5} />
      ) : error ? (
        <ErrorState message="Unable to load teams." />
      ) : !teams || teams.length === 0 ? (
        <EmptyState title="No teams found." icon={Users} action={<Button onClick={openCreate}>Add Team</Button>} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Team</TableHead>
              <TableHead>Short Name</TableHead>
              <TableHead>Tournaments</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.map((team) => {
              const owner = ownerData?.profiles.find((o) => o.team_id === team.id)
              const pendingInvite = ownerData?.invites.find((i) => i.team_id === team.id)
              return (
                <TableRow key={team.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <TeamLogo name={team.name} logoUrl={team.logo_url} className="h-9 w-9 text-xs" />
                      <span className="font-semibold text-primary-900">{team.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>{team.short_name}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(tournamentData?.tournaments ?? [])
                        .filter((t) => tournamentData?.byTeam[team.id]?.includes(t.id))
                        .map((t) => (
                          <Badge key={t.id} variant="default">
                            {t.short_name}
                          </Badge>
                        ))}
                      {!tournamentData?.byTeam[team.id]?.length ? (
                        <span className="text-sm text-muted-foreground">None</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={team.is_active ? 'success' : 'outline'}>{team.is_active ? 'Active' : 'Inactive'}</Badge>
                  </TableCell>
                  <TableCell>
                    {owner ? (
                      <span className="text-sm">{owner.owner_email ?? 'Linked'}</span>
                    ) : pendingInvite ? (
                      <Badge variant="outline">Invite pending</Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">No owner</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setOwnerDialogTeam(team)}>
                        <KeyRound className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEdit(team)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant={team.is_active ? 'destructive' : 'secondary'}
                        onClick={() => setToggleTarget(team)}
                      >
                        {team.is_active ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Team' : 'Add Team'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <FormField label="Name" htmlFor="team-name">
              <Input id="team-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </FormField>
            <FormField label="Short Name" htmlFor="team-short">
              <Input
                id="team-short"
                maxLength={6}
                value={form.short_name}
                onChange={(e) => setForm({ ...form, short_name: e.target.value.toUpperCase() })}
              />
            </FormField>
            <ImageUploadField
              label="Team Logo"
              value={form.logo_url}
              onChange={(url) => setForm({ ...form, logo_url: url })}
              folder="teams"
              hint="Optional. Upload an image or paste a URL."
            />
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-primary-900">Eligible tournaments</p>
              <p className="text-xs text-muted-foreground">
                The team can only be picked when creating seasons of the tournaments ticked here.
              </p>
              <div className="flex flex-wrap gap-3">
                {(tournamentData?.tournaments ?? []).map((t) => {
                  const checked = formTournamentIds.includes(t.id)
                  return (
                    <label
                      key={t.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                        checked ? 'border-primary-600 bg-primary-50' : 'border-border'
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        onChange={() =>
                          setFormTournamentIds((prev) =>
                            prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id],
                          )
                        }
                      />
                      <span className="font-semibold text-primary-900">{t.name}</span>
                    </label>
                  )
                })}
              </div>
            </div>
            <FormField label="Description" htmlFor="team-desc">
              <Textarea
                id="team-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </FormField>

            <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
              <div>
                <p className="font-display font-bold text-primary-900">Mascot</p>
                <p className="text-xs text-muted-foreground">
                  Optional. Shown next to the squad on the team page once a WebM video is set.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Mascot Name" htmlFor="mascot-name">
                  <Input
                    id="mascot-name"
                    value={form.mascot_name}
                    onChange={(e) => setForm({ ...form, mascot_name: e.target.value })}
                  />
                </FormField>
                <FormField label="Card Colour" htmlFor="mascot-color" hint="Hex, e.g. #2563eb">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label="Pick card colour"
                      value={/^#[0-9a-f]{6}$/i.test(form.mascot_color) ? form.mascot_color : '#7c3aed'}
                      onChange={(e) => setForm({ ...form, mascot_color: e.target.value })}
                      className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-border bg-white p-1"
                    />
                    <Input
                      id="mascot-color"
                      value={form.mascot_color}
                      placeholder="#7c3aed"
                      onChange={(e) => setForm({ ...form, mascot_color: e.target.value })}
                    />
                  </div>
                </FormField>
              </div>
              <FormField label="Tagline" htmlFor="mascot-tagline">
                <Input
                  id="mascot-tagline"
                  value={form.mascot_tagline}
                  onChange={(e) => setForm({ ...form, mascot_tagline: e.target.value })}
                />
              </FormField>
              <FormField label="Bio" htmlFor="mascot-bio" hint="Shown in the popup.">
                <Textarea
                  id="mascot-bio"
                  value={form.mascot_bio}
                  onChange={(e) => setForm({ ...form, mascot_bio: e.target.value })}
                />
              </FormField>
              <ImageUploadField
                kind="video"
                label="Video (WebM)"
                value={form.mascot_video_url}
                onChange={(url) => setForm({ ...form, mascot_video_url: url })}
                folder="mascots"
                hint="Transparent WebM — the <name>.webm file. Plays in Chrome, Edge, Firefox and Android."
              />
              <ImageUploadField
                kind="video"
                label="Safari Video (MP4)"
                value={form.mascot_video_safari_url}
                onChange={(url) => setForm({ ...form, mascot_video_safari_url: url })}
                folder="mascots"
                hint="The <name>-stacked.mp4 file. Used on Safari and iPhone."
              />
              <ImageUploadField
                label="Poster Image"
                value={form.mascot_poster_url}
                onChange={(url) => setForm({ ...form, mascot_poster_url: url })}
                folder="mascots"
                hint="The <name>-poster.webp file. Shown while loading and for reduced motion."
              />
            </div>
            {formError ? <p className="text-sm font-medium text-destructive">{formError}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save Team'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!toggleTarget}
        onOpenChange={(open) => !open && setToggleTarget(null)}
        title={toggleTarget?.is_active ? 'Deactivate Team' : 'Reactivate Team'}
        description={
          toggleTarget?.is_active
            ? 'This team will no longer be selectable for future seasons. Historical matches and statistics are preserved.'
            : 'This team will become selectable for future seasons again.'
        }
        confirmLabel={toggleTarget?.is_active ? 'Deactivate' : 'Reactivate'}
        destructive={!!toggleTarget?.is_active}
        loading={toggling}
        onConfirm={handleToggle}
      />

      <OwnerManageDialog
        team={ownerDialogTeam}
        owner={ownerData?.profiles.find((o) => o.team_id === ownerDialogTeam?.id) ?? null}
        pendingInvite={ownerData?.invites.find((i) => i.team_id === ownerDialogTeam?.id) ?? null}
        onOpenChange={(open) => !open && setOwnerDialogTeam(null)}
        onChanged={reloadOwners}
      />
    </div>
  )
}

function OwnerManageDialog({
  team,
  owner,
  pendingInvite,
  onOpenChange,
  onChanged,
}: {
  team: Team | null
  owner: OwnerProfileInfo | null
  pendingInvite: PendingInvite | null
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}) {
  const [invitedEmail, setInvitedEmail] = useState('')
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false)

  async function handleGenerate() {
    if (!team) return
    setWorking(true)
    try {
      const { url } = await createOwnerInvite(team.id, invitedEmail)
      setGeneratedUrl(url)
      setInvitedEmail('')
      onChanged()
    } finally {
      setWorking(false)
    }
  }

  async function handleRevoke() {
    if (!pendingInvite) return
    setWorking(true)
    try {
      await revokeOwnerInvite(pendingInvite.id)
      onChanged()
    } finally {
      setWorking(false)
    }
  }

  async function handleRemoveOwner() {
    if (!team) return
    setWorking(true)
    try {
      await removeOwner(team.id)
      setRemoveConfirmOpen(false)
      onChanged()
    } finally {
      setWorking(false)
    }
  }

  return (
    <>
      <Dialog open={!!team} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Owner — {team?.name}</DialogTitle>
          </DialogHeader>
        <div className="flex flex-col gap-4">
          {owner ? (
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-xs text-muted-foreground">Current Owner</p>
                <p className="font-semibold text-primary-900">{owner.owner_email ?? 'Linked account'}</p>
              </div>
              <Button size="sm" variant="destructive" onClick={() => setRemoveConfirmOpen(true)}>
                Remove
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">This team has no owner account linked yet.</p>
          )}

          {pendingInvite ? (
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">
                Pending invite{pendingInvite.invited_email ? ` — sent to ${pendingInvite.invited_email}` : ''}, expires{' '}
                {new Date(pendingInvite.expires_at).toLocaleDateString()}
              </p>
              <div className="flex items-center gap-2">
                <Input readOnly value={`${window.location.origin}/owner/claim/${pendingInvite.token}`} className="text-xs" />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(`${window.location.origin}/owner/claim/${pendingInvite.token}`)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Button size="sm" variant="destructive" onClick={handleRevoke} disabled={working} className="self-start">
                Revoke Invite
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <FormField label="Generate a new invite (optional email note)" htmlFor="invite-email">
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="owner@example.com"
                  value={invitedEmail}
                  onChange={(e) => setInvitedEmail(e.target.value)}
                />
              </FormField>
              <Button onClick={handleGenerate} disabled={working} className="self-start">
                {working ? 'Generating…' : 'Generate Invite Link'}
              </Button>
              {generatedUrl ? (
                <div className="flex items-center gap-2">
                  <Input readOnly value={generatedUrl} className="text-xs" />
                  <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(generatedUrl)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removeConfirmOpen}
        onOpenChange={setRemoveConfirmOpen}
        title="Remove Owner"
        description="This permanently deletes their login account along with its email, and revokes their access to this team's strategy and retention pages. This cannot be undone."
        confirmLabel="Remove"
        loading={working}
        onConfirm={handleRemoveOwner}
      />
    </>
  )
}
