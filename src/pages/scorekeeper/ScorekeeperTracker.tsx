import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Flag,
  ImageUp,
  MonitorUp,
  Pause,
  Play,
  Radio,
  Send,
  Square,
  UserPlus,
  Wand2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TeamLogo } from '@/components/shared/Avatar'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useAsync } from '@/hooks/useAsync'
import { getMatch } from '@/services/matches'
import {
  claimLiveMatch,
  extractScoreboard,
  getLiveStats,
  getTrackerRoster,
  recordLiveStats,
  submitLiveResult,
  type TrackerRoster,
} from '@/services/scorekeeper'
import { addMatchSubstitute, removeMatchSubstitute } from '@/services/substitutes'
import { listPlayers } from '@/services/players'
import { formatDateTime, cn } from '@/lib/utils'
import { MATCH_TYPE_LABELS, type MatchWithTeams, type Player } from '@/types'
import type { Json } from '@/types/database'
import {
  applyLiveCapture,
  fmt,
  matchRowToPlayer,
  mergeFinal,
  resolveRows,
  stateFromSaved,
  teamFlags,
  totalOf,
  type ExtractedRow,
  type FinalLine,
  type LiveEvent,
  type LiveState,
} from '@/utils/liveMerge'
import {
  CHANGE_THRESHOLD,
  DEFAULT_CROP,
  blobToBase64,
  canvasToBase64,
  createFrameGrabber,
  drawCroppedFrame,
  drawFullFrame,
  loadCrop,
  maskDifference,
  saveCrop,
  startWorkerTicker,
  textMask,
  type CropRect,
  type Frame,
} from '@/utils/frameCapture'

/** How often a frame is checked for changes (no Gemini call unless the text changed). */
const TICK_MS = 4000
/** Re-read the scoreboard at least this often even if nothing seems to change. */
const FORCE_REFRESH_MS = 30_000

type Phase = 'setup' | 'live' | 'final' | 'done'

/** Plain-JSON copy for the audit log columns (drops undefined fields). */
function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json
}

interface LogEntry {
  id: number
  at: Date
  text: string
  tone: 'info' | 'warn' | 'error'
}

export default function ScorekeeperTracker() {
  const { matchId = '' } = useParams()
  const { data, loading, error } = useAsync(async () => {
    const match = await getMatch(matchId)
    if (!match) return null
    const roster = await getTrackerRoster(match)
    return { match, roster }
  }, [matchId])

  if (loading) return <LoadingState rows={6} />
  if (error || !data) return <ErrorState message={error ?? 'Match not found.'} />
  if (data.match.status !== 'SCHEDULED') {
    return <ErrorState message={`This match is ${data.match.status.toLowerCase()}, so it can no longer be tracked.`} />
  }
  return <Tracker match={data.match} roster={data.roster} />
}

