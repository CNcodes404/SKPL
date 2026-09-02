import { useState } from 'react'
import { Link } from 'react-router-dom'
import { UserRound } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FilterBar } from '@/components/shared/FilterBar'
import { SeasonSelector, ALL_SEASONS } from '@/components/shared/SeasonSelector'
import { PlayerAvatar, TeamLogo } from '@/components/shared/Avatar'
import { LoadingGrid } from '@/components/shared/LoadingState'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { useAsync } from '@/hooks/useAsync'
import { useSeasonFilter } from '@/hooks/useSeasonFilter'
import { listPlayersWithCurrentTeam, listPlayers, getPlayersCareerStats, type PlayerWithCurrentTeam } from '@/services/players'
import { getSeasonRoster, getSeasonTeams } from '@/services/seasons'
import { listTeams } from '@/services/teams'
import { computePlayerTier } from '@/utils/playerTier'
import { calculateKD, average } from '@/utils/calculations'
import { PLAYER_ROLE_LABELS } from '@/types'
import type { Team } from '@/types'

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE'

export default function Players() {
  const { seasons, selected, setSelected } = useSeasonFilter()
  const [teamFilter, setTeamFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')

  const { data: allTeams } = useAsync(() => listTeams(true), [])

  const { data: rows, loading, error } = useAsync(async (): Promise<PlayerWithCurrentTeam[]> => {
    if (!selected) return []
    if (selected === ALL_SEASONS) {
      return listPlayersWithCurrentTeam(true)
    }
    const [roster, teams] = await Promise.all([getSeasonRoster(selected), getSeasonTeams(selected)])
    const teamById = new Map(teams.map((t) => [t.id, t] as [string, Team]))
    return roster.map((r) => ({ player: r.player, currentTeam: teamById.get(r.team_id) ?? null }))
  }, [selected])

  // Tier is career-wide and normalized against every player in the league,
  // so it's fetched once, independent of the season/team/status filters —
  // the same player should show the same Tier no matter how this list is filtered.
  const { data: tierByPlayerId } = useAsync(async () => {
    const allPlayers = await listPlayers(true)
    const careerStats = await getPlayersCareerStats(allPlayers.map((p) => p.id))
    const result: Record<string, string> = {}
    for (const p of allPlayers) {
      const totals = careerStats[p.id]
      const raw = totals ? { kd: calculateKD(totals.kills, totals.deaths), flagsPerMatch: average(totals.flags, totals.matchesPlayed) } : null
      const tier = computePlayerTier(p.role, raw, totals?.matchesPlayed ?? 0)
      if (tier) result[p.id] = tier.label
    }
    return result
  }, [])

  const filtered = (rows ?? [])
    .filter((r) => (teamFilter === 'ALL' ? true : r.currentTeam?.id === teamFilter))
    .filter((r) => {
      if (statusFilter === 'ALL') return true
      return statusFilter === 'ACTIVE' ? r.player.is_active : !r.player.is_active
    })
    .sort((a, b) => a.player.name.localeCompare(b.player.name))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-primary-900">Players</h1>
        <p className="text-sm text-muted-foreground">Every player who has taken the track in SKPL.</p>
      </div>

      <FilterBar>
        <SeasonSelector seasons={seasons} value={selected} onChange={setSelected} />
        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Teams</SelectItem>
            {(allTeams ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      {loading ? (
        <LoadingGrid items={8} />
      ) : error ? (
        <ErrorState message="Unable to load players." />
      ) : filtered.length === 0 ? (
        <EmptyState title="No players found." icon={UserRound} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {filtered.map(({ player, currentTeam }) => (
            <Link key={player.id} to={`/players/${player.id}`}>
              <Card className="flex h-full flex-col items-center gap-3 p-6 text-center transition-all hover:-translate-y-1 hover:shadow-elevated">
                <PlayerAvatar name={player.name} imageUrl={player.image_url} className="h-20 w-20 text-2xl" />
                <div>
                  <p className="font-display text-base font-bold text-primary-900">{player.name}</p>
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    {player.role ? (
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {PLAYER_ROLE_LABELS[player.role]}
                      </p>
                    ) : null}
                    {tierByPlayerId?.[player.id] ? <Badge variant="outline">{tierByPlayerId[player.id]}</Badge> : null}
                  </div>
                </div>
                {currentTeam ? (
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-primary-700">
                    <TeamLogo name={currentTeam.name} logoUrl={currentTeam.logo_url} className="h-5 w-5 text-[8px]" />
                    {currentTeam.short_name}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No team</p>
                )}
                <Badge variant={player.is_active ? 'success' : 'outline'}>
                  {player.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
