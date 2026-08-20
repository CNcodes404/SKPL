import { Badge } from '@/components/ui/badge'
import type { MatchStatus } from '@/types'

const STYLES: Record<MatchStatus, { label: string; variant: 'default' | 'success' | 'destructive' | 'outline' }> = {
  SCHEDULED: { label: 'Scheduled', variant: 'default' },
  COMPLETED: { label: 'Completed', variant: 'success' },
  CANCELLED: { label: 'Cancelled', variant: 'destructive' },
}

export function StatusBadge({ status }: { status: MatchStatus }) {
  const style = STYLES[status]
  return <Badge variant={style.variant}>{style.label}</Badge>
}
