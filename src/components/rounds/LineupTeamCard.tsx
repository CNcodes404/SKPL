import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { PlayerAvatar, TeamLogo } from '@/components/shared/Avatar'
import { cn } from '@/lib/utils'
import type { Player, Team } from '@/types'

export interface PickablePlayer {
  player: Player
  /** Short name of the team this player is currently on, if any. Picking them moves them. */
  assignedTo?: string | null
}

/** Search box listing players to add. Shows where a player currently is, so a pick can move them. */
export function PlayerSearchPicker({
  candidates,
  onPick,
  placeholder = 'Add player…',
  disabled,
}: {
  candidates: PickablePlayer[]
  onPick: (player: Player) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? candidates.filter(
          ({ player }) => player.name.toLowerCase().includes(q) || (player.game_name ?? '').toLowerCase().includes(q),
        )
      : candidates
    // Free players first, then players on other teams.
    return [...list].sort((a, b) => Number(!!a.assignedTo) - Number(!!b.assignedTo) || a.player.name.localeCompare(b.player.name))
  }, [candidates, query])

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        className="h-9 pl-8 text-sm"
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && !disabled ? (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-white shadow-elevated">
          {matches.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">No players found.</p>
          ) : (
            matches.slice(0, 40).map(({ player, assignedTo }) => (
              <button
                key={player.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(player)
                  setQuery('')
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-secondary"
              >
                <PlayerAvatar name={player.name} imageUrl={player.image_url} className="h-6 w-6 text-[9px]" />
                <span className="truncate font-medium text-primary-900">{player.name}</span>
                {player.game_name && player.game_name.trim().toLowerCase() !== player.name.trim().toLowerCase() ? (
                  <span className="truncate text-xs text-muted-foreground">({player.game_name})</span>
                ) : null}
                {assignedTo ? (
                  <span className="ml-auto shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    move from {assignedTo}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

/** One team's lineup: its players as removable rows, plus a picker to add more. */
export function LineupTeamCard({
  team,
  players,
  required,
  candidates,
  onAdd,
  onRemove,
  readOnly,
  footer,
  highlight,
}: {
  team: Team
  players: Player[]
  /** Expected number of players; shows a count badge and colours it when off. */
  required?: number | null
  candidates?: PickablePlayer[]
  onAdd?: (player: Player) => void
  onRemove?: (playerId: string) => void
  readOnly?: boolean
  footer?: React.ReactNode
  highlight?: boolean
}) {
  const countOk = !required || players.length === required
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border bg-white p-3',
        highlight ? 'border-primary-600 ring-2 ring-primary-200' : 'border-border',
      )}
    >
      <div className="flex items-center gap-2">
        <TeamLogo name={team.name} logoUrl={team.logo_url} className="h-8 w-8 text-[10px]" />
        <p className="min-w-0 flex-1 truncate font-display font-bold text-primary-900">{team.name}</p>
        <Badge variant={countOk ? 'outline' : 'destructive'}>
          {players.length}
          {required ? ` / ${required}` : ''} players
        </Badge>
      </div>

      {players.length === 0 ? (
        <p className="text-xs text-muted-foreground">No players yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {players.map((player) => (
            <li key={player.id} className="flex items-center gap-2 rounded-md bg-secondary/40 px-2 py-1 text-sm">
              <PlayerAvatar name={player.name} imageUrl={player.image_url} className="h-6 w-6 text-[9px]" />
              <span className="min-w-0 flex-1 truncate font-medium text-primary-900">{player.name}</span>
              {!readOnly && onRemove ? (
                <button
                  type="button"
                  onClick={() => onRemove(player.id)}
                  className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-destructive"
                  aria-label={`Remove ${player.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && onAdd && candidates ? <PlayerSearchPicker candidates={candidates} onPick={onAdd} /> : null}
      {footer}
    </div>
  )
}
