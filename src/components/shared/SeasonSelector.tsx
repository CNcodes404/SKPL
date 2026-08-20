import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Season } from '@/types'

export const ALL_SEASONS = 'ALL'

export function SeasonSelector({
  seasons,
  value,
  onChange,
  includeAllOption = true,
  className,
}: {
  seasons: Season[]
  value: string
  onChange: (value: string) => void
  includeAllOption?: boolean
  className?: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className ?? 'w-[200px]'}>
        <SelectValue placeholder="Select season" />
      </SelectTrigger>
      <SelectContent>
        {includeAllOption ? <SelectItem value={ALL_SEASONS}>All Seasons</SelectItem> : null}
        {seasons.map((season) => (
          <SelectItem key={season.id} value={season.id}>
            {season.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
