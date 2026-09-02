import { Link } from 'react-router-dom'
import { Crown } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { PlayerAvatar } from '@/components/shared/Avatar'
import { formatKD } from '@/utils/calculations'
import { PLAYER_ROLE_LABELS, type PlayerRole } from '@/types'

export function PlayerCard({
  playerId,
  name,
  imageUrl,
  role,
  isCaptain,
  kills,
  flags,
  deaths,
  tier,
}: {
  playerId: string
  name: string
  imageUrl?: string | null
  role?: PlayerRole | null
  isCaptain?: boolean
  kills: number
  flags: number
  deaths: number
  /** Optional — shown as a small badge when the caller wants Tier visible (e.g. a rating-sorted list). */
  tier?: string | null
}) {
  return (
    <Link to={`/players/${playerId}`}>
      <Card className="flex h-full flex-col items-center gap-3 p-5 text-center transition-all hover:-translate-y-1 hover:shadow-elevated">
        <div className="relative">
          <PlayerAvatar name={name} imageUrl={imageUrl} className="h-16 w-16 text-lg" />
          {isCaptain ? (
            <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent-500 text-white shadow-card" title="Captain">
              <Crown className="h-3.5 w-3.5" />
            </span>
          ) : null}
        </div>
        <div>
          <p className="font-display text-base font-bold text-primary-900">{name}</p>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {role ? (
              <p className="text-xs font-semibold uppercase tracking-wide text-accent-600">{PLAYER_ROLE_LABELS[role]}</p>
            ) : null}
            {tier ? (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-primary-700">{tier}</span>
            ) : null}
          </div>
        </div>
        <div className="grid w-full grid-cols-3 gap-2 border-t border-border pt-3 text-center">
          <StatCol label="Kills" value={kills} />
          <StatCol label="Flags" value={flags} />
          <StatCol label="KD" value={formatKD(kills, deaths)} />
        </div>
      </Card>
    </Link>
  )
}

function StatCol({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="font-display text-lg font-extrabold text-primary-800">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  )
}
