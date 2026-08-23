import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { checkIsAdmin } from '@/services/auth'
import { checkOwnerTeam } from '@/services/ownerAuth'

interface AuthContextValue {
  session: Session | null
  user: User | null
  isAdmin: boolean
  ownerTeamId: string | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  isAdmin: false,
  ownerTeamId: null,
  loading: true,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [ownerTeamId, setOwnerTeamId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function resolveRoles(currentSession: Session | null) {
      if (!currentSession?.user) {
        if (active) {
          setIsAdmin(false)
          setOwnerTeamId(null)
        }
        return
      }
      try {
        const [admin, teamId] = await Promise.all([
          checkIsAdmin(currentSession.user.id),
          checkOwnerTeam(currentSession.user.id),
        ])
        if (active) {
          setIsAdmin(admin)
          setOwnerTeamId(teamId)
        }
      } catch {
        if (active) {
          setIsAdmin(false)
          setOwnerTeamId(null)
        }
      }
    }

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      await resolveRoles(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      resolveRoles(newSession)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, isAdmin, ownerTeamId, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