function Tracker({ match, roster: initialRoster }: { match: MatchWithTeams; roster: TrackerRoster }) {
  const [phase, setPhase] = useState<Phase>('setup')
  // The roster can change mid-setup when a substitute is added or removed.
  const [roster, setRoster] = useState<TrackerRoster>(initialRoster)
  const { data: activePlayers } = useAsync(() => listPlayers(), [])
  const [claimError, setClaimError] = useState<string | null>(null)
  const [claimed, setClaimed] = useState(false)

  const [live, setLiveState] = useState<LiveState>({})
  const liveRef = useRef<LiveState>({})
  const setLive = useCallback((s: LiveState) => {
    liveRef.current = s
    setLiveState(s)
  }, [])

  const videoRef = useRef<HTMLVideoElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const grabberRef = useRef<(() => Promise<Frame | null>) | null>(null)

  const [crop, setCropState] = useState<CropRect>(loadCrop)
  const cropRef = useRef(crop)
  const setCrop = (c: CropRect) => {
    cropRef.current = c
    setCropState(c)
    saveCrop(c)
  }
  const [preview, setPreview] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ image: string; rows: ExtractedRow[]; visible: boolean; model: string } | null>(null)
  const [testing, setTesting] = useState(false)

  const [log, setLog] = useState<LogEntry[]>([])
  const logId = useRef(0)
  const addLog = useCallback((text: string, tone: LogEntry['tone'] = 'info') => {
    setLog((prev) => [{ id: ++logId.current, at: new Date(), text, tone }, ...prev].slice(0, 60))
  }, [])

  const [status, setStatus] = useState('Not started')
  const [counters, setCounters] = useState({ checks: 0, reads: 0, model: '', lastSaved: null as Date | null })
  const [unmatched, setUnmatched] = useState<string[]>([])
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)
  const busyRef = useRef(false)
  const lastMaskRef = useRef<Uint8Array | null>(null)
  const lastReadAtRef = useRef(0)
  const stoppedRef = useRef(false)

  const playerName = useCallback(
    (id: string) => roster.players[id]?.game_name || roster.players[id]?.name || 'Unknown player',
    [roster],
  )

  // Claim the match (the lock) and restore any live stats already saved for it.
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        await claimLiveMatch(match.id)
        const saved = await getLiveStats(match.id)
        if (!active) return
        if (saved.length > 0) {
          setLive(stateFromSaved(saved))
          addLog(`Resumed: restored live stats for ${saved.length} players.`)
        }
        setClaimed(true)
      } catch (err) {
        if (active) setClaimError(err instanceof Error ? err.message : 'Unable to claim this match.')
      }
    })()
    return () => {
      active = false
    }
  }, [match.id, setLive, addLog])

  // Stop screen sharing when leaving the page.
  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream])

  function describeEvent(e: LiveEvent): { text: string; tone: LogEntry['tone'] } {
    switch (e.type) {
      case 'joined':
        return { text: `${playerName(e.playerId)} appeared on the scoreboard.`, tone: 'info' }
      case 'left':
        return { text: `${playerName(e.playerId)} is no longer on the scoreboard — stats kept.`, tone: 'warn' }
      case 'reconnected':
        return { text: `${playerName(e.playerId)} reconnected — banked ${fmt(e.banked)} from the previous session.`, tone: 'warn' }
      case 'misread':
        return {
          text: `Ignored a reading for ${playerName(e.playerId)} (${fmt(e.read)} after ${fmt(e.previous)}) — looks like a misread.`,
          tone: 'warn',
        }
      case 'unmatched':
        return { text: `"${e.name}" doesn't match any roster player.`, tone: 'warn' }
    }
  }

  async function startSharing() {
    try {
      const media = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 5 },
        audio: false,
        selfBrowserSurface: 'exclude',
      } as DisplayMediaStreamOptions)
      const track = media.getVideoTracks()[0]
      track.addEventListener('ended', () => {
        setStream(null)
        grabberRef.current = null
        setStatus('Screen sharing stopped')
        addLog('Screen sharing stopped — share the Smash Karts tab again to keep tracking.', 'error')
      })
      if (videoRef.current) {
        videoRef.current.srcObject = media
        await videoRef.current.play().catch(() => undefined)
      }
      grabberRef.current = createFrameGrabber(track, videoRef.current!)
      setStream(media)
      addLog('Sharing started.')
      setTimeout(refreshPreview, 800)
    } catch {
      addLog('Screen sharing was cancelled or blocked.', 'error')
    }
  }

  async function refreshPreview() {
    const frame = await grabberRef.current?.()
    if (!frame) return
    const canvas = drawFullFrame(frame, 960)
    frame.close?.()
    setPreview(canvas.toDataURL('image/jpeg', 0.8))
  }

  async function testCapture() {
    const frame = await grabberRef.current?.()
    if (!frame) return
    setTesting(true)
    try {
      const canvas = drawCroppedFrame(frame, cropRef.current)
      frame.close?.()
      const image = await canvasToBase64(canvas)
      const result = await extractScoreboard(image, 'live')
      setTestResult({ image: canvas.toDataURL('image/jpeg', 0.8), rows: result.players, visible: result.scoreboard_visible, model: result.model })
    } catch (err) {
      addLog(`Test capture failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setTesting(false)
    }
  }

  const tick = useCallback(async () => {
    if (busyRef.current || pausedRef.current || stoppedRef.current || !grabberRef.current) return
    busyRef.current = true
    try {
      const frame = await grabberRef.current()
      if (!frame) return
      const canvas = drawCroppedFrame(frame, cropRef.current)
      frame.close?.()

      const mask = textMask(canvas)
      const changed = maskDifference(lastMaskRef.current, mask) >= CHANGE_THRESHOLD
      const stale = Date.now() - lastReadAtRef.current > FORCE_REFRESH_MS
      setCounters((c) => ({ ...c, checks: c.checks + 1 }))
      if (!changed && !stale) return

      const image = await canvasToBase64(canvas)
      const result = await extractScoreboard(image, 'live')
      lastMaskRef.current = mask
      lastReadAtRef.current = Date.now()
      setCounters((c) => ({ ...c, reads: c.reads + 1, model: result.model }))

      const { matched, unmatched: unknown } = resolveRows(result.players, roster.options)
      if (unknown.length) setUnmatched((prev) => Array.from(new Set([...prev, ...unknown])))
      if (!result.scoreboard_visible || matched.length === 0) {
        setStatus('Scoreboard not visible — click the scoreboard icon (top-left) in the game.')
        return
      }

      const { state, events } = applyLiveCapture(liveRef.current, matched)
      await recordLiveStats(match.id, state, toJson({ model: result.model, players: result.players, unmatched: unknown }))
      setLive(state)
      for (const e of events) {
        const { text, tone } = describeEvent(e)
        addLog(text, tone)
      }
      setCounters((c) => ({ ...c, lastSaved: new Date() }))
      setStatus('Tracking')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      addLog(message, 'error')
      if (/no longer be tracked|Another scorekeeper/i.test(message)) {
        stoppedRef.current = true
        setStatus('Stopped: ' + message)
      }
    } finally {
      busyRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.id, roster, setLive, addLog])

  const tickRef = useRef(tick)
  tickRef.current = tick

  useEffect(() => {
    if (phase !== 'live' || !stream) return
    stoppedRef.current = false
    lastMaskRef.current = null
    lastReadAtRef.current = 0
    tickRef.current()
    return startWorkerTicker(TICK_MS, () => tickRef.current())
  }, [phase, stream])

  async function handleAddSub(playerId: string, teamId: string) {
    await addMatchSubstitute(match.id, playerId, teamId)
    setRoster(await getTrackerRoster(match))
    const team = teamId === match.team_a_id ? match.team_a : match.team_b
    addLog(`${activePlayers?.find((p) => p.id === playerId)?.name ?? 'Player'} added as a substitute for ${team.name}.`)
    setUnmatched((prev) =>
      prev.filter((n) => {
        const p = activePlayers?.find((x) => x.id === playerId)
        const norm = n.trim().toLowerCase()
        return !p || (norm !== p.name.trim().toLowerCase() && norm !== (p.game_name ?? '').trim().toLowerCase())
      }),
    )
  }

  async function handleRemoveSub(playerId: string) {
    await removeMatchSubstitute(match.id, playerId)
    setRoster(await getTrackerRoster(match))
    // The database drops their live row; keep local state in step so the next save doesn't send them.
    if (liveRef.current[playerId]) {
      const next = { ...liveRef.current }
      delete next[playerId]
      setLive(next)
    }
    addLog(`${roster.players[playerId]?.name ?? 'Player'} removed as a substitute.`, 'warn')
  }

  function togglePause() {
    pausedRef.current = !pausedRef.current
    setPaused(pausedRef.current)
    setStatus(pausedRef.current ? 'Paused' : 'Tracking')
  }

  if (claimError) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <BackLink />
        <ErrorState message={claimError} />
      </div>
    )
  }
  if (!claimed) return <LoadingState rows={4} />

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <BackLink />
      <MatchHeader match={match} phase={phase} />

      {phase === 'setup' || phase === 'live' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
          <div className="flex flex-col gap-6">
            {phase === 'setup' ? (
              <SetupCard
                stream={stream}
                preview={preview}
                crop={crop}
                onCropChange={setCrop}
                onShare={startSharing}
                onRefreshPreview={refreshPreview}
                onTest={testCapture}
                testing={testing}
                testResult={testResult}
                onStart={() => {
                  setPhase('live')
                  setStatus('Tracking')
                  addLog('Live tracking started.')
                }}
              />
            ) : (
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2">
                    <Radio className={cn('h-5 w-5', paused ? 'text-muted-foreground' : 'animate-pulse text-red-600')} /> Live tracking
                  </CardTitle>
                  <div className="flex flex-wrap gap-2">
                    {!stream ? (
                      <Button size="sm" onClick={startSharing}>
                        <MonitorUp className="h-4 w-4" /> Share tab again
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" onClick={togglePause}>
                      {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />} {paused ? 'Resume' : 'Pause'}
                    </Button>
                    <Button size="sm" variant="accent" onClick={() => setPhase('final')}>
                      <Square className="h-4 w-4" /> End match
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 text-sm">
                  <p>
                    <span className="font-semibold">Status:</span> {status}
                  </p>
                  <p className="text-muted-foreground">
                    Frames checked: {counters.checks} · Scoreboard reads: {counters.reads}
                    {counters.model ? ` · ${counters.model}` : ''}
                    {counters.lastSaved ? ` · Last saved ${counters.lastSaved.toLocaleTimeString()}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Keep the scoreboard open in the game and keep the Smash Karts window visible. Don't type in the game window —
                    any key closes the scoreboard.
                  </p>
                </CardContent>
              </Card>
            )}
            <LiveTables match={match} roster={roster} live={live} />
          </div>
          <div className="flex flex-col gap-6">
            <video ref={videoRef} muted playsInline className={cn('w-full rounded-lg border border-border bg-black', !stream && 'hidden')} />
            {unmatched.length > 0 ? (
              <UnmatchedCard names={unmatched} match={match} activePlayers={activePlayers ?? []} roster={roster} onAddSub={handleAddSub} />
            ) : null}
            <SubstitutesCard
              match={match}
              roster={roster}
              activePlayers={activePlayers ?? []}
              onAdd={handleAddSub}
              onRemove={handleRemoveSub}
            />
            <LogCard log={log} />
          </div>
        </div>
      ) : null}

      {phase === 'final' ? (
        <FinalStep
          match={match}
          roster={roster}
          live={live}
          onBack={() => setPhase('live')}
          onSubmitted={() => {
            stream?.getTracks().forEach((t) => t.stop())
            setPhase('done')
          }}
        />
      ) : null}

      {phase === 'done' ? <DoneCard match={match} /> : null}
    </div>
  )
}

