import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Menu, X, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/matches', label: 'Matches' },
  { to: '/teams', label: 'Teams' },
  { to: '/players', label: 'Players' },
  { to: '/standings', label: 'Standings' },
  { to: '/stats', label: 'Stats' },
  { to: '/auction', label: 'Auction' },
  { to: '/about', label: 'About' },
]

export function PublicNavbar() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-primary-900/10 bg-primary-950/95 backdrop-blur">
      <div className="container flex h-16 items-center justify-between">
        <NavLink to="/" className="flex items-center gap-2">
          <img src="/skpl-logo.png" alt="SKPL" className="h-9 w-9 rounded-md object-contain" />
          <span className="font-display text-lg font-extrabold tracking-wide text-white">
            SKPL
          </span>
        </NavLink>

        <nav className="hidden items-center gap-1 lg:flex">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                cn(
                  'rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                  isActive ? 'bg-white/10 text-white' : 'text-primary-200 hover:bg-white/5 hover:text-white',
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <NavLink
            to="/admin"
            className="flex items-center gap-1.5 rounded-md bg-accent-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-accent-600"
          >
            <ShieldCheck className="h-4 w-4" /> Admin
          </NavLink>
        </div>

        <button
          className="rounded-md p-2 text-white lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open ? (
        <nav className="flex flex-col gap-1 border-t border-white/10 bg-primary-950 px-4 py-3 lg:hidden">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  'rounded-md px-3 py-2.5 text-sm font-semibold',
                  isActive ? 'bg-white/10 text-white' : 'text-primary-200',
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
          <NavLink
            to="/admin"
            onClick={() => setOpen(false)}
            className="mt-2 flex items-center justify-center gap-1.5 rounded-md bg-accent-500 px-4 py-2.5 text-sm font-bold text-white"
          >
            <ShieldCheck className="h-4 w-4" /> Admin
          </NavLink>
        </nav>
      ) : null}
    </header>
  )
}
