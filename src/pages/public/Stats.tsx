import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SeasonSelector } from '@/components/shared/SeasonSelector'
import { LeaderboardCard } from '@/components/shared/LeaderboardCard'
import { LoadingGrid } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { useSeasonFilter } from '@/hooks/useSeasonFilter'
import { useAsync } from '@/hooks/useAsync'
import { getPlayerStatsForScope, getTeamStatsForScope } from '@/services/stats'
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

  const { data: playerStats, loading: playersLoading, error: playersError } = useAsync(async () => {
    if (!selected) return []
    return getPlayerStatsForScope(selected)
  }, [selected])

  const { data: teamStats, loading: teamsLoading, error: teamsError } = useAsync(async () => {
    if (!selected) return []
    return getTeamStatsForScope(selected)
  }, [selected])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-primary-900">Statistics</h1>
          <p className="text-sm text-muted-foreground">League leaders across every category.</p>
        </div>
        <SeasonSelector seasons={seasons} value={selected} onChange={setSelected} />
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
                  />
                )
              })}
            </div>
          )}
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