function BackLink() {
  return (
    <Link to="/scorekeeper" className="flex w-fit items-center gap-1 text-sm font-semibold text-primary-700 hover:underline">
      <ArrowLeft className="h-4 w-4" /> All matches
    </Link>
  )
}

function MatchHeader({ match, phase }: { match: MatchWithTeams; phase: Phase }) {
  const labels: Record<Phase, string> = { setup: 'Setup', live: 'Live', final: 'Final result', done: 'Submitted' }
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-skpl-gradient p-5">
        <div className="flex items-center gap-3">
          <TeamLogo name={match.team_a.name} logoUrl={match.team_a.logo_url} className="h-12 w-12" />
          <div>
            <p className="font-display text-lg font-extrabold text-white">
              {match.team_a.name} vs {match.team_b.name}
            </p>
            <p className="text-xs font-semibold text-primary-100">
              {formatDateTime(match.scheduled_at)} · {MATCH_TYPE_LABELS[match.match_type]}
              {match.stage_label ? ` · ${match.stage_label}` : ''}
            </p>
          </div>
          <TeamLogo name={match.team_b.name} logoUrl={match.team_b.logo_url} className="h-12 w-12" />
        </div>
        <Badge variant={phase === 'live' ? 'destructive' : 'solid'}>{labels[phase]}</Badge>
      </div>
    </Card>
  )
}

