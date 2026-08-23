import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/shared/FormField'
import { LoadingState } from '@/components/shared/LoadingState'
import { useAsync } from '@/hooks/useAsync'
import { claimOwnerInvite, getInviteInfo } from '@/services/ownerInvites'
import { signUp } from '@/services/ownerAuth'

export default function OwnerClaim() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const { data: info, loading } = useAsync(() => getInviteInfo(token), [token])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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

  if (!info?.valid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-skpl-gradient p-4">
        <div className="w-full max-w-sm rounded-xl bg-white p-8 text-center shadow-elevated">
          <p className="font-display text-lg font-bold text-primary-900">Invite Not Available</p>
          <p className="mt-2 text-sm text-muted-foreground">{info?.reason ?? 'This invite link is invalid.'}</p>
        </div>
      </div>
    )
  }

  if (confirmationPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-skpl-gradient p-4">
        <div className="w-full max-w-sm rounded-xl bg-white p-8 text-center shadow-elevated">
          <p className="font-display text-lg font-bold text-primary-900">Confirm Your Email</p>
          <p className="mt-2 text-sm text-muted-foreground">
            You're linked to {info.teamName} already. Check your email for a confirmation link before signing in at{' '}
            <span className="font-semibold">/owner/login</span>.
          </p>
        </div>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError(null)
    try {
      const { user, session } = await signUp(email, password)
      if (!user) throw new Error('Sign up did not return a user.')
      await claimOwnerInvite(token, user.id, email)
      if (!session) {
        // Email confirmation is required by this project's auth settings —
        // the account exists and is linked, but can't sign in yet.
        setConfirmationPending(true)
        return
      }
      navigate('/owner/strategy')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to claim this invite.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-skpl-gradient p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-elevated">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <img src="/skpl-logo.png" alt="SKPL" className="h-14 w-14 rounded-lg object-contain" />
          <h1 className="font-display text-xl font-extrabold text-primary-900">Claim Team Ownership</h1>
          <p className="text-sm text-muted-foreground">
            You're about to become the owner of <span className="font-semibold text-primary-900">{info.teamName}</span>.
            Set an email and password to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Email" htmlFor="email">
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormField>
          <FormField label="Password" htmlFor="password" error={submitError ?? undefined}>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>
          <Button type="submit" size="lg" disabled={submitting} className="mt-2">
            <UserPlus className="h-4 w-4" /> {submitting ? 'Setting up…' : 'Create Account & Claim'}
          </Button>
        </form>
      </div>
    </div>
  )
}
