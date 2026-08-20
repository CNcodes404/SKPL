import { Outlet } from 'react-router-dom'
import { PublicNavbar } from '@/components/layout/PublicNavbar'
import { PublicFooter } from '@/components/layout/PublicFooter'

export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicNavbar />
      <main className="container flex-1 py-8">
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  )
}