function SetupCard({
  stream,
  preview,
  crop,
  onCropChange,
  onShare,
  onRefreshPreview,
  onTest,
  testing,
  testResult,
  onStart,
}: {
  stream: MediaStream | null
  preview: string | null
  crop: CropRect
  onCropChange: (c: CropRect) => void
  onShare: () => void
  onRefreshPreview: () => void
  onTest: () => void
  testing: boolean
  testResult: { image: string; rows: ExtractedRow[]; visible: boolean; model: string } | null
  onStart: () => void
}) {
  const slider = (key: keyof CropRect, label: string) => (
    <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
      {label}: {Math.round(crop[key] * 100)}%
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(crop[key] * 100)}
        onChange={(e) => onCropChange({ ...crop, [key]: Number(e.target.value) / 100 })}
      />
    </label>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set up the capture</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 text-sm">
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-muted-foreground">
          <li>Open Smash Karts in its own browser window, join the room as a spectator, and click the scoreboard icon (top-left).</li>
          <li>Click <b>Share Smash Karts tab</b> and pick the Smash Karts tab.</li>
          <li>Adjust the crop so the green box covers the scoreboard panel, then run a <b>Test capture</b>.</li>
          <li>Keep both windows visible side by side, and don't type in the game window.</li>
        </ol>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onShare}>
            <MonitorUp className="h-4 w-4" /> {stream ? 'Share a different tab' : 'Share Smash Karts tab'}
          </Button>
          <Button variant="outline" onClick={onRefreshPreview} disabled={!stream}>
            <Camera className="h-4 w-4" /> Refresh preview
          </Button>
          <Button variant="outline" onClick={() => onCropChange(DEFAULT_CROP)}>
            Reset crop
          </Button>
        </div>

        {preview ? (
          <div className="relative w-full overflow-hidden rounded-lg border border-border">
            <img src={preview} alt="Shared tab preview" className="block w-full" />
            <div
              className="pointer-events-none absolute border-4 border-green-500 bg-green-500/10"
              style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}
            />
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-muted-foreground">
            {stream ? 'Click Refresh preview to see the shared tab.' : 'Share the Smash Karts tab to see a preview here.'}
          </p>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {slider('x', 'Left')}
          {slider('y', 'Top')}
          {slider('w', 'Width')}
          {slider('h', 'Height')}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onTest} disabled={!stream || testing}>
            <Wand2 className="h-4 w-4" /> {testing ? 'Reading…' : 'Test capture'}
          </Button>
          <Button onClick={onStart} disabled={!stream}>
            <Play className="h-4 w-4" /> Start live tracking
          </Button>
        </div>

        {testResult ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <img src={testResult.image} alt="Test capture" className="w-full rounded-lg border border-border" />
            <div className="text-xs">
              {testResult.visible && testResult.rows.length > 0 ? (
                <>
                  <p className="mb-2 font-semibold text-green-700">Scoreboard read ({testResult.model}):</p>
                  <ul className="flex flex-col gap-1">
                    {testResult.rows.map((r, i) => (
                      <li key={i}>
                        <span className="font-semibold">{r.game_name}</span> ({r.team}) — {fmt(r)}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="font-semibold text-destructive">
                  No scoreboard found in the crop. Open the scoreboard in the game and adjust the crop.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function LiveTables({ match, roster, live }: { match: MatchWithTeams; roster: TrackerRoster; live: LiveState }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {[match.team_a, match.team_b].map((team) => {
        const players = roster.options.filter((p) => p.team_id === team.id)
        const flags = players.reduce((sum, p) => sum + (live[p.id] ? totalOf(live[p.id]).flags : 0), 0)
        return (
          <Card key={team.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{team.name}</CardTitle>
              <span className="flex items-center gap-1 font-display text-xl font-extrabold text-primary-800">
                <Flag className="h-4 w-4" /> {flags}
              </span>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead className="text-center">K</TableHead>
                    <TableHead className="text-center">D</TableHead>
                    <TableHead className="text-center">F</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {players.map((p) => {
                    const state = live[p.id]
                    const total = state ? totalOf(state) : null
                    return (
                      <TableRow key={p.id} className={cn(!state && 'opacity-50')}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="flex items-center gap-1.5 font-medium text-primary-900">
                              {p.name}
                              {roster.subIds.includes(p.id) ? (
                                <span className="rounded-full bg-accent-100 px-1.5 py-0.5 text-[10px] font-bold text-accent-800">SUB</span>
                              ) : null}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {p.game_name ?? 'no in-game name set'}
                              {state && !state.onBoard ? ' · left' : ''}
                              {state && state.sessions > 1 ? ` · reconnected ×${state.sessions - 1}` : ''}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{total?.kills ?? '–'}</TableCell>
                        <TableCell className="text-center">{total?.deaths ?? '–'}</TableCell>
                        <TableCell className="text-center">{total?.flags ?? '–'}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function UnmatchedCard({
  names,
  match,
  activePlayers,
  roster,
  onAddSub,
}: {
  names: string[]
  match: MatchWithTeams
  activePlayers: Player[]
  roster: TrackerRoster
  onAddSub: (playerId: string, teamId: string) => Promise<void>
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inMatch = new Set(roster.options.map((o) => o.id))
  const candidates = activePlayers
    .filter((p) => !inMatch.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, game_name: p.game_name, team_id: '' }))

  async function add(name: string, playerId: string, teamId: string) {
    setBusy(name)
    setError(null)
    try {
      await onAddSub(playerId, teamId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add the substitute.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="border-accent-300">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-accent-600" /> Unknown names
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <p className="text-muted-foreground">
          These names didn't match anyone in this match, so their stats aren't counted yet. If it's a substitute, add them
          below; otherwise an admin can fix the player's in-game name.
        </p>
        <ul className="flex flex-col gap-2">
          {names.map((n) => {
            const player = matchRowToPlayer(n, candidates)
            return (
              <li key={n} className="flex flex-col gap-1 rounded-md border border-border p-2">
                <span className="font-semibold">{n}</span>
                {player ? (
                  <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    Looks like {player.name}. Add as substitute for:
                    {[match.team_a, match.team_b].map((team) => (
                      <Button
                        key={team.id}
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={busy === n}
                        onClick={() => add(n, player.id, team.id)}
                      >
                        {team.short_name}
                      </Button>
                    ))}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">No active player has this name.</span>
                )}
              </li>
            )
          })}
        </ul>
        {error ? <p className="text-xs font-semibold text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  )
}

function SubstitutesCard({
  match,
  roster,
  activePlayers,
  onAdd,
  onRemove,
}: {
  match: MatchWithTeams
  roster: TrackerRoster
  activePlayers: Player[]
  onAdd: (playerId: string, teamId: string) => Promise<void>
  onRemove: (playerId: string) => Promise<void>
}) {
  const [playerId, setPlayerId] = useState('')
  const [teamId, setTeamId] = useState(match.team_a_id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inMatch = new Set(roster.options.map((o) => o.id))
  const candidates = activePlayers.filter((p) => !inMatch.has(p.id))
  const subs = roster.options.filter((o) => roster.subIds.includes(o.id))
  const teamName = (id: string) => (id === match.team_a_id ? match.team_a.name : match.team_b.name)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="h-4 w-4 text-primary-700" /> Substitutes
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {subs.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {subs.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-md bg-accent-50 px-2 py-1.5">
                <span>
                  <b>{s.name}</b> <span className="text-xs text-muted-foreground">for {teamName(s.team_id)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => run(() => onRemove(s.id))}
                  disabled={busy}
                  className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-destructive"
                  aria-label={`Remove substitute ${s.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No substitutes. Add one if a player outside the squads is playing.</p>
        )}
        <div className="flex flex-col gap-2">
          <select
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            className="h-9 rounded-md border border-input bg-white px-2 text-sm"
          >
            <option value="">Choose a player…</option>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.game_name && p.game_name.trim().toLowerCase() !== p.name.trim().toLowerCase() ? ` (${p.game_name})` : ''}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="h-9 flex-1 rounded-md border border-input bg-white px-2 text-sm"
            >
              <option value={match.team_a_id}>{match.team_a.name}</option>
              <option value={match.team_b_id}>{match.team_b.name}</option>
            </select>
            <Button
              size="sm"
              onClick={() =>
                run(async () => {
                  await onAdd(playerId, teamId)
                  setPlayerId('')
                })
              }
              disabled={!playerId || busy}
            >
              Add
            </Button>
          </div>
        </div>
        {error ? <p className="text-xs font-semibold text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  )
}

function LogCard({ log }: { log: LogEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity</CardTitle>
      </CardHeader>
      <CardContent className="max-h-96 overflow-y-auto text-xs">
        {log.length === 0 ? (
          <p className="text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {log.map((e) => (
              <li
                key={e.id}
                className={cn(e.tone === 'error' && 'text-destructive', e.tone === 'warn' && 'text-accent-700')}
              >
                <span className="text-muted-foreground">{e.at.toLocaleTimeString()} </span>
                {e.text}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

const SOURCE_LABELS: Record<FinalLine['source'], string> = {
  final: 'Final screenshot',
  'final+reconnect': 'Final + earlier session',
  'live-only': 'Left — last live',
  'not-seen': 'Did not play',
}

function FinalStep({
  match,
  roster,
  live,
  onBack,
  onSubmitted,
}: {
  match: MatchWithTeams
  roster: TrackerRoster
  live: LiveState
  onBack: () => void
  onSubmitted: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [readError, setReadError] = useState<string | null>(null)
  const [lines, setLines] = useState<FinalLine[] | null>(null)
  const [finalUnmatched, setFinalUnmatched] = useState<string[]>([])
  const [finalExtract, setFinalExtract] = useState<unknown>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const pickFile = useCallback((f: File | null) => {
    if (!f || !f.type.startsWith('image/')) return
    setFile(f)
    setFileUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return URL.createObjectURL(f)
    })
    setLines(null)
  }, [])

  // Paste a screenshot straight from the clipboard.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'))
      if (item) pickFile(item.getAsFile())
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [pickFile])

  async function readFinal() {
    if (!file) return
    setReading(true)
    setReadError(null)
    try {
      const image = await blobToBase64(file)
      const result = await extractScoreboard(image, 'final', file.type || 'image/png')
      const { matched, unmatched } = resolveRows(result.players, roster.options)
      if (matched.length === 0) {
        setReadError('No roster players were found in this screenshot. Check it is the end-of-match results screen.')
        return
      }
      setFinalUnmatched(unmatched)
      setFinalExtract({ model: result.model, players: result.players, unmatched })
      setLines(mergeFinal(live, matched, roster.options))
    } catch (err) {
      setReadError(err instanceof Error ? err.message : 'Unable to read the screenshot.')
    } finally {
      setReading(false)
    }
  }

  function applyLiveOnly() {
    setFinalExtract(null)
    setFinalUnmatched([])
    setLines(mergeFinal(live, [], roster.options))
  }

  function editLine(playerId: string, field: 'kills' | 'deaths' | 'flags', value: number) {
    setLines((prev) =>
      prev ? prev.map((l) => (l.playerId === playerId ? { ...l, [field]: Math.max(0, Math.round(value) || 0) } : l)) : prev,
    )
  }

  const scoreA = lines ? teamFlags(lines, match.team_a_id) : 0
  const scoreB = lines ? teamFlags(lines, match.team_b_id) : 0
  const tiedFinal = match.match_type === 'FINAL' && lines !== null && scoreA === scoreB
  const warnings = useMemo(() => (lines ?? []).filter((l) => l.warning), [lines])

  async function submit() {
    if (!lines) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await submitLiveResult(match.id, lines, toJson(finalExtract ?? { liveOnly: true }))
      setConfirmOpen(false)
      onSubmitted()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to submit the result.')
      setConfirmOpen(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>Final results screenshot</CardTitle>
          <Button size="sm" variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" /> Back to live tracking
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <p className="text-muted-foreground">
            Get the end-of-match results screenshot from a player (the one showing kills, deaths and flags), then choose it
            below, drag it in, or paste it with Ctrl+V.
          </p>
          <label
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-6 text-center hover:bg-secondary/50"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              pickFile(e.dataTransfer.files?.[0] ?? null)
            }}
          >
            <ImageUp className="h-6 w-6 text-primary-700" />
            <span className="font-semibold">{file ? file.name : 'Choose, drop or paste the screenshot'}</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
          </label>
          {fileUrl ? <img src={fileUrl} alt="Final screenshot" className="max-h-80 w-fit rounded-lg border border-border" /> : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={readFinal} disabled={!file || reading}>
              <Wand2 className="h-4 w-4" /> {reading ? 'Reading…' : 'Read final screenshot'}
            </Button>
            <Button variant="outline" onClick={applyLiveOnly}>
              Use live numbers only
            </Button>
          </div>
          {readError ? <p className="font-semibold text-destructive">{readError}</p> : null}
        </CardContent>
      </Card>

      {lines ? (
        <Card>
          <CardHeader>
            <CardTitle>Check the result before submitting</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5 text-sm">
            <div className="flex items-center justify-center gap-6 font-display text-2xl font-extrabold text-primary-900">
              <span>
                {match.team_a.short_name} {scoreA}
              </span>
              <span className="text-muted-foreground">–</span>
              <span>
                {scoreB} {match.team_b.short_name}
              </span>
            </div>
            <p className="text-center text-xs text-muted-foreground">Team score = sum of that team's player flags.</p>

            {tiedFinal ? (
              <p className="rounded-md bg-red-50 p-3 font-semibold text-red-700">
                A Final can't end in a tie. Check the flags before submitting.
              </p>
            ) : null}
            {warnings.length > 0 || finalUnmatched.length > 0 ? (
              <ul className="flex flex-col gap-1 rounded-md bg-accent-50 p-3 text-accent-800">
                {warnings.map((l) => (
                  <li key={l.playerId}>
                    <b>{roster.players[l.playerId]?.name}:</b> {l.warning}
                  </li>
                ))}
                {finalUnmatched.map((n) => (
                  <li key={n}>
                    <b>{n}</b> in the screenshot doesn't match any roster player — not counted.
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {[match.team_a, match.team_b].map((team) => (
                <div key={team.id}>
                  <p className="mb-2 font-display font-bold text-primary-900">{team.name}</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Player</TableHead>
                        <TableHead className="w-16 text-center">K</TableHead>
                        <TableHead className="w-16 text-center">D</TableHead>
                        <TableHead className="w-16 text-center">F</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines
                        .filter((l) => l.teamId === team.id)
                        .map((l) => (
                          <TableRow key={l.playerId} className={cn(l.source === 'not-seen' && 'opacity-60')}>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-medium">{roster.players[l.playerId]?.name}</span>
                                <span className="text-xs text-muted-foreground">{SOURCE_LABELS[l.source]}</span>
                              </div>
                            </TableCell>
                            {(['kills', 'deaths', 'flags'] as const).map((field) => (
                              <TableCell key={field} className="p-1">
                                <Input
                                  type="number"
                                  min={0}
                                  value={l[field]}
                                  onChange={(e) => editLine(l.playerId, field, Number(e.target.value))}
                                  className="h-8 px-1 text-center"
                                />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>

            {submitError ? <p className="font-semibold text-destructive">{submitError}</p> : null}
            <div className="flex justify-end">
              <Button size="lg" onClick={() => setConfirmOpen(true)} disabled={tiedFinal}>
                <Send className="h-4 w-4" /> Submit result
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Submit this result?"
        description={
          <p>
            {match.team_a.name} {scoreA} – {scoreB} {match.team_b.name}. The match becomes Completed and appears in standings
            straight away. An admin can still edit it and will set the MVP.
          </p>
        }
        confirmLabel="Submit"
        destructive={false}
        loading={submitting}
        onConfirm={submit}
      />
    </div>
  )
}

function DoneCard({ match }: { match: MatchWithTeams }) {
  const publicPath = match.season_id ? `/matches/${match.id}` : `/exhibitions/${match.id}`
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <CheckCircle2 className="h-10 w-10 text-green-600" />
        <p className="font-display text-xl font-bold">Result submitted</p>
        <p className="max-w-md text-sm text-muted-foreground">
          The match is now completed and public. An admin will review it and set the MVP.
        </p>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to={publicPath}>View scorecard</Link>
          </Button>
          <Button asChild>
            <Link to="/scorekeeper">Track another match</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
