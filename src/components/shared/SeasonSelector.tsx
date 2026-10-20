import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { seasonLabel } from '@/services/tournaments'
import type { Season, Tournament } from '@/types'

export const ALL_SEASONS = 'ALL'

export function SeasonSelector({
  seasons,
  value,
  onChange,
  includeAllOption = true,
  className,
  tournaments,
}: {
  seasons: Season[]
  value: string
  onChange: (value: string) => void
  includeAllOption?: boolean
  className?: string
  /** When given and the list mixes tournaments, each season is prefixed with its tournament. */
  tournaments?: Tournament[]
}) {
  const mixed = new Set(seasons.map((s) => s.tournament_id)).size > 1
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className ?? 'w-[220px]'}>
        <SelectValue placeholder="Select season" />
      </SelectTrigger>
      <SelectContent>
        {includeAllOption ? <SelectItem value={ALL_SEASONS}>All Seasons</SelectItem> : null}
        {seasons.map((season) => (
          <SelectItem key={season.id} value={season.id}>
            {mixed ? seasonLabel(season, tournaments) : season.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
