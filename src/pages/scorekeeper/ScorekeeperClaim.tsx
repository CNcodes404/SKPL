import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/shared/FormField'
import { LoadingState } from '@/components/shared/LoadingState'
import { useAsync } from '@/hooks/useAsync'
import { claimSpectatorInvite, getSpectatorInviteInfo } from '@/services/scorekeeperInvites'
import { signUp } from '@/services/ownerAuth'
import { signInWithPassword } from '@/services/auth'

export default function ScorekeeperClaim() {
  const { token = '' } = useParams()
  const { data: info, loading } = useAsync(() => getSpectatorInviteInfo(token), [token])

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [confirmationPending, setConfirmationPending] = useState(false)

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <LoadingState rows={3} />
      </div>
    )
  }

  if (!info?.valid || !info.email) {
    return (
      <Shell>
        <p className="text-center font-display text-lg font-bold text-primary-900">Invite Not Available</p>
        <p className="mt-2 text-center text-sm text-muted-foreground">{info?.reason ?? 'This invite link is invalid.'}</p>
      </Shell>
    )
  }

  if (confirmationPending) {
    return (
      <Shell>
        <p className="text-center font-display text-lg font-bold text-primary-900">Confirm Your Email</p>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Your spectator account is set up. Check <span className="font-semibold">{info.email}</span> for a confirmation
          link, then sign in at <span className="font-semibold">/scorekeeper/login</span>.
        </p>
      </Shell>
    )
  }

  const email = info.email

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setSubmitError("The passwords don't match.")
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const { user, session } = await signUp(email, password)
      if (!user) throw new Error('Sign up did not return a user.')

      // Supabase returns a placeholder user (no identities) when the email is
      // already registered. Accept the invite with that existing account instead.
      if (user.identities && user.identities.length === 0) {
        let existing
        try {
          existing = await signInWithPassword(email, password)
        } catch {
          throw new Error('An account with this email already exists. Enter its current password to accept the invite.')
        }
        await claimSpectatorInvite(token, existing.user.id)
        goToScorekeeper()
        return
      }

      await claimSpectatorInvite(token, user.id)
      if (!session) {
        // Email confirmation is required by this project's auth settings.
        setConfirmationPending(true)
        return
      }
      goToScorekeeper()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to accept this invite.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Shell>
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <img src="/skpl-logo.png" alt="SKPL" className="h-14 w-14 rounded-lg object-contain" />
        <h1 className="font-display text-xl font-extrabold text-primary-900">Become an SKPL Spectator</h1>
        <p className="text-sm text-muted-foreground">
          {info.displayName ? (
            <>
              Hi <span className="font-semibold text-primary-900">{info.displayName}</span>!{' '}
            </>
          ) : null}
          Set a password to track matches live and submit results.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Email" htmlFor="email">
          <Input id="email" type="email" value={email} readOnly disabled />
        </FormField>
        <FormField label="Password" htmlFor="password">
          <Input
            id="password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </FormField>
        <FormField label="Confirm password" htmlFor="confirm" error={submitError ?? undefined}>
          <Input
            id="confirm"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </FormField>
        <Button type="submit" size="lg" disabled={submitting} className="mt-2">
          <UserPlus className="h-4 w-4" /> {submitting ? 'Setting up…' : 'Set Password & Join'}
        </Button>
      </form>
    </Shell>
  )
}

/**
 * Full page load rather than in-app navigation: the login's roles were looked
 * up at sign-up, before the invite was claimed, so they need re-reading.
 */
function goToScorekeeper() {
  window.location.assign('/scorekeeper')
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-skpl-gradient p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-elevated">{children}</div>
    </div>
  )
}
