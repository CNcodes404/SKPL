import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ALL_TOURNAMENTS } from '@/services/tournaments'
import type { Tournament } from '@/types'

export function TournamentSelector({
  tournaments,
  value,
  onChange,
  includeAllOption = true,
  className,
}: {
  tournaments: Tournament[]
  value: string
  onChange: (value: string) => void
  includeAllOption?: boolean
  className?: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className ?? 'w-[240px]'}>
        <SelectValue placeholder="Select tournament" />
      </SelectTrigger>
      <SelectContent>
        {includeAllOption ? <SelectItem value={ALL_TOURNAMENTS}>All Tournaments</SelectItem> : null}
        {tournaments.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
