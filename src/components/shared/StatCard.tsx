import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function StatCard({
  label,
  value,
  icon: Icon,
  accent = false,
  className,
}: {
  label: string
  value: string | number
  icon?: LucideIcon
  accent?: boolean
  className?: string
}) {
  return (
    <Card className={cn('flex items-center gap-4 p-5', className)}>
      {Icon ? (
        <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', accent ? 'bg-accent-100 text-accent-600' : 'bg-primary-100 text-primary-700')}>
          <Icon className="h-5 w-5" />
        </div>
      ) : null}
      <div>
        <p className="font-display text-2xl font-extrabold leading-tight text-primary-900">{value}</p>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
    </Card>
  )
}
