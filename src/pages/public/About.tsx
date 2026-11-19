import { Link } from 'react-router-dom'
import { Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PlayerAvatar, TeamLogo } from '@/components/shared/Avatar'
import { TournamentSelector } from '@/components/shared/TournamentSelector'
import { LoadingState } from '@/components/shared/LoadingState'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { useAsync } from '@/hooks/useAsync'
import { useUrlState } from '@/hooks/useUrlState'
import { listSeasons } from '@/services/seasons'
import { listTeams } from '@/services/teams'
import { getPlayer } from '@/services/players'
import { getPlayerStatsForScope } from '@/services/stats'
import { ALL_TOURNAMENTS, listTournaments } from '@/services/tournaments'
import { formatKD } from '@/utils/calculations'

const AVATAR_CLASS = 'h-14 w-14 shrink-0 rounded-md text-lg'

export default function About() {
  const { data, loading, error } = useAsync(
    async () => {
      const [seasons, teams, tournaments] = await Promise.all([listSeasons(), listTeams(true), listTournaments()])
      const teamById = new Map(teams.map((t) => [t.id, t]))

      const seasonDetails = await Promise.all(
        seasons.map(async (season) => {
          const playerStats = await getPlayerStatsForScope(season.id)
          const mvp = season.mvp_player_id ? await getPlayer(season.mvp_player_id) : null
          const mvpStats = mvp ? playerStats.find((p) => p.player.id === mvp.id) ?? null : null
          const topKiller = [...playerStats].sort((a, b) => b.kills - a.kills)[0]
          const topFlagger = [...playerStats].sort((a, b) => b.flags - a.flags)[0]

          return {
            season,
            champion: season.champion_team_id ? teamById.get(season.champion_team_id) ?? null : null,
            mvp,
            mvpStats,
            topKiller: topKiller && topKiller.kills > 0 ? topKiller : null,
            topFlagger: topFlagger && topFlagger.flags > 0 ? topFlagger : null,
          }
        }),
      )

      return { tournaments, seasons: seasonDetails }
    },
    [],
    { cache: 'about' },
  )

  // Opens on the first tournament (SKCTF League); "All Tournaments" stays selectable.
  const [chosen, setTournament] = useUrlState<string>('tournament', '')
  const tournament = chosen || data?.tournaments[0]?.id || ALL_TOURNAMENTS
  const visible = (data?.seasons ?? []).filter(
    (d) => tournament === ALL_TOURNAMENTS || d.season.tournament_id === tournament,
  )

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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-bold text-primary-900">Seasons</h2>
          <TournamentSelector tournaments={data?.tournaments ?? []} value={tournament} onChange={setTournament} />
        </div>

        {loading ? (
          <LoadingState rows={3} />
        ) : error ? (
          <ErrorState message="Unable to load season information." />
        ) : visible.length === 0 ? (
          <EmptyState title="No seasons yet." icon={Info} />
        ) : (
          <div className="flex flex-col gap-6">
            {visible.map(({ season, champion, mvp, mvpStats, topKiller, topFlagger }) => (
              <Card key={season.id}>
                <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                  <CardTitle>{season.name}</CardTitle>
                  <Badge variant={season.status === 'ACTIVE' ? 'success' : 'outline'}>{season.status}</Badge>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                  {season.description ? (
                    <p className="text-sm leading-relaxed text-muted-foreground">{season.description}</p>
                  ) : null}

                  <div>
                    <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-primary-800">
                      Winners &amp; Player Facts
                    </h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <FactCard
                        label="Champion"
                        href={champion ? `/teams/${champion.id}` : undefined}
                        name={champion?.name}
                        image={
                          <TeamLogo
                            name={champion?.name ?? '?'}
                            logoUrl={champion?.logo_url}
                            className={`${AVATAR_CLASS} bg-white/10`}
                          />
                        }
                      />
                      <FactCard
                        label="MVP"
                        href={mvp ? `/players/${mvp.id}` : undefined}
                        name={mvp?.name}
                        image={<PlayerAvatar name={mvp?.name ?? '?'} imageUrl={mvp?.image_url} className={AVATAR_CLASS} />}
                        teamName={mvpStats?.team?.name}
                        stat={
                          mvpStats
                            ? `${mvpStats.kills} kills · ${mvpStats.flags} flags · ${formatKD(mvpStats.kills, mvpStats.deaths)} KD`
                            : undefined
                        }
                      />
                      <FactCard
                        label="Top Killer"
                        href={topKiller ? `/players/${topKiller.player.id}` : undefined}
                        name={topKiller?.player.name}
                        image={
                          <PlayerAvatar
                            name={topKiller?.player.name ?? '?'}
                            imageUrl={topKiller?.player.image_url}
                            className={AVATAR_CLASS}
                          />
                        }
                        teamName={topKiller?.team?.name}
                        stat={topKiller ? `${topKiller.kills} kills` : undefined}
                      />
                      <FactCard
                        label="Top Flagger"
                        href={topFlagger ? `/players/${topFlagger.player.id}` : undefined}
                        name={topFlagger?.player.name}
                        image={
                          <PlayerAvatar
                            name={topFlagger?.player.name ?? '?'}
                            imageUrl={topFlagger?.player.image_url}
                            className={AVATAR_CLASS}
                          />
                        }
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

function FactCard({
  label,
  href,
  name,
  image,
  teamName,
  stat,
}: {
  label: string
  href?: string
  name?: string
  image: React.ReactNode
  teamName?: string | null
  stat?: string
}) {
  const content = (
    <div className="flex h-full items-center gap-3 overflow-hidden rounded-lg bg-skpl-gradient-soft p-3">
      {image}
      <div className="min-w-0">
        <p className="border-b border-white/30 pb-1 text-[11px] font-bold uppercase tracking-wide text-accent-200">
          {label}
        </p>
        <p className="truncate pt-1 font-display text-sm font-extrabold text-white">{name ?? 'TBD'}</p>
        {teamName ? <p className="truncate text-xs text-primary-100">From {teamName}</p> : null}
        {stat ? <p className="text-[11px] font-semibold text-accent-200">{stat}</p> : null}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col overflow-hidden rounded-lg shadow-card">
      {href ? (
        <Link to={href} className="flex-1">
          {content}
        </Link>
      ) : (
        <div className="flex-1">{content}</div>
      )}
      <div className="h-1 bg-accent-500" />
    </div>
  )
}
