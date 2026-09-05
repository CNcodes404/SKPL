import { Link } from 'react-router-dom'
import { ArrowRight, Trophy, Users, Swords, Crown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { MatchCard } from '@/components/shared/MatchCard'
import { LoadingGrid } from '@/components/shared/LoadingState'
import { EmptyState } from '@/components/shared/EmptyState'
import { useAsync } from '@/hooks/useAsync'
import { getLatestSeason, getSeasonTeams } from '@/services/seasons'
import { listMatches } from '@/services/matches'
import { getPlayer } from '@/services/players'

export default function Home() {
  const { data, loading } = useAsync(async () => {
    const season = await getLatestSeason()
    const [teams, upcoming, recent] = await Promise.all([
      season ? getSeasonTeams(season.id) : Promise.resolve([]),
      season ? listMatches({ seasonId: season.id, status: 'SCHEDULED' }) : Promise.resolve([]),
      season ? listMatches({ seasonId: season.id, status: 'COMPLETED' }) : Promise.resolve([]),
    ])
    const champion = season?.champion_team_id ? teams.find((t) => t.id === season.champion_team_id) : null
    const mvp = season?.mvp_player_id ? await getPlayer(season.mvp_player_id) : null

    return {
      season,
      teamsCount: teams.length,
      upcoming: upcoming.slice(0, 3),
      recent: recent.slice(-3).reverse(),
      champion,
      mvp,
    }
  }, [])

  return (
    <div className="flex flex-col gap-14">
      <section className="relative overflow-hidden rounded-2xl bg-skpl-gradient px-6 py-16 text-center sm:px-12">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-accent-500/20 blur-3xl" />
        <div className="relative flex flex-col items-center gap-5">
          <img src="/skpl-logo.png" alt="SKPL" className="h-20 w-20 rounded-xl object-contain shadow-elevated" />
          <h1 className="font-display text-3xl font-extrabold text-white sm:text-5xl">
            Smash Karts Premier League
          </h1>
          <p className="max-w-xl text-sm text-primary-100 sm:text-base">
            The premier competitive Smash Karts tournament — teams, rivalries, and the race for the trophy.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" variant="accent">
              <Link to="/standings">
                View Standings <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to="/matches">Matches</Link>
            </Button>
          </div>
        </div>
      </section>

      {data?.season ? (
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <HighlightTile icon={Trophy} label="Current Season" value={data.season.name} />
          <HighlightTile icon={Users} label="Teams" value={data.teamsCount} />
          <HighlightTile icon={Crown} label="Champion" value={data.champion?.name ?? 'TBD'} />
          <HighlightTile icon={Swords} label="Season MVP" value={data.mvp?.name ?? 'TBD'} />
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold text-primary-900">Upcoming Matches</h2>
          <Link to="/matches" className="text-sm font-semibold text-primary-700 hover:underline">
            See all
          </Link>
        </div>
        {loading ? (
          <LoadingGrid items={3} />
        ) : data && data.upcoming.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.upcoming.map((m) => (
              <MatchCard key={m.id} match={m} linkTo="/matches" />
            ))}
          </div>
        ) : (
          <EmptyState title="No matches scheduled." icon={Swords} />
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold text-primary-900">Recent Results</h2>
          <Link to="/matches" className="text-sm font-semibold text-primary-700 hover:underline">
            See all
          </Link>
        </div>
        {loading ? (
          <LoadingGrid items={3} />
        ) : data && data.recent.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.recent.map((m) => (
              <MatchCard key={m.id} match={m} linkTo={`/matches/${m.id}`} />
            ))}
          </div>
        ) : (
          <EmptyState title="No results yet." icon={Swords} />
        )}
      </section>
    </div>
  )
}

function HighlightTile({ icon: Icon, label, value }: { icon: typeof Trophy; label: string; value: string | number }) {
  return (
    <Card className="flex flex-col items-center gap-2 p-5 text-center">
      <Icon className="h-6 w-6 text-accent-500" />
      <p className="truncate font-display text-lg font-extrabold text-primary-900">{value}</p>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    </Card>
  )
}
