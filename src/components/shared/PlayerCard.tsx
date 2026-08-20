import { Card } from '@/components/ui/card'
import { PlayerAvatar } from '@/components/shared/Avatar'
import { formatKD } from '@/utils/calculations'

export function PlayerCard({
  name,
  imageUrl,
  kills,
  flags,
  deaths,
}: {
  name: string
  imageUrl?: string | null
  kills: number
  flags: number
  deaths: number
}) {
  return (
    <Card className="flex flex-col items-center gap-3 p-5 text-center">
      <PlayerAvatar name={name} imageUrl={imageUrl} className="h-16 w-16 text-lg" />
      <p className="font-display text-base font-bold text-primary-900">{name}</p>
      <div className="grid w-full grid-cols-3 gap-2 border-t border-border pt-3 text-center">
        <StatCol label="Kills" value={kills} />
        <StatCol label="Flags" value={flags} />
        <StatCol label="KD" value={formatKD(kills, deaths)} />
      </div>
    </Card>
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
