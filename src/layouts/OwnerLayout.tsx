import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { signOut } from '@/services/ownerAuth'
import { cn } from '@/lib/utils'

export function OwnerLayout() {
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/owner/login')
  }

  return (
    <div className="flex min-h-screen flex-col bg-secondary/40">
      <header className="flex items-center justify-between border-b border-border bg-white px-4 py-3 lg:px-8">
        <nav className="flex items-center gap-1">
          {[
            { to: '/owner/strategy', label: 'Strategy' },
            { to: '/owner/retention', label: 'Retention' },
          ].map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                cn(
                  'rounded-md px-3 py-1.5 text-sm font-semibold',
                  isActive ? 'bg-primary-700 text-white' : 'text-muted-foreground hover:bg-secondary',
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
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
