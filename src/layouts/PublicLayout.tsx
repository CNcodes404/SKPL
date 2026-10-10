import { Outlet } from 'react-router-dom'
import { PublicNavbar } from '@/components/layout/PublicNavbar'
import { PublicFooter } from '@/components/layout/PublicFooter'
import { LiveMatchesProvider } from '@/context/LiveMatchesContext'

export function PublicLayout() {
  return (
    <LiveMatchesProvider>
      <div className="flex min-h-screen flex-col bg-background">
        <PublicNavbar />
        <main className="container flex-1 py-8">
          <Outlet />
        </main>
        <PublicFooter />
      </div>
    </LiveMatchesProvider>
  )
}
