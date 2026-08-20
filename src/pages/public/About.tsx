import { Link } from 'react-router-dom'
import { Trophy, Crown, Skull, Flag, Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LoadingState } from '@/components/shared/LoadingState'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { useAsync } from '@/hooks/useAsync'
import { listSeasons } from '@/services/seasons'
import { listTeams } from '@/services/teams'
import { getPlayer } from '@/services/players'
import { getPlayerStatsForScope } from '@/services/stats'

export default function About() {
  const { data, loading, error } = useAsync(async () => {
    const [seasons, teams] = await Promise.all([listSeasons(), listTeams(true)])
    const teamById = new Map(teams.map((t) => [t.id, t]))

    const seasonDetails = await Promise.all(
      seasons.map(async (season) => {
        const playerStats = await getPlayerStatsForScope(season.id)
        const mvp = season.mvp_player_id ? await getPlayer(season.mvp_player_id) : null
        const topKiller = [...playerStats].sort((a, b) => b.kills - a.kills)[0]
        const topFlagger = [...playerStats].sort((a, b) => b.flags - a.flags)[0]

        return {
          season,
          champion: season.champion_team_id ? teamById.get(season.champion_team_id) ?? null : null,
          mvp,
          topKiller: topKiller && topKiller.kills > 0 ? topKiller : null,
          topFlagger: topFlagger && topFlagger.flags > 0 ? topFlagger : null,
        }
      }),
    )

    return seasonDetails
  }, [])

  return (
    <div className="flex flex-col gap-10">
      <section className="rounded-xl bg-skpl-gradient p-8 text-center text-white sm:p-12">
        <img src="/skpl-logo.png" alt="SKPL" className="mx-auto mb-4 h-16 w-16 rounded-lg object-contain" />
        <h1 className="font-display text-3xl font-extrabold sm:text-4xl">About SKPL</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-primary-100 sm:text-base">
          The Smash Karts Premier League is a competitive team-based tournament where the best Smash Karts
          rosters battle across a full regular season and a knockout playoff for the title of League Champion.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl font-bold text-primary-900">Seasons</h2>

        {loading ? (
          <LoadingState rows={3} />
        ) : error ? (
          <ErrorState message="Unable to load season information." />
        ) : !data || data.length === 0 ? (
          <EmptyState title="No seasons created yet." icon={Info} />
        ) : (
          <div className="flex flex-col gap-4">
            {data.map(({ season, champion, mvp, topKiller, topFlagger }) => (
              <Card key={season.id}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle>{season.name}</CardTitle>
                  <Badge variant={season.status === 'ACTIVE' ? 'success' : 'outline'}>{season.status}</Badge>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <InfoTile icon={Trophy} label="Champion" value={champion?.name} link={champion ? `/teams/${champion.id}` : undefined} />
                  <InfoTile icon={Crown} label="Tournament MVP" value={mvp?.name} />
                  <InfoTile icon={Skull} label="Top Killer" value={topKiller ? `${topKiller.player.name} (${topKiller.kills})` : undefined} />
                  <InfoTile icon={Flag} label="Top Flagger" value={topFlagger ? `${topFlagger.player.name} (${topFlagger.flags})` : undefined} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function InfoTile({
  icon: Icon,
  label,
  value,
  link,
}: {
  icon: typeof Trophy
  label: string
  value?: string
  link?: string
}) {
  const content = (
    <div className="flex flex-col items-center gap-1 rounded-lg bg-secondary/50 p-3 text-center">
      <Icon className="h-4 w-4 text-accent-500" />
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-bold text-primary-900">{value ?? 'TBD'}</p>
    </div>
  )
  return link ? <Link to={link}>{content}</Link> : content
}
