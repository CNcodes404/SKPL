import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Trophy,
  Users,
  UserRound,
  Swords,
  Globe,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { signOut } from '@/services/auth'

const LINKS = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/seasons', label: 'Seasons', icon: Trophy },
  { to: '/admin/teams', label: 'Teams', icon: Users },
  { to: '/admin/players', label: 'Players', icon: UserRound },
  { to: '/admin/matches', label: 'Matches', icon: Swords },
]

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate()

  async function handleLogout() {
    await signOut()
    navigate('/admin/login')
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-5 py-5">
        <img src="/skpl-logo.png" alt="SKPL" className="h-9 w-9 rounded-md object-contain" />
        <div>
          <p className="font-display text-base font-extrabold leading-none text-white">SKPL</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-primary-300">Admin Panel</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors',
                isActive ? 'bg-white/10 text-white' : 'text-primary-300 hover:bg-white/5 hover:text-white',
              )
            }
          >
            <link.icon className="h-5 w-5" />
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-col gap-1 border-t border-white/10 px-3 py-4">
        <NavLink
          to="/"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold text-primary-300 hover:bg-white/5 hover:text-white"
        >
          <Globe className="h-5 w-5" /> View Public Site
        </NavLink>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-semibold text-primary-300 hover:bg-white/5 hover:text-white"
        >
          <LogOut className="h-5 w-5" /> Logout
        </button>
      </div>
    </div>
  )
}

export function AdminSidebar() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <aside className="hidden w-64 shrink-0 bg-primary-950 lg:block">
        <div className="sticky top-0 h-screen">
          <SidebarContent />
        </div>
      </aside>

      <div className="flex items-center justify-between border-b border-border bg-primary-950 px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <img src="/skpl-logo.png" alt="SKPL" className="h-8 w-8 rounded-md object-contain" />
          <span className="font-display text-base font-extrabold text-white">SKPL Admin</span>
        </div>
        <button className="rounded-md p-2 text-white" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu className="h-6 w-6" />
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 bg-primary-950">
            <button
              className="absolute right-3 top-3 rounded-md p-1 text-white"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  )
}
