import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Crown, Crosshair, Trophy, Users, ListOrdered } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LeaderboardCard, type LeaderboardEntry } from '@/components/shared/LeaderboardCard'
import { LoadingState } from '@/components/shared/LoadingState'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { SoloLiveRoundTable, SoloPointsRules, SoloRoundTable, SoloStandingsTable } from '@/components/solo/SoloTables'
import { useAsync } from '@/hooks/useAsync'
import { useUrlState } from '@/hooks/useUrlState'
import { getSoloSeasonData, listSoloSeasons, type SoloSeasonData } from '@/services/solo'
import { getSoloLiveView, subscribeSoloLive, type SoloLiveView } from '@/services/soloLive'
import type { SoloRound } from '@/types'
import { calculateKD, formatKD } from '@/utils/calculations'
import { cn, formatDate } from '@/lib/utils'

const TABS = ['standings', 'rounds', 'stats'] as const
type Tab = (typeof TABS)[number]

export default function SoloLeague() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useUrlState<Tab>('tab', 'standings', TABS)

  const { data: seasons, loading: seasonsLoading, error: seasonsError } = useAsync(() => listSoloSeasons(), [], {
    cache: 'solo-seasons',
  })

  const urlSeason = searchParams.get('season')
  const selected = seasons?.some((s) => s.id === urlSeason) ? (urlSeason as string) : seasons?.[0]?.id ?? ''

  function selectSeason(id: string) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        params.set('season', id)
        params.delete('round')
        return params
      },
      { replace: true },
    )
  }

  const { data, loading, error, reload } = useAsync(
    async () => (selected ? getSoloSeasonData(selected) : null),
    [selected],
    { cache: 'solo-season' },
  )

  // Live tracking for this season's rounds, kept fresh over Realtime.
  const roundKey = (data?.rounds ?? []).map((r) => r.id).join(',')
  const { data: liveView, reload: reloadLive } = useAsync(
    () => getSoloLiveView(roundKey ? roundKey.split(',') : []),
    [roundKey],
  )
  useEffect(() => {
    if (!roundKey) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = subscribeSoloLive(() => {
      clearTimeout(timer)
      timer = setTimeout(reloadLive, 500)
    }, `solo-live-page-${selected}`)
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundKey])

  // A round ending or being completed changes the saved results too: reload them.
  const sessionKey = (liveView?.sessions ?? []).map((s) => `${s.round_id}:${s.status}`).join(',')
  const prevSessionKey = useRef<string | null>(null)
  useEffect(() => {
    if (prevSessionKey.current !== null && prevSessionKey.current !== sessionKey) reload()
    prevSessionKey.current = sessionKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey])

  const liveRound = data?.rounds.find((r) => liveStatusOf(r, liveView) === 'live')

  function showRound(roundId: string) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        params.set('tab', 'rounds')
        params.set('round', roundId)
        return params
      },
      { replace: true },
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-primary-900">Solo League</h1>
          <p className="text-sm text-muted-foreground">
            Every kart for itself: kills and finishing position earn points, round after round.
          </p>
        </div>
        {seasons && seasons.length > 0 ? (
          <Select value={selected} onValueChange={selectSeason}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Select season" />
            </SelectTrigger>
            <SelectContent>
              {seasons.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {seasonsLoading || (loading && !data) ? (
        <LoadingState rows={6} />
      ) : seasonsError || error ? (
        <ErrorState message="Unable to load the Solo League." />
      ) : !seasons || seasons.length === 0 ? (
        <EmptyState title="No Solo League seasons yet." icon={Crosshair} />
      ) : !data ? (
        <ErrorState message="Season not found." />
      ) : (
        <>
          {liveRound ? (
            <button
              type="button"
              onClick={() => showRound(liveRound.id)}
              className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-left transition-colors hover:bg-red-100"
            >
              <span className="flex items-center gap-2 font-semibold text-red-700">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" /> {liveRound.name} is live now
              </span>
              <span className="text-sm font-semibold text-red-700">Watch live standings →</span>
            </button>
          ) : null}
          <SeasonSummary data={data} />
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList>
              <TabsTrigger value="standings">Standings</TabsTrigger>
              <TabsTrigger value="rounds">Rounds</TabsTrigger>
              <TabsTrigger value="stats">Stats</TabsTrigger>
            </TabsList>
            <TabsContent value="standings" className="flex flex-col gap-4">
              {data.players.length === 0 ? (
                <EmptyState title="No players registered yet." icon={Users} />
              ) : (
                <>
                  {!data.rounds.some((r) => r.status === 'COMPLETED') ? (
                    <p className="text-sm text-muted-foreground">
                      No rounds completed yet. Standings update after every completed round.
                    </p>
                  ) : null}
                  <SoloStandingsTable standings={data.standings} rounds={data.rounds} players={data.players} />
                </>
              )}
              <SoloPointsRules season={data.season} />
            </TabsContent>
            <TabsContent value="rounds">
              <RoundsView data={data} liveView={liveView} onPick={showRound} />
            </TabsContent>
            <TabsContent value="stats">
              <StatsView data={data} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}

function SeasonSummary({ data }: { data: SoloSeasonData }) {
  const { season, standings, rounds, players } = data
  const completed = rounds.filter((r) => r.status === 'COMPLETED').length
  const leader = completed > 0 ? standings[0] : undefined
  const leaderName = leader ? players.find((p) => p.id === leader.playerId)?.name : undefined
  const isDone = season.status === 'COMPLETED'

  return (
    <div className="flex flex-col gap-4">
      {isDone && leaderName ? (
        <div className="flex items-center gap-3 rounded-xl bg-skpl-gradient px-6 py-5 text-white">
          <Trophy className="h-8 w-8 shrink-0 text-accent-300" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-200">{season.name} Champion</p>
            <p className="font-display text-2xl font-extrabold">
              {leaderName} <span className="text-base font-semibold text-primary-200">· {leader?.points} pts</span>
            </p>
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Tile icon={Trophy} label="Status" value={isDone ? 'Completed' : season.status === 'DRAFT' ? 'Draft' : 'In progress'} />
        <Tile icon={Users} label="Players" value={players.length} />
        <Tile icon={ListOrdered} label="Rounds played" value={`${completed} / ${rounds.length}`} />
        <Tile icon={Crown} label={isDone ? 'Champion' : 'Leader'} value={leaderName ?? 'TBD'} />
      </div>
    </div>
  )
}

function Tile({ icon: Icon, label, value }: { icon: typeof Trophy; label: string; value: string | number }) {
  return (
    <Card className="flex flex-col items-center gap-2 p-4 text-center">
      <Icon className="h-5 w-5 text-accent-500" />
      <p className="max-w-full truncate font-display text-lg font-extrabold text-primary-900">{value}</p>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    </Card>
  )
}

type LiveStatus = 'live' | 'review' | null

/** live: being tracked now; review: tracking ended, waiting for the admin to complete it. */
function liveStatusOf(round: SoloRound, liveView: SoloLiveView | undefined): LiveStatus {
  if (round.status === 'COMPLETED' || !liveView) return null
  const session = liveView.sessions.find((s) => s.round_id === round.id)
  const hasStats = liveView.stats.some((s) => s.round_id === round.id)
  if (!session || !hasStats) return null
  const fresh = Date.now() - new Date(session.heartbeat_at).getTime() < 5 * 60 * 1000
  return session.status === 'LIVE' && fresh ? 'live' : 'review'
}

function RoundsView({
  data,
  liveView,
  onPick,
}: {
  data: SoloSeasonData
  liveView: SoloLiveView | undefined
  onPick: (roundId: string) => void
}) {
  const [searchParams] = useSearchParams()
  const { rounds } = data
  const lastCompleted = [...rounds].reverse().find((r) => r.status === 'COMPLETED')
  const live = rounds.find((r) => liveStatusOf(r, liveView) === 'live')
  const urlRound = searchParams.get('round')
  const roundId = rounds.some((r) => r.id === urlRound)
    ? (urlRound as string)
    : live?.id ?? lastCompleted?.id ?? rounds[0]?.id ?? ''

  if (rounds.length === 0) return <EmptyState title="No rounds in this season yet." icon={ListOrdered} />
  const round = rounds.find((r) => r.id === roundId) ?? rounds[0]
  const results = data.results.filter((r) => r.round_id === round.id)
  const played = new Set(results.map((r) => r.player_id))
  const missed = data.players.filter((p) => !played.has(p.id))
  const status = liveStatusOf(round, liveView)
  const liveStats = (liveView?.stats ?? []).filter((s) => s.round_id === round.id)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {rounds.map((r) => {
          const s = liveStatusOf(r, liveView)
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onPick(r.id)}
              className={cn(
                'flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors',
                r.id === round.id ? 'border-primary-700 bg-primary-700 text-white' : 'border-border hover:bg-secondary',
              )}
            >
              {s === 'live' ? <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> : null}
              {r.name}
              {r.status !== 'COMPLETED' ? (
                <span className={cn('text-[10px] uppercase', r.id === round.id ? 'text-primary-200' : 'text-muted-foreground')}>
                  {s === 'live' ? 'Live' : s === 'review' ? 'In review' : 'Upcoming'}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-xl font-bold text-primary-900">{round.name}</h2>
        {round.status === 'COMPLETED' ? (
          <Badge variant="success">Completed</Badge>
        ) : status === 'live' ? (
          <Badge variant="destructive" className="flex items-center gap-1.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" /> Live
          </Badge>
        ) : status === 'review' ? (
          <Badge variant="accent">Awaiting final results</Badge>
        ) : (
          <Badge variant="outline">Upcoming</Badge>
        )}
        {round.status === 'COMPLETED' && round.played_at ? (
          <span className="text-sm text-muted-foreground">{formatDate(round.played_at)}</span>
        ) : null}
      </div>

      {round.status !== 'COMPLETED' && status ? (
        <>
          <p className="text-sm text-muted-foreground">
            {status === 'live'
              ? 'Updating live as the round is played. Positions come from current kills; these numbers are provisional until the round is completed.'
              : 'The round has finished. These are the live numbers — final results appear once the admin completes the round.'}
          </p>
          <SoloLiveRoundTable season={data.season} stats={liveStats} players={data.players} />
        </>
      ) : round.status !== 'COMPLETED' ? (
        <EmptyState title="Results will appear here once this round is completed." icon={ListOrdered} />
      ) : (
        <>
          <SoloRoundTable season={data.season} results={results} players={data.players} />
          {missed.length > 0 ? (
            <p className="text-sm text-muted-foreground">Did not play: {missed.map((p) => p.name).join(', ')}</p>
          ) : null}
        </>
      )}
    </div>
  )
}

function StatsView({ data }: { data: SoloSeasonData }) {
  const nameOf = new Map(data.players.map((p) => [p.id, p.name]))
  const played = data.standings.filter((r) => r.roundsPlayed > 0)
  const entry = (playerId: string, value: string): LeaderboardEntry => ({ id: playerId, name: nameOf.get(playerId) ?? '', value })
  const top = <T,>(list: T[], key: (x: T) => number) => [...list].sort((a, b) => key(b) - key(a))

  if (played.length === 0) return <EmptyState title="No completed rounds yet." icon={Crosshair} />

  const href = (e: LeaderboardEntry) => `/players/${e.id}`
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <LeaderboardCard
        title="Most Kills"
        entryHref={href}
        entries={top(played, (r) => r.kills).map((r) => entry(r.playerId, String(r.kills)))}
      />
      <LeaderboardCard
        title="Best K/D"
        entryHref={href}
        entries={top(played, (r) => calculateKD(r.kills, r.deaths)).map((r) => entry(r.playerId, formatKD(r.kills, r.deaths)))}
      />
      <LeaderboardCard
        title="Most Kills in a Round"
        entryHref={href}
        entries={top(played, (r) => r.mostKillsInRound).map((r) => entry(r.playerId, String(r.mostKillsInRound)))}
      />
      <LeaderboardCard
        title="Most Round Wins"
        entryHref={href}
        entries={top(
          played.filter((r) => r.wins > 0),
          (r) => r.wins,
        ).map((r) => entry(r.playerId, String(r.wins)))}
      />
      <LeaderboardCard
        title="Most Podiums (Top 3)"
        entryHref={href}
        entries={top(
          played.filter((r) => r.podiums > 0),
          (r) => r.podiums,
        ).map((r) => entry(r.playerId, String(r.podiums)))}
      />
      <LeaderboardCard
        title="Avg Points per Round"
        entryHref={href}
        entries={top(played, (r) => r.points / r.roundsPlayed).map((r) =>
          entry(r.playerId, (r.points / r.roundsPlayed).toFixed(1)),
        )}
      />
    </div>
  )
}
