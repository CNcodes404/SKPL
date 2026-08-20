import { Outlet } from 'react-router-dom'
import { AdminSidebar } from '@/components/layout/AdminSidebar'

export function AdminLayout() {
  return (
    <div className="flex min-h-screen bg-secondary/40">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
