import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PlayerAvatar } from '@/components/shared/Avatar'

export interface LeaderboardEntry {
  id: string
  name: string
  teamName?: string | null
  value: string
}

export function LeaderboardCard({
  title,
  entries,
  viewAllTo,
  entryHref,
}: {
  title: string
  entries: LeaderboardEntry[]
  viewAllTo: string
  entryHref?: (entry: LeaderboardEntry) => string
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-1">
        {entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No data yet.</p>
        ) : (
          entries.slice(0, 5).map((entry, i) => {
            const row = (
              <div className="flex items-center gap-3 rounded-md px-1 py-2 hover:bg-secondary/50">
                <span className={`w-5 text-center font-display text-sm font-extrabold ${i === 0 ? 'text-accent-500' : 'text-muted-foreground'}`}>
                  {i + 1}
                </span>
                <PlayerAvatar name={entry.name} className="h-8 w-8 text-xs" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-primary-900">{entry.name}</p>
                  {entry.teamName ? <p className="truncate text-xs text-muted-foreground">{entry.teamName}</p> : null}
                </div>
                <span className="font-display text-sm font-bold text-primary-800">{entry.value}</span>
              </div>
            )
            return entryHref ? (
              <Link key={entry.id} to={entryHref(entry)}>
                {row}
              </Link>
            ) : (
              <div key={entry.id}>{row}</div>
            )
          })
        )}
        <Link
          to={viewAllTo}
          className="mt-3 flex items-center justify-center gap-1 rounded-md border border-border py-2 text-sm font-semibold text-primary-700 hover:bg-primary-50"
        >
          View Full List <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardContent>
    </Card>
  )
}
