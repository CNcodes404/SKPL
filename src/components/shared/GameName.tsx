import { Gamepad2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A player's Smash Karts in-game name, shown next to their registered name so
 * teams can recognise them. Renders nothing if it isn't set or is the same
 * as the registered name.
 */
export function GameName({
  player,
  className,
  icon = true,
}: {
  player: { name: string; game_name: string | null }
  className?: string
  icon?: boolean
}) {
  const gameName = player.game_name?.trim()
  if (!gameName || gameName.toLowerCase() === player.name.trim().toLowerCase()) return null
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium text-muted-foreground', className)}>
      {icon ? <Gamepad2 className="h-3 w-3 shrink-0" /> : null}
      <span className="truncate">{gameName}</span>
    </span>
  )
}
