import { useParams } from 'react-router-dom'
import { Trophy, Percent, Skull, Flag } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TeamLogo } from '@/components/shared/Avatar'
import { PlayerCard } from '@/components/shared/PlayerCard'
import { SeasonSelector, ALL_SEASONS } from '@/components/shared/SeasonSelector'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { useAsync } from '@/hooks/useAsync'
import { useSeasonFilter } from '@/hooks/useSeasonFilter'
import { getTeam, listTeams, getTeamHistoricalSquad } from '@/services/teams'
import { getPlayersCareerStats, listPlayers } from '@/services/players'
import { listMatchesRaw, listStatsForSeason, listAllStats } from '@/services/matches'
import { getSeasonTeams } from '@/services/seasons'
import { getPlayerStatsForScope } from '@/services/stats'
import { computePlayerIndices } from '@/services/auctionValuation'
import { computePlayerTier } from '@/utils/playerTier'
import { calculateTeamStats, calculateWinRate, calculateKD, average } from '@/utils/calculations'
import type { PlayerSeasonStats } from '@/types'

export default function TeamDetail() {
  const { teamId = '' } = useParams()
  const { seasons, selected, setSelected, selectedSeason } = useSeasonFilter()
  const isAll = selected === ALL_SEASONS

  const { data: base, loading: baseLoading, error: baseError } = useAsync(async () => {
    const team = await getTeam(teamId)
    return { team }
  }, [teamId])

  const { data: seasonData, loading: statsLoading } = useAsync(async () => {
    if (!selected) return null

    const [teams, matches, stats, playerStats] = await Promise.all([
      isAll ? listTeams(true) : getSeasonTeams(selected),
      isAll ? listMatchesRaw() : listMatchesRaw(selected),
      isAll ? listAllStats() : listStatsForSeason(selected),
      isAll ? Promise.resolve<PlayerSeasonStats[]>([]) : getPlayerStatsForScope(selected),
    ])

    // Team Statistics: every completed match, regardless of match type.
    const allTeamStats = calculateTeamStats(teams, matches, stats, { includeAllMatchTypes: true })
    const mine = allTeamStats.find((s) => s.team.id === teamId)
    if (!mine) return null

    // Ranking must stay regular-season-only, independent of the Team
    // Statistics totals above — a separate calculateTeamStats() call with
    // its default (no options) scope.
    const standingsTeamStats = calculateTeamStats(teams, matches, stats)
    const byWins = [...standingsTeamStats].sort((a, b) => b.wins - a.wins)
    const winsRank = byWins.findIndex((s) => s.team.id === teamId) + 1
    const byKills = [...standingsTeamStats].sort((a, b) => b.kills - a.kills)
    const killsRank = byKills.findIndex((s) => s.team.id === teamId) + 1

    const seasonSquad = isAll ? [] : playerStats.filter((p) => p.team?.id === teamId)

    return { mine, winsRank, killsRank, totalTeams: allTeamStats.length, seasonSquad }
  }, [selected, teamId, isAll])

  // Rating/Tier are career-wide and normalized against every player in the
  // league, fetched once independent of the season filter, roster, or
  // squad branch — the same player shows the same grade everywhere.
  const { data: leagueGrades } = useAsync(async () => {
    const allPlayers = await listPlayers(true)
    const [careerStats, ratings] = await Promise.all([
      getPlayersCareerStats(allPlayers.map((p) => p.id)),
      computePlayerIndices(allPlayers),
    ])
    const result: Record<string, { rating: number | null; tier: string | null }> = {}
    for (const p of allPlayers) {
      const totals = careerStats[p.id]
      const raw = totals ? { kd: calculateKD(totals.kills, totals.deaths), flagsPerMatch: average(totals.flags, totals.matchesPlayed) } : null
      const tier = computePlayerTier(p.role, raw, totals?.matchesPlayed ?? 0)
      result[p.id] = { rating: ratings[p.id]?.player_index ?? null, tier: tier?.label ?? null }
    }
    return result
  }, [])

  // Historical (All Seasons) squad: every player who ever represented this
  // team, deduped, sorted by the existing auction Rating.
  const { data: historicalSquad, loading: historicalSquadLoading } = useAsync(async () => {
    if (!isAll || !leagueGrades) return null
    const roster = await getTeamHistoricalSquad(teamId)
    if (roster.length === 0) return []

    const careerStats = await getPlayersCareerStats(roster.map((r) => r.player.id))

    return roster
      .map((r) => {
        const stats = careerStats[r.player.id] ?? { kills: 0, deaths: 0, flags: 0, matchesPlayed: 0 }
        const grade = leagueGrades[r.player.id]
        return {
          player: r.player,
          kills: stats.kills,
          deaths: stats.deaths,
          flags: stats.flags,
          rating: grade?.rating ?? null,
          tier: grade?.tier ?? null,
        }
      })
      .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))
  }, [isAll, teamId, leagueGrades])

  if (baseLoading) return <LoadingState rows={6} />
  if (baseError || !base?.team) return <ErrorState message="Team not found." />

  const { team } = base
  const isChampion = Boolean(selectedSeason && selectedSeason.champion_team_id === teamId)
  // Team-level historical fact — derived from every season's champion_team_id,
  // deliberately independent of `selected` so it never changes with the filter.
  const championSeasons = seasons.filter((s) => s.champion_team_id === teamId)

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-3 rounded-xl bg-skpl-gradient p-8 text-center sm:flex-row sm:text-left">
        <TeamLogo name={team.name} logoUrl={team.logo_url} className="h-24 w-24 shrink-0 text-3xl" />
        <div>
          <h1 className="font-display text-3xl font-extrabold text-white">{team.name}</h1>
          <p className="text-sm font-semibold uppercase tracking-wide text-primary-200">{team.short_name}</p>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent-500 px-3 py-1 text-xs font-bold text-white">
            <Trophy className="h-3.5 w-3.5" />
            {championSeasons.length > 0 ? (
              <span>Champion Seasons: {championSeasons.map((s) => s.name).join(' · ')}</span>
            ) : (
              <span>No Championships</span>
            )}
          </div>
          {team.description ? <p className="mt-2 max-w-lg text-sm text-primary-100">{team.description}</p> : null}
        </div>
      </div>

      <div className="flex justify-end">
        <SeasonSelector seasons={seasons} value={selected} onChange={setSelected} />
      </div>

      {statsLoading ? (
        <LoadingState rows={6} />
      ) : !seasonData ? (
        <EmptyState title="No statistics available for this season." />
      ) : (
        <>
          <section className="flex flex-col gap-4">
            {isAll ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-2xl font-bold text-primary-900">Squad · All Seasons</h2>
                <span className="text-sm font-semibold text-muted-foreground">
                  {historicalSquad?.length ?? 0} Player{historicalSquad?.length === 1 ? '' : 's'}
                </span>
              </div>
            ) : (
              <h2 className="font-display text-2xl font-bold text-primary-900">Squad</h2>
            )}

            {isAll ? (
              historicalSquadLoading ? (
                <LoadingState rows={4} />
              ) : !historicalSquad || historicalSquad.length === 0 ? (
                <EmptyState title="No historical players on record for this team." />
              ) : (
                <div className="max-h-[70vh] overflow-y-auto pr-1">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {historicalSquad.map(({ player, kills, deaths, flags, tier }) => (
                      <PlayerCard
                        key={player.id}
                        playerId={player.id}
                        name={player.name}
                        imageUrl={player.image_url}
                        role={player.role}
                        kills={kills}
                        deaths={deaths}
                        flags={flags}
                        tier={tier}
                      />
                    ))}
                  </div>
                </div>
              )
            ) : !seasonData.seasonSquad || seasonData.seasonSquad.length === 0 ? (
              <EmptyState title="No squad on record for this season." />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {seasonData.seasonSquad.map(({ player, is_captain, kills, deaths, flags }) => (
                  <PlayerCard
                    key={player.id}
                    playerId={player.id}
                    name={player.name}
                    imageUrl={player.image_url}
                    role={player.role}
                    isCaptain={is_captain}
                    kills={kills}
                    deaths={deaths}
                    flags={flags}
                    tier={leagueGrades?.[player.id]?.tier}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl font-bold text-primary-900">Season Statistics</h2>
              {isChampion ? (
                <Badge variant="accent" className="flex items-center gap-1">
                  <Trophy className="h-3.5 w-3.5" /> Champion
                </Badge>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Percent className="h-4 w-4 text-primary-600" /> Wins / Losses
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <Stat label="Wins" value={seasonData.mine.wins} />
                  <Stat label="Losses" value={seasonData.mine.losses} />
                  <Stat label="Win Rate" value={`${calculateWinRate(seasonData.mine.wins, seasonData.mine.matchesPlayed)}%`} />
                  <Stat label="Rank" value={`#${seasonData.winsRank} / ${seasonData.totalTeams}`} />
                  <Stat label="Highest Win Margin" value={seasonData.mine.highestWinMargin} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Skull className="h-4 w-4 text-primary-600" /> Kills
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <Stat label="Total Kills" value={seasonData.mine.kills} />
                  <Stat label="Rank" value={`#${seasonData.killsRank} / ${seasonData.totalTeams}`} />
                  <Stat label="Most in a Match" value={seasonData.mine.mostKillsInMatch} />
                  <Stat label="Least in a Match" value={seasonData.mine.leastKillsInMatch} />
                  <Stat
                    label="Average / Match"
                    value={
                      seasonData.mine.matchesPlayed
                        ? Math.round((seasonData.mine.kills / seasonData.mine.matchesPlayed) * 100) / 100
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
                  <Stat label="Total Flags" value={seasonData.mine.flags} />
                  <Stat
                    label="Average / Match"
                    value={
                      seasonData.mine.matchesPlayed
                        ? Math.round((seasonData.mine.flags / seasonData.mine.matchesPlayed) * 100) / 100
                        : 0
                    }
                  />
                  <Stat label="Minimum" value={seasonData.mine.minFlags} />
                  <Stat label="Maximum" value={seasonData.mine.maxFlags} />
                </CardContent>
              </Card>
            </div>
          </section>
        </>
      )}
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
