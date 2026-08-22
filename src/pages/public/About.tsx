import { Link } from 'react-router-dom'
import { Trophy, Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PlayerAvatar } from '@/components/shared/Avatar'
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
        const mvpTeam = mvp ? playerStats.find((p) => p.player.id === mvp.id)?.team ?? null : null
        const topKiller = [...playerStats].sort((a, b) => b.kills - a.kills)[0]
        const topFlagger = [...playerStats].sort((a, b) => b.flags - a.flags)[0]

        return {
          season,
          champion: season.champion_team_id ? teamById.get(season.champion_team_id) ?? null : null,
          mvp,
          mvpTeam,
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
          <div className="flex flex-col gap-6">
            {data.map(({ season, champion, mvp, mvpTeam, topKiller, topFlagger }) => (
              <Card key={season.id}>
                <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                  <CardTitle>{season.name}</CardTitle>
                  <div className="flex items-center gap-2">
                    {champion ? (
                      <Link
                        to={`/teams/${champion.id}`}
                        className="flex items-center gap-1.5 rounded-full bg-accent-100 px-3 py-1 text-xs font-bold text-accent-700"
                      >
                        <Trophy className="h-3.5 w-3.5" />
                        {champion.name}
                      </Link>
                    ) : null}
                    <Badge variant={season.status === 'ACTIVE' ? 'success' : 'outline'}>{season.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                  {season.description ? (
                    <p className="text-sm leading-relaxed text-muted-foreground">{season.description}</p>
                  ) : null}

                  <div>
                    <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-primary-800">
                      Player Facts
                    </h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <PlayerFactCard
                        label="MVP"
                        playerId={mvp?.id}
                        name={mvp?.name}
                        imageUrl={mvp?.image_url}
                        teamName={mvpTeam?.name}
                      />
                      <PlayerFactCard
                        label="Top Killer"
                        playerId={topKiller?.player.id}
                        name={topKiller?.player.name}
                        imageUrl={topKiller?.player.image_url}
                        teamName={topKiller?.team?.name}
                        stat={topKiller ? `${topKiller.kills} kills` : undefined}
                      />
                      <PlayerFactCard
                        label="Top Flagger"
                        playerId={topFlagger?.player.id}
                        name={topFlagger?.player.name}
                        imageUrl={topFlagger?.player.image_url}
                        teamName={topFlagger?.team?.name}
                        stat={topFlagger ? `${topFlagger.flags} flags` : undefined}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function PlayerFactCard({
  label,
  playerId,
  name,
  imageUrl,
  teamName,
  stat,
}: {
  label: string
  playerId?: string
  name?: string
  imageUrl?: string | null
  teamName?: string | null
  stat?: string
}) {
  const content = (
    <div className="flex items-center gap-3 overflow-hidden rounded-lg bg-skpl-gradient-soft p-3">
      <PlayerAvatar name={name ?? '?'} imageUrl={imageUrl} className="h-14 w-14 shrink-0 rounded-md text-lg" />
      <div className="min-w-0">
        <p className="border-b border-white/30 pb-1 text-[11px] font-bold uppercase tracking-wide text-accent-200">
          {label}
        </p>
        <p className="truncate pt-1 font-display text-sm font-extrabold text-white">{name ?? 'TBD'}</p>
        {teamName ? <p className="truncate text-xs text-primary-100">From {teamName}</p> : null}
        {stat ? <p className="truncate text-[11px] font-semibold text-accent-200">{stat}</p> : null}
      </div>
    </div>
  )

  return (
    <div className="overflow-hidden rounded-lg shadow-card">
      {playerId ? <Link to={`/players/${playerId}`}>{content}</Link> : content}
      <div className="h-1 bg-accent-500" />
    </div>
  )
}
