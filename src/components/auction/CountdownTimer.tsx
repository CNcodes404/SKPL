import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Purely visual countdown derived from a server timestamp (bid_expires_at).
 * This is NEVER the authority on whether a player has expired — that is
 * always decided server-side (resolve_expired_player), which independently
 * re-checks clock_timestamp() against the same column plus a 1s grace
 * window. That grace window is deliberately NOT reflected here — it exists
 * to accept a bid arriving right at the boundary, not to show extra
 * visible auction time.
 */
export function CountdownTimer({
  expiresAt,
  resolving = false,
  paused = false,
  className,
}: {
  expiresAt: string | null
  resolving?: boolean
  paused?: boolean
  className?: string
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(interval)
  }, [])

  if (paused) {
    return (
      <div className={cn('text-center', className)}>
        <p className="font-display text-3xl font-extrabold text-primary-700">PAUSED</p>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Remaining time frozen</p>
      </div>
    )
  }

  if (!expiresAt) {
    return (
      <div className={cn('text-center', className)}>
        <p className="font-display text-3xl font-extrabold text-muted-foreground">--:--</p>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">No Player On Block</p>
      </div>
    )
  }

  const remainingMs = new Date(expiresAt).getTime() - now
  const expired = remainingMs <= 0

  if (expired || resolving) {
    return (
      <div className={cn('text-center', className)}>
        <p className="animate-pulse font-display text-3xl font-extrabold text-accent-600">RESOLVING…</p>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Expired</p>
      </div>
    )
  }

  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const minutes = Math.floor(remainingSeconds / 60)
  const seconds = remainingSeconds % 60
  const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  const urgent = remainingSeconds <= 5

  return (
    <div className={cn('text-center', className)}>
      <p
        className={cn(
          'font-display text-5xl font-extrabold tabular-nums',
          urgent ? 'animate-pulse text-red-600' : 'text-primary-800',
        )}
      >
        {display}
      </p>
      <p className={cn('text-xs font-semibold uppercase tracking-wide', urgent ? 'text-red-600' : 'text-muted-foreground')}>
        {urgent ? 'Closing Soon' : 'Active Bidding'}
      </p>
    </div>
  )
}
