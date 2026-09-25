import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut, Radio } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { signOut } from '@/services/scorekeeper'

export function ScorekeeperLayout() {
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/scorekeeper/login')
  }

  return (
    <div className="flex min-h-screen flex-col bg-secondary/40">
      <header className="flex items-center justify-between border-b border-border bg-white px-4 py-3 lg:px-8">
        <NavLink to="/scorekeeper" className="flex items-center gap-2 font-display text-base font-extrabold text-primary-900">
          <Radio className="h-5 w-5 text-accent-500" /> SKPL Scorekeeper
        </NavLink>
        <Button variant="outline" size="sm" onClick={handleSignOut}>
          <LogOut className="h-4 w-4" /> Sign Out
        </Button>
      </header>
      <main className="flex-1 p-4 lg:p-8">
        <Outlet />
      </main>
    </div>
  )
}
