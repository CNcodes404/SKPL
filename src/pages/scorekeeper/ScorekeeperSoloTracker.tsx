import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Camera, CheckCircle2, MonitorUp, Pause, Play, Radio, RefreshCw, Square, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useAsync } from '@/hooks/useAsync'
import {
  claimSoloRound,
  endSoloLiveRound,
  extractSoloScoreboard,
  getSoloLiveStats,
  getSoloTrackerContext,
  recordSoloLive,
  type SoloTrackerContext,
} from '@/services/soloLive'
import { cn } from '@/lib/utils'
import {
  applySoloCapture,
  resolveSoloRows,
  soloStateFromSaved,
  totalDeaths,
  totalKills,
  KILL_JUMP_THRESHOLD,
  type SoloExtractedRow,
  type SoloLiveState,
  type SoloReadingLog,
} from '@/utils/soloLiveMerge'
import { denseRankByKills, ordinal } from '@/utils/soloStandings'
import {
  CHANGE_THRESHOLD,
  SOLO_LIST_CROP_KEY,
  SOLO_LIST_DEFAULT_CROP,
  SOLO_PANEL_CROP_KEY,
  SOLO_PANEL_DEFAULT_CROP,
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

const TICK_MS = 4000
const FORCE_REFRESH_MS = 30_000

type Phase = 'setup' | 'live' | 'done'
type BoxKey = 'list' | 'panel'

interface LogEntry {
  id: number
  at: Date
  text: string
  tone: 'info' | 'warn' | 'error'
}

export default function ScorekeeperSoloTracker() {
  const { roundId = '' } = useParams()
  const { data, loading, error, reload } = useAsync(() => getSoloTrackerContext(roundId), [roundId])

  if (loading && !data) return <LoadingState rows={6} />
  if (error || !data) return <ErrorState message={error ?? 'Round not found.'} />
  if (data.round.status === 'COMPLETED') {
    return <ErrorState message="This round is already completed, so it can no longer be tracked." />
  }
  return <SoloTracker ctx={data} onReloadPlayers={reload} />
}

function SoloTracker({ ctx, onReloadPlayers }: { ctx: SoloTrackerContext; onReloadPlayers: () => void }) {
  const { round, season, players, options } = ctx
  const [phase, setPhase] = useState<Phase>('setup')
  const [claimError, setClaimError] = useState<string | null>(null)
  const [claimed, setClaimed] = useState(false)

  const [live, setLiveState] = useState<SoloLiveState>({})
  const liveRef = useRef<SoloLiveState>({})
  const setLive = useCallback((s: SoloLiveState) => {
    liveRef.current = s
    setLiveState(s)
  }, [])

  const optionsRef = useRef(options)
  optionsRef.current = options

  const videoRef = useRef<HTMLVideoElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const grabberRef = useRef<(() => Promise<Frame | null>) | null>(null)

  const [crops, setCropsState] = useState<Record<BoxKey, CropRect>>(() => ({
    list: loadCrop(SOLO_LIST_CROP_KEY, SOLO_LIST_DEFAULT_CROP),
    panel: loadCrop(SOLO_PANEL_CROP_KEY, SOLO_PANEL_DEFAULT_CROP),
  }))
  const cropsRef = useRef(crops)
  const setCrop = (key: BoxKey, c: CropRect) => {
    const next = { ...cropsRef.current, [key]: c }
    cropsRef.current = next
    setCropsState(next)
    saveCrop(c, key === 'list' ? SOLO_LIST_CROP_KEY : SOLO_PANEL_CROP_KEY)
  }
  const [preview, setPreview] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ images: string[]; rows: SoloExtractedRow[]; visible: boolean; model: string } | null>(null)
  const [testing, setTesting] = useState(false)

  const [log, setLog] = useState<LogEntry[]>([])
  const logId = useRef(0)
  const addLog = useCallback((text: string, tone: LogEntry['tone'] = 'info') => {
    setLog((prev) => [{ id: ++logId.current, at: new Date(), text, tone }, ...prev].slice(0, 80))
  }, [])

  const [status, setStatus] = useState('Not started')
  const [counters, setCounters] = useState({ checks: 0, reads: 0, model: '', lastSaved: null as Date | null })
  const [unmatched, setUnmatched] = useState<string[]>([])
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)
  const busyRef = useRef(false)
  const lastMasksRef = useRef<{ list: Uint8Array; panel: Uint8Array } | null>(null)
  const lastReadAtRef = useRef(0)
  const stoppedRef = useRef(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [ending, setEnding] = useState(false)
  const [endError, setEndError] = useState<string | null>(null)

  const playerName = useCallback(
    (id: string) => players.find((p) => p.id === id)?.name ?? 'Unknown player',
    [players],
  )

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        await claimSoloRound(round.id)
        const saved = await getSoloLiveStats(round.id)
        if (!active) return
        if (saved.length > 0) {
          setLive(soloStateFromSaved(saved))
          addLog(`Resumed: restored live stats for ${saved.length} players.`)
        }
        setClaimed(true)
      } catch (err) {
        if (active) setClaimError(err instanceof Error ? err.message : 'Unable to claim this round.')
      }
    })()
    return () => {
      active = false
    }
  }, [round.id, setLive, addLog])

  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream])

  function describe(l: SoloReadingLog): { text: string; tone: LogEntry['tone'] } | null {
    const name = playerName(l.playerId)
    switch (l.outcome) {
      case 'FIRST':
        return { text: `${name} appeared with ${l.readKills} kills.`, tone: 'info' }
      case 'APPLIED':
        return null
      case 'FALL':
        return { text: `${name} fell — kills now ${l.totalKills}. Flagged for review.`, tone: 'warn' }
      case 'HELD':
        return { text: `${name}: reading of ${l.readKills} kills held back (jump of more than ${KILL_JUMP_THRESHOLD}). Flagged.`, tone: 'warn' }
      case 'CONFIRMED':
        return { text: `${name}: big jump confirmed — kills now ${l.totalKills}. Flagged.`, tone: 'warn' }
      case 'RECONNECT':
        return { text: `${name} reconnected — earlier kills kept, total ${l.totalKills}. Flagged.`, tone: 'warn' }
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

  /** Crops the player list and the stats panel from one frame. */
  async function grabCrops(): Promise<{ list: HTMLCanvasElement; panel: HTMLCanvasElement } | null> {
    const frame = await grabberRef.current?.()
    if (!frame) return null
    const list = drawCroppedFrame(frame, cropsRef.current.list, 600)
    const panel = drawCroppedFrame(frame, cropsRef.current.panel, 1000)
    frame.close?.()
    return { list, panel }
  }

  async function testCapture() {
    setTesting(true)
    try {
      const crop = await grabCrops()
      if (!crop) return
      const result = await extractSoloScoreboard([await canvasToBase64(crop.list), await canvasToBase64(crop.panel)])
      setTestResult({
        images: [crop.list.toDataURL('image/jpeg', 0.8), crop.panel.toDataURL('image/jpeg', 0.8)],
        rows: result.players,
        visible: result.scoreboard_visible,
        model: result.model,
      })
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
      const crop = await grabCrops()
      if (!crop) return
      const masks = { list: textMask(crop.list), panel: textMask(crop.panel) }
      const last = lastMasksRef.current
      const diff = last ? maskDifference(last.list, masks.list) + maskDifference(last.panel, masks.panel) : Number.POSITIVE_INFINITY
      const stale = Date.now() - lastReadAtRef.current > FORCE_REFRESH_MS
      setCounters((c) => ({ ...c, checks: c.checks + 1 }))
      if (diff < CHANGE_THRESHOLD && !stale) return

      const result = await extractSoloScoreboard([await canvasToBase64(crop.list), await canvasToBase64(crop.panel)])
      lastMasksRef.current = masks
      lastReadAtRef.current = Date.now()
      setCounters((c) => ({ ...c, reads: c.reads + 1, model: result.model }))

      const { matched, unmatched: unknown } = resolveSoloRows(result.players, optionsRef.current)
      if (unknown.length) setUnmatched((prev) => Array.from(new Set([...prev, ...unknown])))
      if (!result.scoreboard_visible || matched.length === 0) {
        setStatus('Player list not visible — check the crop boxes and that the game window is visible.')
        return
      }

      const { state, logs } = applySoloCapture(liveRef.current, matched)
      await recordSoloLive(round.id, state, logs)
      setLive(state)
      for (const l of logs) {
        const d = describe(l)
        if (d) addLog(d.text, d.tone)
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
  }, [round.id, setLive, addLog, playerName])

  const tickRef = useRef(tick)
  tickRef.current = tick

  useEffect(() => {
    if (phase !== 'live' || !stream) return
    stoppedRef.current = false
    lastMasksRef.current = null
    lastReadAtRef.current = 0
    tickRef.current()
    return startWorkerTicker(TICK_MS, () => tickRef.current())
  }, [phase, stream])

  function togglePause() {
    pausedRef.current = !pausedRef.current
    setPaused(pausedRef.current)
    setStatus(pausedRef.current ? 'Paused' : 'Tracking')
  }

  async function endRound() {
    setEnding(true)
    setEndError(null)
    try {
      stoppedRef.current = true
      await endSoloLiveRound(round.id)
      stream?.getTracks().forEach((t) => t.stop())
      setConfirmEnd(false)
      setPhase('done')
    } catch (err) {
      stoppedRef.current = false
      setEndError(err instanceof Error ? err.message : 'Unable to end the round.')
      setConfirmEnd(false)
    } finally {
      setEnding(false)
    }
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

  const flagged = Object.values(live).filter((p) => p.needsReview).length

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <BackLink />
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-skpl-gradient p-5">
          <div>
            <p className="font-display text-lg font-extrabold text-white">
              {season.name} · {round.name}
            </p>
            <p className="text-xs font-semibold text-primary-100">Solo League · {players.length} registered players</p>
          </div>
          <Badge variant={phase === 'live' ? 'destructive' : 'solid'}>
            {phase === 'setup' ? 'Setup' : phase === 'live' ? 'Live' : 'Ended'}
          </Badge>
        </div>
      </Card>

      {phase === 'done' ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
            <p className="font-display text-xl font-bold">Round ended</p>
            <p className="max-w-md text-sm text-muted-foreground">
              The live totals were saved for the admin, who will review any flagged players, fill in missing deaths and
              complete the round.
            </p>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link to={`/solo-league?season=${season.id}&tab=rounds&round=${round.id}`}>View on website</Link>
              </Button>
              <Button asChild>
                <Link to="/scorekeeper">Track another</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
          <div className="flex flex-col gap-6">
            {phase === 'setup' ? (
              <SoloSetupCard
                stream={stream}
                preview={preview}
                crops={crops}
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
                    <Button size="sm" variant="accent" onClick={() => setConfirmEnd(true)}>
                      <Square className="h-4 w-4" /> End round
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
                    Keep the Smash Karts window visible with the stats panel open. Kills for everyone come from the top-left
                    list; deaths only for rows visible in the centre panel. Don't type in the game window.
                  </p>
                  {endError ? <p className="font-semibold text-destructive">{endError}</p> : null}
                </CardContent>
              </Card>
            )}
            <SoloLiveTable live={live} playerName={playerName} />
          </div>
          <div className="flex flex-col gap-6">
            <video ref={videoRef} muted playsInline className={cn('w-full rounded-lg border border-border bg-black', !stream && 'hidden')} />
            {flagged > 0 ? (
              <p className="flex items-center gap-2 rounded-md bg-accent-50 p-3 text-sm text-accent-800">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {flagged} player{flagged === 1 ? '' : 's'} flagged for the
                admin to review after the round.
              </p>
            ) : null}
            {unmatched.length > 0 ? (
              <Card className="border-accent-300">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle className="h-4 w-4 text-accent-600" /> Unknown names
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 text-sm">
                  <p className="text-muted-foreground">
                    These names aren't registered for this season (or their in-game name isn't saved), so they aren't
                    counted. An admin can add them on the Solo League page, then reload the players here.
                  </p>
                  <ul className="flex flex-wrap gap-1.5">
                    {unmatched.map((n) => (
                      <li key={n} className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">
                        {n}
                      </li>
                    ))}
                  </ul>
                  <Button
                    size="sm"
                    variant="outline"
                    className="self-start"
                    onClick={() => {
                      setUnmatched([])
                      onReloadPlayers()
                    }}
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Reload players
                  </Button>
                </CardContent>
              </Card>
            ) : null}
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
                      <li key={e.id} className={cn(e.tone === 'error' && 'text-destructive', e.tone === 'warn' && 'text-accent-700')}>
                        <span className="text-muted-foreground">{e.at.toLocaleTimeString()} </span>
                        {e.text}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmEnd}
        onOpenChange={setConfirmEnd}
        title="End this round?"
        description={
          <p>
            Live tracking stops and the current totals are saved for the admin to review and complete. Players who were
            never seen are left out.
          </p>
        }
        confirmLabel="End round"
        destructive={false}
        loading={ending}
        onConfirm={endRound}
      />
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

function SoloLiveTable({ live, playerName }: { live: SoloLiveState; playerName: (id: string) => string }) {
  const rows = denseRankByKills(Object.values(live).map((p) => ({ p, kills: totalKills(p) })))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Live standings</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">No readings yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">Pos</TableHead>
                <TableHead>Player</TableHead>
                <TableHead className="text-center">K</TableHead>
                <TableHead className="text-center">D</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ p, kills, position }) => (
                <TableRow key={p.playerId} className={cn(!p.onBoard && 'opacity-60')}>
                  <TableCell className="font-display font-extrabold text-primary-800">{ordinal(position)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="flex items-center gap-1.5 font-medium text-primary-900">
                        {playerName(p.playerId)}
                        {p.needsReview ? <AlertTriangle className="h-3.5 w-3.5 text-accent-600" aria-label="Flagged" /> : null}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {!p.onBoard ? 'left · ' : ''}
                        {p.sessions > 1 ? `reconnected ×${p.sessions - 1} · ` : ''}
                        {p.held ? `held reading ${p.held.kills} · ` : ''}
                        {!p.deathsSeen ? 'deaths not seen yet' : ''}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center font-semibold">{kills}</TableCell>
                  <TableCell className="text-center">{p.deathsSeen || p.bankedDeaths ? totalDeaths(p) : '–'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

const BOX_STYLE: Record<BoxKey, { label: string; className: string }> = {
  list: { label: 'Player list (kills)', className: 'border-sky-500 bg-sky-500/10' },
  panel: { label: 'Stats panel (deaths)', className: 'border-green-500 bg-green-500/10' },
}

function SoloSetupCard({
  stream,
  preview,
  crops,
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
  crops: Record<BoxKey, CropRect>
  onCropChange: (key: BoxKey, c: CropRect) => void
  onShare: () => void
  onRefreshPreview: () => void
  onTest: () => void
  testing: boolean
  testResult: { images: string[]; rows: SoloExtractedRow[]; visible: boolean; model: string } | null
  onStart: () => void
}) {
  const [editing, setEditing] = useState<BoxKey>('list')
  const crop = crops[editing]
  const slider = (key: keyof CropRect, label: string) => (
    <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
      {label}: {Math.round(crop[key] * 100)}%
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(crop[key] * 100)}
        onChange={(e) => onCropChange(editing, { ...crop, [key]: Number(e.target.value) / 100 })}
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
          <li>Open Smash Karts in its own window, join the room as a spectator, and open the stats panel.</li>
          <li>
            Click <b>Share Smash Karts tab</b> and pick the Smash Karts tab.
          </li>
          <li>
            Fit the <b className="text-sky-600">blue box</b> over the top-left player list and the{' '}
            <b className="text-green-600">green box</b> over the centre stats panel, then run a <b>Test capture</b>.
          </li>
          <li>The player named BOT is ignored automatically.</li>
        </ol>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onShare}>
            <MonitorUp className="h-4 w-4" /> {stream ? 'Share a different tab' : 'Share Smash Karts tab'}
          </Button>
          <Button variant="outline" onClick={onRefreshPreview} disabled={!stream}>
            <Camera className="h-4 w-4" /> Refresh preview
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              onCropChange('list', SOLO_LIST_DEFAULT_CROP)
              onCropChange('panel', SOLO_PANEL_DEFAULT_CROP)
            }}
          >
            Reset boxes
          </Button>
        </div>

        {preview ? (
          <div className="relative w-full overflow-hidden rounded-lg border border-border">
            <img src={preview} alt="Shared tab preview" className="block w-full" />
            {(Object.keys(BOX_STYLE) as BoxKey[]).map((key) => (
              <div
                key={key}
                className={cn('pointer-events-none absolute border-4', BOX_STYLE[key].className)}
                style={{
                  left: `${crops[key].x * 100}%`,
                  top: `${crops[key].y * 100}%`,
                  width: `${crops[key].w * 100}%`,
                  height: `${crops[key].h * 100}%`,
                }}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-muted-foreground">
            {stream ? 'Click Refresh preview to see the shared tab.' : 'Share the Smash Karts tab to see a preview here.'}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {(Object.keys(BOX_STYLE) as BoxKey[]).map((key) => (
            <Button key={key} size="sm" variant={editing === key ? 'default' : 'outline'} onClick={() => setEditing(key)}>
              Adjust {BOX_STYLE[key].label}
            </Button>
          ))}
        </div>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr]">
            <div className="flex gap-2">
              {testResult.images.map((src, i) => (
                <img key={i} src={src} alt="Test capture" className="max-h-64 min-w-0 rounded-lg border border-border object-contain" />
              ))}
            </div>
            <div className="text-xs">
              {testResult.visible && testResult.rows.length > 0 ? (
                <>
                  <p className="mb-2 font-semibold text-green-700">Read ({testResult.model}):</p>
                  <ul className="flex flex-col gap-1">
                    {testResult.rows.map((r, i) => (
                      <li key={i}>
                        <span className="font-semibold">{r.game_name}</span> — {r.kills ?? '–'} kills
                        {r.deaths !== null && r.deaths !== undefined ? `, ${r.deaths} deaths` : ', deaths not visible'}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="font-semibold text-destructive">Nothing read. Check both boxes cover the panels.</p>
              )}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
