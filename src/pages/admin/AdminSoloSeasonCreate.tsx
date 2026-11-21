import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, Crosshair, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/shared/FormField'
import { PlayerAvatar } from '@/components/shared/Avatar'
import { LoadingState } from '@/components/shared/LoadingState'
import { PlayerSearchPicker } from '@/components/rounds/LineupTeamCard'
import { useAsync } from '@/hooks/useAsync'
import { listPlayers } from '@/services/players'
import { createSoloSeason, listSoloSeasons } from '@/services/solo'
import { DEFAULT_POSITION_POINTS, ordinal } from '@/utils/soloStandings'

/** Resizes the points table to `size` places, keeping existing values and filling new places with 0. */
function resizePoints(points: number[], size: number): number[] {
  return Array.from({ length: size }, (_, i) => points[i] ?? DEFAULT_POSITION_POINTS[i] ?? 0)
}

export default function AdminSoloSeasonCreate() {
  const navigate = useNavigate()
  const { data: players, loading: playersLoading } = useAsync(() => listPlayers(), [])
  const { data: existing } = useAsync(() => listSoloSeasons(), [])

  const [name, setName] = useState('')
  const [seasonNumber, setSeasonNumber] = useState(1)
  const [touched, setTouched] = useState(false)
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [rounds, setRounds] = useState(3)
  const [maxPlayers, setMaxPlayers] = useState(12)
  const [pointsPerKill, setPointsPerKill] = useState(1)
  const [positionPoints, setPositionPoints] = useState<number[]>(DEFAULT_POSITION_POINTS)
  const [picked, setPicked] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (touched || !existing) return
    const next = Math.max(0, ...existing.map((s) => s.season_number)) + 1
    setSeasonNumber(next)
    setName((prev) => prev || `Solo League Season ${next}`)
  }, [existing, touched])

  function changeMaxPlayers(value: number) {
    const size = Math.min(50, Math.max(2, value || 2))
    setMaxPlayers(size)
    setPositionPoints((prev) => resizePoints(prev, size))
  }

  const pickedPlayers = (players ?? []).filter((p) => picked.includes(p.id))
  const candidates = (players ?? []).filter((p) => !picked.includes(p.id)).map((player) => ({ player }))
  const full = picked.length >= maxPlayers
  const valid = name.trim().length > 0 && seasonNumber > 0 && rounds >= 1 && picked.length <= maxPlayers

  async function handleCreate() {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const id = await createSoloSeason({
        name: name.trim(),
        season_number: seasonNumber,
        start_date: startDate || null,
        rounds,
        max_players: maxPlayers,
        points_per_kill: pointsPerKill,
        position_points: positionPoints,
        player_ids: picked,
      })
      navigate(`/admin/solo-league/${id}`)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to create season.')
    } finally {
      setSubmitting(false)
    }
  }

  if (playersLoading) return <LoadingState rows={6} />

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/admin/solo-league"
        className="flex items-center gap-1 self-start text-sm font-semibold text-muted-foreground hover:text-primary-900"
      >
        <ChevronLeft className="h-4 w-4" /> Solo League
      </Link>
      <div>
        <h1 className="font-display text-3xl font-bold text-primary-900">Create Solo Season</h1>
        <p className="text-sm text-muted-foreground">Rounds are created for you. Players can be changed later.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Basics</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label="Season Name" htmlFor="ss-name">
            <Input id="ss-name" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label="Season Number" htmlFor="ss-number">
            <Input
              id="ss-number"
              type="number"
              min={1}
              value={seasonNumber}
              onChange={(e) => {
                setTouched(true)
                setSeasonNumber(Number(e.target.value))
              }}
            />
          </FormField>
          <FormField label="Date" htmlFor="ss-date">
            <Input id="ss-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </FormField>
          <FormField label="Rounds" htmlFor="ss-rounds" hint="More can be added later.">
            <Input
              id="ss-rounds"
              type="number"
              min={1}
              max={20}
              value={rounds}
              onChange={(e) => setRounds(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
            />
          </FormField>
          <FormField label="Max Players" htmlFor="ss-max">
            <Input id="ss-max" type="number" min={2} max={50} value={maxPlayers} onChange={(e) => changeMaxPlayers(Number(e.target.value))} />
          </FormField>
          <FormField label="Points per Kill" htmlFor="ss-ppk">
            <Input
              id="ss-ppk"
              type="number"
              min={0}
              value={pointsPerKill}
              onChange={(e) => setPointsPerKill(Math.max(0, Number(e.target.value) || 0))}
            />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Position Points</CardTitle>
          <p className="text-sm text-muted-foreground">
            Points for each finishing position in a round. Players with the same kills share a position (1, 2, 2, 3…).
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {positionPoints.map((pts, i) => (
            <FormField key={i} label={ordinal(i + 1)} htmlFor={`ss-pos-${i}`}>
              <Input
                id={`ss-pos-${i}`}
                type="number"
                min={0}
                value={pts}
                onChange={(e) => {
                  const v = Math.max(0, Number(e.target.value) || 0)
                  setPositionPoints((prev) => prev.map((p, j) => (j === i ? v : p)))
                }}
              />
            </FormField>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Players ({picked.length} / {maxPlayers})
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="sm:max-w-sm">
            <PlayerSearchPicker
              candidates={candidates}
              onPick={(player) => setPicked((prev) => [...prev, player.id])}
              placeholder={full ? 'Season is full' : 'Add player…'}
              disabled={full}
            />
          </div>
          {pickedPlayers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No players added yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {pickedPlayers.map((p) => (
                <span key={p.id} className="flex items-center gap-2 rounded-full border border-border bg-secondary/40 py-1 pl-1 pr-2 text-sm">
                  <PlayerAvatar name={p.name} imageUrl={p.image_url} className="h-6 w-6 text-[9px]" />
                  {p.name}
                  <button
                    type="button"
                    onClick={() => setPicked((prev) => prev.filter((id) => id !== p.id))}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${p.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {submitError ? <p className="text-sm font-medium text-destructive">{submitError}</p> : null}
      <Button size="lg" className="self-start" onClick={handleCreate} disabled={!valid || submitting}>
        <Crosshair className="h-4 w-4" /> {submitting ? 'Creating…' : 'Create Season'}
      </Button>
    </div>
  )
}
