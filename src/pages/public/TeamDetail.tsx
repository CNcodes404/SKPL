import { useParams } from 'react-router-dom'
import { Trophy, Percent, Skull, Flag } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TeamLogo } from '@/components/shared/Avatar'
import { PlayerCard } from '@/components/shared/PlayerCard'
import { SeasonSelector, ALL_SEASONS } from '@/components/shared/SeasonSelector'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { useAsync } from '@/hooks/useAsync'
import { useSeasonFilter } from '@/hooks/useSeasonFilter'
import { getTeam, getTeamSquad, countChampionships } from '@/services/teams'
import { getPlayersCareerStats } from '@/services/players'
import { listMatchesRaw, listStatsForSeason, listAllStats } from '@/services/matches'
import { listTeams } from '@/services/teams'
import { getSeasonTeams } from '@/services/seasons'
import { calculateTeamStats, calculateWinRate } from '@/utils/calculations'

export default function TeamDetail() {
  const { teamId = '' } = useParams()
  const { seasons, selected, setSelected } = useSeasonFilter()

  const { data: base, loading: baseLoading, error: baseError } = useAsync(async () => {
    const [team, championships, squad] = await Promise.all([
      getTeam(teamId),
      countChampionships(teamId),
      getTeamSquad(teamId),
    ])
    if (!team) return { team: null, championships: 0, squad: [], careerStats: {} }
    const careerStats = await getPlayersCareerStats(squad.map((s) => s.player.id))
    return { team, championships, squad, careerStats }
  }, [teamId])

  const { data: seasonStats, loading: statsLoading } = useAsync(async () => {
    if (!selected) return null

    const isAll = selected === ALL_SEASONS
    const [teams, matches, stats] = await Promise.all([
      isAll ? listTeams(true) : getSeasonTeams(selected),
      isAll ? listMatchesRaw() : listMatchesRaw(selected),
      isAll ? listAllStats() : listStatsForSeason(selected),
    ])

    const allTeamStats = calculateTeamStats(teams, matches, stats)
    const mine = allTeamStats.find((s) => s.team.id === teamId)
    if (!mine) return null

    const byWins = [...allTeamStats].sort((a, b) => b.wins - a.wins)
    const winsRank = byWins.findIndex((s) => s.team.id === teamId) + 1
    const byKills = [...allTeamStats].sort((a, b) => b.kills - a.kills)
    const killsRank = byKills.findIndex((s) => s.team.id === teamId) + 1

    return { mine, winsRank, killsRank, totalTeams: allTeamStats.length }
  }, [selected, teamId])

  if (baseLoading) return <LoadingState rows={6} />
  if (baseError || !base?.team) return <ErrorState message="Team not found." />

  const { team, championships, squad, careerStats } = base

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-3 rounded-xl bg-skpl-gradient p-8 text-center sm:flex-row sm:text-left">
        <TeamLogo name={team.name} logoUrl={team.logo_url} className="h-24 w-24 shrink-0 text-3xl" />
        <div>
          <h1 className="font-display text-3xl font-extrabold text-white">{team.name}</h1>
          <p className="text-sm font-semibold uppercase tracking-wide text-primary-200">{team.short_name}</p>
          {championships > 0 ? (
            <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-accent-500 px-3 py-1 text-xs font-bold text-white">
              <Trophy className="h-3.5 w-3.5" /> {championships}× Champion{championships > 1 ? 's' : ''}
            </div>
          ) : null}
          {team.description ? <p className="mt-2 max-w-lg text-sm text-primary-100">{team.description}</p> : null}
        </div>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl font-bold text-primary-900">Squad</h2>
        {squad.length === 0 ? (
          <EmptyState title="No squad on record yet." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {squad.map(({ player }) => {
              const stats = careerStats[player.id] ?? { kills: 0, deaths: 0, flags: 0 }
              return (
                <PlayerCard
                  key={player.id}
                  playerId={player.id}
                  name={player.name}
                  imageUrl={player.image_url}
                  role={player.role}
                  kills={stats.kills}
                  deaths={stats.deaths}
                  flags={stats.flags}
                />
              )
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-bold text-primary-900">Season Statistics</h2>
          <SeasonSelector seasons={seasons} value={selected} onChange={setSelected} />
        </div>

        {statsLoading ? (
          <LoadingState rows={3} />
        ) : !seasonStats ? (
          <EmptyState title="No statistics available for this season." />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Percent className="h-4 w-4 text-primary-600" /> Wins / Losses
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <Stat label="Wins" value={seasonStats.mine.wins} />
                <Stat label="Losses" value={seasonStats.mine.losses} />
                <Stat label="Win Rate" value={`${calculateWinRate(seasonStats.mine.wins, seasonStats.mine.matchesPlayed)}%`} />
                <Stat label="Rank" value={`#${seasonStats.winsRank} / ${seasonStats.totalTeams}`} />
                <Stat label="Highest Win Margin" value={seasonStats.mine.highestWinMargin} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Skull className="h-4 w-4 text-primary-600" /> Kills
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <Stat label="Total Kills" value={seasonStats.mine.kills} />
                <Stat label="Rank" value={`#${seasonStats.killsRank} / ${seasonStats.totalTeams}`} />
                <Stat label="Most in a Match" value={seasonStats.mine.mostKillsInMatch} />
                <Stat label="Least in a Match" value={seasonStats.mine.leastKillsInMatch} />
                <Stat
                  label="Average / Match"
                  value={
                    seasonStats.mine.matchesPlayed
                      ? Math.round((seasonStats.mine.kills / seasonStats.mine.matchesPlayed) * 100) / 100
                      : 0
                  }
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Flag className="h-4 w-4 text-primary-600" /> Flags
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <Stat label="Total Flags" value={seasonStats.mine.flags} />
                <Stat
                  label="Average / Match"
                  value={
                    seasonStats.mine.matchesPlayed
                      ? Math.round((seasonStats.mine.flags / seasonStats.mine.matchesPlayed) * 100) / 100
                      : 0
                  }
                />
                <Stat label="Minimum" value={seasonStats.mine.minFlags} />
                <Stat label="Maximum" value={seasonStats.mine.maxFlags} />
              </CardContent>
            </Card>
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="font-display text-xl font-extrabold text-primary-800">{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  )
}
