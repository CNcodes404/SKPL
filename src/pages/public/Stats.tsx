import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SeasonSelector } from '@/components/shared/SeasonSelector'
import { ExhibitionsToggle } from '@/components/shared/ExhibitionsToggle'
import { LeaderboardCard } from '@/components/shared/LeaderboardCard'
import { LoadingGrid } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { useSeasonFilter } from '@/hooks/useSeasonFilter'
import { useAsync } from '@/hooks/useAsync'
import { getPlayerStatsForScope, getTeamStatsForScope } from '@/services/stats'
import { getPlayerHonors, listPlayersWithCurrentTeam } from '@/services/players'
import {
  PLAYER_STAT_TYPES,
  PLAYER_STAT_LABELS,
  TEAM_STAT_TYPES,
  TEAM_STAT_LABELS,
  playerStatValue,
  playerStatDisplay,
  teamStatValue,
  teamStatDisplay,
} from '@/utils/statTypes'
import { BarChart3 } from 'lucide-react'

export default function Stats() {
  const { seasons, selected, setSelected } = useSeasonFilter()
  const [includeExhibitions, setIncludeExhibitions] = useState(false)

  const { data: playerStats, loading: playersLoading, error: playersError } = useAsync(async () => {
    if (!selected) return []
    return getPlayerStatsForScope(selected, includeExhibitions)
  }, [selected, includeExhibitions])

  const { data: teamStats, loading: teamsLoading, error: teamsError } = useAsync(async () => {
    if (!selected) return []
    return getTeamStatsForScope(selected, includeExhibitions)
  }, [selected, includeExhibitions])

  // MVP counts are career-wide honors, not season-scoped stats — fetched
  // independent of the season selector above, but still respects the
  // exhibitions toggle.
  const { data: mvpBoards } = useAsync(async () => {
    const [honors, roster] = await Promise.all([getPlayerHonors(includeExhibitions), listPlayersWithCurrentTeam(true)])
    const withHonors = roster
      .map((r) => ({ player: r.player, teamName: r.currentTeam?.name, honors: honors[r.player.id] }))
      .filter((r) => r.honors)
    return {
      matchMvps: withHonors
        .filter((r) => r.honors!.matchMvps > 0)
        .sort((a, b) => b.honors!.matchMvps - a.honors!.matchMvps)
        .map((r) => ({ id: r.player.id, name: r.player.name, teamName: r.teamName, value: String(r.honors!.matchMvps) })),
      seasonMvps: withHonors
        .filter((r) => r.honors!.seasonMvps > 0)
        .sort((a, b) => b.honors!.seasonMvps - a.honors!.seasonMvps)
        .map((r) => ({ id: r.player.id, name: r.player.name, teamName: r.teamName, value: String(r.honors!.seasonMvps) })),
    }
  }, [includeExhibitions])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-primary-900">Statistics</h1>
          <p className="text-sm text-muted-foreground">League leaders across every category.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ExhibitionsToggle value={includeExhibitions} onChange={setIncludeExhibitions} />
          <SeasonSelector seasons={seasons} value={selected} onChange={setSelected} />
        </div>
      </div>

      <Tabs defaultValue="player">
        <TabsList>
          <TabsTrigger value="player">Player</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
        </TabsList>

        <TabsContent value="player">
          {playersLoading ? (
            <LoadingGrid items={5} />
          ) : playersError ? (
            <ErrorState message="Unable to load player statistics." />
          ) : !playerStats || playerStats.length === 0 ? (
            <EmptyState title="No statistics available for this season." icon={BarChart3} />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PLAYER_STAT_TYPES.map((type) => {
                const sorted = [...playerStats].sort((a, b) => playerStatValue(b, type) - playerStatValue(a, type))
                return (
                  <LeaderboardCard
                    key={type}
                    title={PLAYER_STAT_LABELS[type]}
                    entries={sorted.map((s) => ({
                      id: s.player.id,
                      name: s.player.name,
                      teamName: s.team?.name,
                      value: playerStatDisplay(s, type),
                    }))}
                    viewAllTo={`/stats/players/${type}?season=${selected}`}
                    entryHref={(entry) => `/players/${entry.id}`}
                  />
                )
              })}
            </div>
          )}

          {mvpBoards && (mvpBoards.matchMvps.length > 0 || mvpBoards.seasonMvps.length > 0) ? (
            <div className="mt-6 flex flex-col gap-4">
              <h2 className="font-display text-xl font-bold text-primary-900">Career Honors</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <LeaderboardCard title="Most Match MVPs" entries={mvpBoards.matchMvps} entryHref={(entry) => `/players/${entry.id}`} />
                <LeaderboardCard title="Most Season MVPs" entries={mvpBoards.seasonMvps} entryHref={(entry) => `/players/${entry.id}`} />
              </div>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="team">
          {teamsLoading ? (
            <LoadingGrid items={5} />
          ) : teamsError ? (
            <ErrorState message="Unable to load team statistics." />
          ) : !teamStats || teamStats.length === 0 ? (
            <EmptyState title="No statistics available for this season." icon={BarChart3} />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {TEAM_STAT_TYPES.map((type) => {
                const sorted = [...teamStats].sort((a, b) => teamStatValue(b, type) - teamStatValue(a, type))
                return (
                  <LeaderboardCard
                    key={type}
                    title={TEAM_STAT_LABELS[type]}
                    entries={sorted.map((s) => ({
                      id: s.team.id,
                      name: s.team.name,
                      value: teamStatDisplay(s, type),
                    }))}
                    viewAllTo={`/stats/teams/${type}?season=${selected}`}
                    entryHref={(entry) => `/teams/${entry.id}`}
                  />
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
