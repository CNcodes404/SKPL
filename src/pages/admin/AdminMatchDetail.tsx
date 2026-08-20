import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Save, Ban, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FormField } from '@/components/shared/FormField'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PlayerAvatar } from '@/components/shared/Avatar'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { useAsync } from '@/hooks/useAsync'
import { getMatch, getMatchStats, saveMatchResult, updateMatchSchedule } from '@/services/matches'
import { getSeasonRoster } from '@/services/seasons'
import { formatDateTime } from '@/lib/utils'
import { MATCH_TYPE_LABELS } from '@/types'
import { validateMatchEntry } from '@/utils/validation'

interface StatRow {
  kills: number
  deaths: number
  flags: number
}

export default function AdminMatchDetail() {
  const { matchId = '' } = useParams()
  const navigate = useNavigate()

  const { data, loading, error, reload } = useAsync(async () => {
    const match = await getMatch(matchId)
    if (!match) return null
    const [roster, existingStats] = await Promise.all([getSeasonRoster(match.season_id), getMatchStats(matchId)])

    const teamARoster = roster.filter((r) => r.team_id === match.team_a_id)
    const teamBRoster = roster.filter((r) => r.team_id === match.team_b_id)

    return { match, teamARoster, teamBRoster, existingStats }
  }, [matchId])

  const [teamAScore, setTeamAScore] = useState<number | ''>('')
  const [teamBScore, setTeamBScore] = useState<number | ''>('')
  const [stats, setStats] = useState<Record<string, StatRow>>({})
  const [mvpPlayerId, setMvpPlayerId] = useState<string>('NONE')
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const rosterPlayerIds = useMemo(
    () => new Set([...(data?.teamARoster ?? []), ...(data?.teamBRoster ?? [])].map((r) => r.player.id)),
    [data],
  )

  if (!loading && data && !initialized) {
    setTeamAScore(data.match.team_a_score ?? '')
    setTeamBScore(data.match.team_b_score ?? '')
    setMvpPlayerId(data.match.mvp_player_id ?? 'NONE')
    const initialStats: Record<string, StatRow> = {}
    for (const playerId of rosterPlayerIds) {
      const existing = data.existingStats.find((s) => s.player_id === playerId)
      initialStats[playerId] = existing
        ? { kills: existing.kills, deaths: existing.deaths, flags: existing.flags }
        : { kills: 0, deaths: 0, flags: 0 }
    }
    setStats(initialStats)
    setInitialized(true)
  }

  function updateStat(playerId: string, field: keyof StatRow, value: number) {
    setStats((prev) => ({ ...prev, [playerId]: { ...prev[playerId], [field]: value } }))
  }

  async function handleSave() {
    if (!data) return
    const teamAStats = data.teamARoster.map((r) => ({ player_id: r.player.id, ...stats[r.player.id] }))
    const teamBStats = data.teamBRoster.map((r) => ({ player_id: r.player.id, ...stats[r.player.id] }))

    const validationErrors = validateMatchEntry({
      teamAScore: Number(teamAScore) || 0,
      teamBScore: Number(teamBScore) || 0,
      teamAStats,
      teamBStats,
    })

    if (validationErrors.length > 0) {
      setErrors(validationErrors)
      return
    }

    setErrors([])
    setSaving(true)
    try {
      await saveMatchResult({
        matchId,
        teamAScore: Number(teamAScore) || 0,
        teamBScore: Number(teamBScore) || 0,
        mvpPlayerId: mvpPlayerId === 'NONE' ? null : mvpPlayerId,
        status: 'COMPLETED',
        stats: [
          ...teamAStats.map((s) => ({ ...s, team_id: data.match.team_a_id })),
          ...teamBStats.map((s) => ({ ...s, team_id: data.match.team_b_id })),
        ],
      })
      reload()
    } catch (err) {
      console.error(err)
      setErrors(['Unable to save match. Please check the entered statistics.'])
    } finally {
      setSaving(false)
    }
  }

  async function handleCancelMatch() {
    await updateMatchSchedule(matchId, { status: 'CANCELLED' })
    reload()
  }

  if (loading) return <LoadingState rows={6} />
  if (error || !data) return <ErrorState message="Match not found." />

  const { match, teamARoster, teamBRoster } = data
  const allRosterPlayers = [...teamARoster, ...teamBRoster].map((r) => r.player)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-primary-900">
            {match.team_a.name} vs {match.team_b.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {formatDateTime(match.scheduled_at)} · {MATCH_TYPE_LABELS[match.match_type]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={match.status} />
          {match.status !== 'CANCELLED' ? (
            <Button variant="outline" size="sm" onClick={handleCancelMatch}>
              <Ban className="h-3.5 w-3.5" /> Cancel Match
            </Button>
          ) : null}
        </div>
      </div>

      {errors.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          {errors.map((e, i) => (
            <p key={i} className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" /> {e}
            </p>
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Final Score</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center gap-6">
          <ScoreInput label={match.team_a.short_name} value={teamAScore} onChange={setTeamAScore} />
          <span className="font-display text-2xl font-bold text-muted-foreground">–</span>
          <ScoreInput label={match.team_b.short_name} value={teamBScore} onChange={setTeamBScore} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PlayerStatsTable teamLabel={match.team_a.name} roster={teamARoster} stats={stats} onChange={updateStat} />
        <PlayerStatsTable teamLabel={match.team_b.name} roster={teamBRoster} stats={stats} onChange={updateStat} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Match MVP</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={mvpPlayerId} onValueChange={setMvpPlayerId}>
            <SelectTrigger className="max-w-xs">
              <SelectValue placeholder="Select MVP" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">Not selected</SelectItem>
              {allRosterPlayers.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Button size="lg" onClick={handleSave} disabled={saving} className="self-start">
        <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save Match'}
      </Button>
    </div>
  )
}

function ScoreInput({ label, value, onChange }: { label: string; value: number | ''; onChange: (v: number | '') => void }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        className="w-24 text-center font-display text-2xl font-extrabold"
      />
    </div>
  )
}

function PlayerStatsTable({
  teamLabel,
  roster,
  stats,
  onChange,
}: {
  teamLabel: string
  roster: { player: { id: string; name: string; image_url: string | null } }[]
  stats: Record<string, StatRow>
  onChange: (playerId: string, field: keyof StatRow, value: number) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{teamLabel}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {roster.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">No roster found for this team.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead className="w-20 text-center">Kills</TableHead>
                <TableHead className="w-20 text-center">Deaths</TableHead>
                <TableHead className="w-20 text-center">Flags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roster.map(({ player }) => {
                const row = stats[player.id] ?? { kills: 0, deaths: 0, flags: 0 }
                return (
                  <TableRow key={player.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <PlayerAvatar name={player.name} imageUrl={player.image_url} className="h-7 w-7 text-[10px]" />
                        <span className="font-medium text-primary-900">{player.name}</span>
                      </div>
                    </TableCell>
                    {(['kills', 'deaths', 'flags'] as const).map((field) => (
                      <TableCell key={field} className="p-2 text-center">
                        <Input
                          type="number"
                          min={0}
                          value={row[field]}
                          onChange={(e) => onChange(player.id, field, Math.max(0, Number(e.target.value) || 0))}
                          className="h-9 w-16 text-center"
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
