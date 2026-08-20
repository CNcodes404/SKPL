import { Link } from 'react-router-dom'
import { Trophy, Users, UserRound, Swords, CheckCircle2, Clock, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/shared/StatCard'
import { MatchCard } from '@/components/shared/MatchCard'
import { LoadingState } from '@/components/shared/LoadingState'
import { EmptyState } from '@/components/shared/EmptyState'
import { useAsync } from '@/hooks/useAsync'
import { getLatestSeason } from '@/services/seasons'
import { listTeams } from '@/services/teams'
import { listPlayers } from '@/services/players'
import { listMatches } from '@/services/matches'

export default function AdminDashboard() {
  const { data, loading } = useAsync(async () => {
    const [season, teams, players, matches] = await Promise.all([
      getLatestSeason(),
      listTeams(true),
      listPlayers(true),
      listMatches(),
    ])

    const completed = matches.filter((m) => m.status === 'COMPLETED')
    const upcoming = matches
      .filter((m) => m.status === 'SCHEDULED')
      .sort((a, b) => new Date(a.scheduled_at ?? 0).getTime() - new Date(b.scheduled_at ?? 0).getTime())
    const recent = [...completed].sort(
      (a, b) => new Date(b.scheduled_at ?? 0).getTime() - new Date(a.scheduled_at ?? 0).getTime(),
    )

    return {
      season,
      teamsCount: teams.length,
      playersCount: players.length,
      matchesCount: matches.length,
      completedCount: completed.length,
      upcoming: upcoming.slice(0, 3),
      recent: recent.slice(0, 3),
    }
  }, [])

  if (loading) return <LoadingState rows={6} />

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-primary-900">Dashboard</h1>
        <p className="text-sm text-muted-foreground">League overview at a glance.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Active Season" value={data?.season?.name ?? 'None'} icon={Trophy} accent />
        <StatCard label="Teams" value={data?.teamsCount ?? 0} icon={Users} />
        <StatCard label="Players" value={data?.playersCount ?? 0} icon={UserRound} />
        <StatCard label="Matches" value={data?.matchesCount ?? 0} icon={Swords} />
        <StatCard label="Completed" value={data?.completedCount ?? 0} icon={CheckCircle2} />
        <StatCard label="Upcoming" value={data?.upcoming.length ?? 0} icon={Clock} />
      </div>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link to="/admin/seasons/create">
            <Plus className="h-4 w-4" /> Create Season
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/admin/teams">
            <Plus className="h-4 w-4" /> Add Team
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/admin/players">
            <Plus className="h-4 w-4" /> Add Player
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/admin/matches">
            <Plus className="h-4 w-4" /> Schedule Match
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-bold text-primary-900">Upcoming Matches</h2>
          {data && data.upcoming.length > 0 ? (
            data.upcoming.map((m) => <MatchCard key={m.id} match={m} linkTo={`/admin/matches/${m.id}`} />)
          ) : (
            <EmptyState title="No matches scheduled." />
          )}
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-bold text-primary-900">Recent Matches</h2>
          {data && data.recent.length > 0 ? (
            data.recent.map((m) => <MatchCard key={m.id} match={m} linkTo={`/admin/matches/${m.id}`} />)
          ) : (
            <EmptyState title="No completed matches yet." />
          )}
        </section>
      </div>
    </div>
  )
}
