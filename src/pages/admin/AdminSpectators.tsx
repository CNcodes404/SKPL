import { useState } from 'react'
import { Check, Copy, Radio, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FormField } from '@/components/shared/FormField'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useAsync } from '@/hooks/useAsync'
import {
  createSpectatorInvite,
  getPendingSpectatorInvites,
  getSpectators,
  removeSpectator,
  revokeSpectatorInvite,
  spectatorInviteUrl,
  type SpectatorProfile,
} from '@/services/scorekeeperInvites'

export default function AdminSpectators() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [spectators, invites] = await Promise.all([getSpectators(), getPendingSpectatorInvites()])
    return { spectators, invites }
  }, [])

  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<SpectatorProfile | null>(null)
  const [removing, setRemoving] = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setCreateError(null)
    try {
      const { url } = await createSpectatorInvite(email, displayName)
      setGeneratedUrl(url)
      setEmail('')
      setDisplayName('')
      reload()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Unable to create the invite.')
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(inviteId: string) {
    await revokeSpectatorInvite(inviteId)
    reload()
  }

  async function handleRemove() {
    if (!removeTarget) return
    setRemoving(true)
    try {
      await removeSpectator(removeTarget.user_id)
      setRemoveTarget(null)
      reload()
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-primary-900">Spectators</h1>
        <p className="text-sm text-muted-foreground">
          Spectators track matches live from <span className="font-semibold">/scorekeeper</span> and submit results. They
          can't edit or delete anything else.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a spectator</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Email" htmlFor="spectator-email">
                <Input
                  id="spectator-email"
                  type="email"
                  required
                  placeholder="spectator@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </FormField>
              <FormField label="Name (optional)" htmlFor="spectator-name" error={createError ?? undefined}>
                <Input
                  id="spectator-name"
                  placeholder="e.g. Spectator 1"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </FormField>
            </div>
            <Button type="submit" disabled={creating} className="self-start">
              <UserPlus className="h-4 w-4" /> {creating ? 'Creating…' : 'Create invite link'}
            </Button>
            {generatedUrl ? (
              <div className="flex flex-col gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
                <p className="text-sm font-semibold text-green-800">
                  Invite created. Send this link to the spectator — they open it and set their password.
                </p>
                <InviteLink url={generatedUrl} />
              </div>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {loading && !data ? (
        <LoadingState rows={4} />
      ) : error || !data ? (
        <ErrorState message="Unable to load spectators. Has migration 0022 been applied?" />
      ) : (
        <>
          {data.invites.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Pending invites</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Invite link</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.invites.map((invite) => (
                      <TableRow key={invite.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{invite.email}</span>
                            {invite.display_name ? (
                              <span className="text-xs text-muted-foreground">{invite.display_name}</span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="min-w-64">
                          <InviteLink url={spectatorInviteUrl(invite.token)} />
                        </TableCell>
                        <TableCell className="text-sm">{new Date(invite.expires_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="destructive" onClick={() => handleRevoke(invite.id)}>
                            Revoke
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Active spectators</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.spectators.length === 0 ? (
                <div className="p-5">
                  <EmptyState title="No spectators yet" description="Create an invite above to add one." icon={Radio} />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Spectator</TableHead>
                      <TableHead>Added</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.spectators.map((s) => (
                      <TableRow key={s.user_id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-primary-900">{s.display_name ?? s.email ?? 'Spectator'}</span>
                            {s.display_name && s.email ? (
                              <span className="text-xs text-muted-foreground">{s.email}</span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{new Date(s.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="destructive" onClick={() => setRemoveTarget(s)}>
                            Remove
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title="Remove spectator"
        description={
          <p>
            This permanently deletes the login for{' '}
            <span className="font-semibold">{removeTarget?.email ?? removeTarget?.display_name ?? 'this spectator'}</span>.
            Results they already submitted stay as they are. If this login is also an admin or team owner, only the
            spectator access is removed.
          </p>
        }
        confirmLabel="Remove"
        loading={removing}
        onConfirm={handleRemove}
      />
    </div>
  )
}

function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center gap-2">
      <Input readOnly value={url} className="text-xs" onFocus={(e) => e.target.select()} />
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={async () => {
          await navigator.clipboard.writeText(url)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
        aria-label="Copy invite link"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  )
}
