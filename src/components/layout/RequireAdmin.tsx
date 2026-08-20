import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { LoadingState } from '@/components/shared/LoadingState'

export function RequireAdmin() {
  const { session, isAdmin, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <LoadingState rows={3} />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
        <ShieldAlert className="h-10 w-10 text-destructive" />
        <p className="font-display text-xl font-bold">Access Denied</p>
        <p className="max-w-sm text-sm text-muted-foreground">You do not have administrator access.</p>
      </div>
    )
  }

  return <Outlet />
}
