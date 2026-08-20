import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/shared/FormField'
import { useAuth } from '@/context/AuthContext'
import { signInWithPassword } from '@/services/auth'

export default function AdminLogin() {
  const { session, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (!authLoading && session) {
    const from = (location.state as { from?: Location })?.from
    return <Navigate to={from?.pathname ?? '/admin'} replace />
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signInWithPassword(email, password)
      navigate('/admin')
    } catch {
      setError('Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-skpl-gradient p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-elevated">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <img src="/skpl-logo.png" alt="SKPL" className="h-14 w-14 rounded-lg object-contain" />
          <h1 className="font-display text-xl font-extrabold text-primary-900">SKPL Admin</h1>
          <p className="text-sm text-muted-foreground">Sign in to manage the league.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Email" htmlFor="email">
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormField>
          <FormField label="Password" htmlFor="password" error={error ?? undefined}>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </FormField>
          <Button type="submit" size="lg" disabled={loading} className="mt-2">
            <ShieldCheck className="h-4 w-4" /> {loading ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>
      </div>
    </div>
  )
}
