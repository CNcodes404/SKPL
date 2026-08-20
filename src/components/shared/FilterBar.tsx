import { cn } from '@/lib/utils'

export function FilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3 rounded-lg border border-border bg-white p-3', className)}>
      {children}
    </div>
  )
}
