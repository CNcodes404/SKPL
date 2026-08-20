import { Link } from 'react-router-dom'
import { ArrowRight, Trophy } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { TeamLogo } from '@/components/shared/Avatar'
import type { Team } from '@/types'

export function TeamCard({ team, championships }: { team: Team; championships: number }) {
  return (
    <Link to={`/teams/${team.id}`}>
      <Card className="group flex h-full flex-col items-center gap-3 p-6 text-center transition-all hover:-translate-y-1 hover:shadow-elevated">
        <TeamLogo name={team.name} logoUrl={team.logo_url} className="h-20 w-20 text-2xl" />
        <div>
          <p className="font-display text-lg font-bold text-primary-900">{team.name}</p>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{team.short_name}</p>
        </div>
        {championships > 0 ? (
          <div className="flex items-center gap-1 rounded-full bg-accent-100 px-3 py-1 text-xs font-bold text-accent-700">
            <Trophy className="h-3.5 w-3.5" />
            {championships}× Champion{championships > 1 ? 's' : ''}
          </div>
        ) : null}
        <span className="mt-auto flex items-center gap-1 text-sm font-semibold text-primary-700 opacity-0 transition-opacity group-hover:opacity-100">
          View Team <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </Card>
    </Link>
  )
}
