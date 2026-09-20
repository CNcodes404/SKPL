import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Skull, Flag, Swords, Trophy, Crown, Star } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PlayerAvatar, TeamLogo } from '@/components/shared/Avatar'
import { SeasonSelector, ALL_SEASONS } from '@/components/shared/SeasonSelector'
import { ExhibitionsToggle } from '@/components/shared/ExhibitionsToggle'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { useAsync } from '@/hooks/useAsync'
import { useSeasonFilter } from '@/hooks/useSeasonFilter'
import {
  getPlayer,
  getPlayerDetailStats,
  getPlayerCurrentTeam,
  getPlayerTeamForSeason,
  getPlayersCareerStats,
  getPlayerHonors,
} from '@/services/players'
import { computePlayerTier } from '@/utils/playerTier'
import { formatKD, calculateKD, average } from '@/utils/calculations'
import { PLAYER_ROLE_LABELS } from '@/types'

export default function PlayerProfile() {
  const { playerId = '' } = useParams()
  const { seasons, selected, setSelected } = useSeasonFilter()
  const [includeExhibitions, setIncludeExhibitions] = useState(false)

  const { data: player, loading: playerLoading, error } = useAsync(() => getPlayer(playerId), [playerId])

  const { data, loading: statsLoading } = useAsync(async () => {
    if (!selected) return null
    const [stats, teamInfo] = await Promise.all([
      getPlayerDetailStats(playerId, selected, includeExhibitions),
      selected === ALL_SEASONS ? getPlayerCurrentTeam(playerId) : getPlayerTeamForSeason(playerId, selected),
    ])
    return { stats, teamInfo }
  }, [playerId, selected, includeExhibitions])

  // Tier is a career-wide grade from the player's own raw stats — computed
  // independent of the page's own season filter, same as the auction UI.
  const { data: tier } = useAsync(async () => {
    if (!player) return null
    const careerStats = await getPlayersCareerStats([playerId], includeExhibitions)
    const totals = careerStats[playerId]
    const raw = totals ? { kd: calculateKD(totals.kills, totals.deaths), flagsPerMatch: average(totals.flags, totals.matchesPlayed) } : null
    return computePlayerTier(player.role, raw, totals?.matchesPlayed ?? 0)
  }, [playerId, player, includeExhibitions])

  // Trophies and MVP counts are career-wide honors, same as Tier above —
  // independent of the season filter, but they do respect the exhibitions toggle.
  const { data: honors } = useAsync(async () => {
    const all = await getPlayerHonors(includeExhibitions)
    return all[playerId] ?? { goldTrophies: 0, silverTrophies: 0, matchMvps: 0, seasonMvps: 0 }
  }, [playerId, includeExhibitions])

  if (playerLoading) return <LoadingState rows={6} />
  if (error || !player) return <ErrorState message="Player not found." />

  const stats = data?.stats
  const teamInfo = data?.teamInfo

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-4 rounded-xl bg-skpl-gradient p-8 text-center sm:flex-row sm:text-left">
        <PlayerAvatar name={player.name} imageUrl={player.image_url} className="h-28 w-28 shrink-0 text-3xl" />
        <div className="flex flex-col items-center gap-2 sm:items-start">
          <h1 className="font-display text-3xl font-extrabold text-white">{player.name}</h1>
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            {player.role ? <Badge variant="accent">{PLAYER_ROLE_LABELS[player.role]}</Badge> : null}
            {tier ? <Badge variant="accent">{tier.label}</Badge> : null}
            {!player.is_active ? <Badge variant="outline">Inactive</Badge> : null}
          </div>
          {honors && (honors.goldTrophies > 0 || honors.silverTrophies > 0 || honors.matchMvps > 0 || honors.seasonMvps > 0) ? (
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              {honors.goldTrophies > 0 ? (
                <Badge variant="outline" className="flex items-center gap-1 border-yellow-500 bg-yellow-200 text-yellow-900">
                  <Trophy className="h-3.5 w-3.5" /> ×{honors.goldTrophies}
                </Badge>
              ) : null}
              {honors.silverTrophies > 0 ? (
                <Badge variant="outline" className="flex items-center gap-1 border-gray-400 bg-gray-300 text-gray-800">
                  <Trophy className="h-3.5 w-3.5" /> ×{honors.silverTrophies}
                </Badge>
              ) : null}
              {honors.matchMvps > 0 ? (
                <Badge variant="accent" className="flex items-center gap-1">
                  <Star className="h-3.5 w-3.5" /> Match MVP ×{honors.matchMvps}
                </Badge>
              ) : null}
              {honors.seasonMvps > 0 ? (
                <Badge variant="accent" className="flex items-center gap-1">
                  <Star className="h-3.5 w-3.5" /> Season MVP ×{honors.seasonMvps}
                </Badge>
              ) : null}
            </div>
          ) : null}
          {teamInfo ? (
            <Link
              to={`/teams/${teamInfo.team.id}`}
              className="flex items-center gap-2 text-sm font-semibold text-primary-100 hover:text-white"
            >
              <TeamLogo name={teamInfo.team.name} logoUrl={teamInfo.team.logo_url} className="h-6 w-6 text-[10px]" />
              {teamInfo.team.name}
              {teamInfo.isCaptain ? <Crown className="h-4 w-4 text-accent-300" aria-label="Captain" /> : null}
            </Link>
          ) : (
            <p className="text-sm text-primary-200">No team on record</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <ExhibitionsToggle value={includeExhibitions} onChange={setIncludeExhibitions} />
        <SeasonSelector seasons={seasons} value={selected} onChange={setSelected} />
      </div>

      {statsLoading ? (
        <LoadingState rows={4} />
      ) : !stats || stats.matchesPlayed === 0 ? (
        <ErrorState message="No statistics available for this season." />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-accent-500" /> Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Matches Played" value={stats.matchesPlayed} />
              <Stat label="Flags" value={stats.flags} />
              <Stat label="Kills" value={stats.kills} />
              <Stat label="Win Rate" value={`${stats.winRate}%`} />
              <Stat label="Deaths" value={stats.deaths} />
              <Stat label="KD" value={formatKD(stats.kills, stats.deaths)} />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Flag className="h-4 w-4 text-primary-600" /> Attacking
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <Stat label="Total Flags" value={stats.flags} />
                <Stat label="Flags / Match" value={stats.avgFlags.toFixed(2)} />
                <Stat label="Max in a Match" value={stats.maxFlagsInMatch} />
                <Stat label="Min in a Match" value={stats.minFlagsInMatch} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Swords className="h-4 w-4 text-primary-600" /> Aggression
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <Stat label="Total Kills" value={stats.kills} />
                <Stat label="Kills / Match" value={stats.avgKills.toFixed(2)} />
                <Stat label="Max in a Match" value={stats.maxKillsInMatch} />
                <Stat label="Min in a Match" value={stats.minKillsInMatch} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Skull className="h-4 w-4 text-primary-600" /> Defensive
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <Stat label="Total Deaths" value={stats.deaths} />
                <Stat label="Deaths / Match" value={stats.avgDeaths.toFixed(2)} />
                <Stat label="Max in a Match" value={stats.maxDeathsInMatch} />
                <Stat label="Min in a Match" value={stats.minDeathsInMatch} />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center sm:text-left">
      <p className="font-display text-2xl font-extrabold text-primary-800">{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  )
}
