import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronLeft,
  Copy,
  History,
  ImageUp,
  Plus,
  Radio,
  Save,
  Trash2,
  Undo2,
  Wand2,
  X,
} from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PlayerAvatar } from '@/components/shared/Avatar'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { PlayerSearchPicker } from '@/components/rounds/LineupTeamCard'
import { SoloPointsRules, SoloStandingsTable } from '@/components/solo/SoloTables'
import { useAsync } from '@/hooks/useAsync'
import { listPlayers } from '@/services/players'
import {
  addSoloRound,
  deleteSoloRound,
  deleteSoloSeason,
  getSoloSeasonData,
  saveSoloRoundResults,
  setSoloSeasonPlayers,
  updateSoloSeason,
  type SoloSeasonData,
} from '@/services/solo'
import {
  matchEntryToPlayer,
  parseImportJson,
  SOLO_SCREENSHOT_EXTRACTION_PROMPT,
  type ExtractedStat,
  type RosterPlayerOption,
} from '@/utils/screenshotImport'
import { denseRankByKills, ordinal, scoreResult } from '@/utils/soloStandings'
import { KILL_JUMP_THRESHOLD, SOLO_OUTCOME_LABELS, resolveSoloRows } from '@/utils/soloLiveMerge'
import { blobToBase64 } from '@/utils/frameCapture'
import { extractSoloScoreboard, getSoloRoundReview, isSessionActive, resolveSoloReview } from '@/services/soloLive'
import { cn } from '@/lib/utils'
import type { Player, SeasonStatus, SoloKillReading, SoloRound } from '@/types'

export default function AdminSoloSeasonDetail() {
  const { seasonId = '' } = useParams()
  const navigate = useNavigate()
  const { data, loading, error, reload } = useAsync(() => getSoloSeasonData(seasonId), [seasonId])
  const { data: allPlayers } = useAsync(() => listPlayers(), [])
  const [roundId, setRoundId] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!data) return
    if (!data.rounds.some((r) => r.id === roundId)) {
      const firstOpen = data.rounds.find((r) => r.status !== 'COMPLETED')
      setRoundId(firstOpen?.id ?? data.rounds[data.rounds.length - 1]?.id ?? '')
    }
  }, [data, roundId])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setActionError(null)
    try {
      await action()
      reload()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  if (loading && !data) return <LoadingState rows={6} />
  if (error || !data) return <ErrorState message="Solo League season not found." />

  const { season, rounds, players } = data
  const round = rounds.find((r) => r.id === roundId)
  const playerIds = players.map((p) => p.id)
  const full = players.length >= season.max_players

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/admin/solo-league"
        className="flex items-center gap-1 self-start text-sm font-semibold text-muted-foreground hover:text-primary-900"
      >
        <ChevronLeft className="h-4 w-4" /> Solo League
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-primary-900">{season.name}</h1>
          <p className="text-sm text-muted-foreground">
            Season #{season.season_number} · up to {season.max_players} players ·{' '}
            <Link to={`/solo-league?season=${season.id}`} className="font-semibold text-primary-700 hover:underline">
              View public page
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={season.status}
            onValueChange={(v) => run(() => updateSoloSeason(season.id, { status: v as SeasonStatus }))}
            disabled={busy}
          >
            <SelectTrigger className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => setConfirmDelete(true)} aria-label="Delete season">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
      {season.status !== 'COMPLETED' ? (
        <p className="-mt-3 text-xs text-muted-foreground">
          Set the status to Completed after the last round to crown the champion on the public page.
        </p>
      ) : null}

      {actionError ? (
        <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
          <AlertCircle className="h-4 w-4" /> {actionError}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            Players ({players.length} / {season.max_players})
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="sm:max-w-sm">
            <PlayerSearchPicker
              candidates={(allPlayers ?? []).filter((p) => !playerIds.includes(p.id)).map((player) => ({ player }))}
              onPick={(player) => run(() => setSoloSeasonPlayers(season.id, [...playerIds, player.id]))}
              placeholder={full ? 'Season is full' : 'Add player…'}
              disabled={full || busy}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {players.map((p) => (
              <span key={p.id} className="flex items-center gap-2 rounded-full border border-border bg-secondary/40 py-1 pl-1 pr-2 text-sm">
                <PlayerAvatar name={p.name} imageUrl={p.image_url} className="h-6 w-6 text-[9px]" />
                {p.name}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => setSoloSeasonPlayers(season.id, playerIds.filter((id) => id !== p.id)))}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${p.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {rounds.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setRoundId(r.id)}
            className={cn(
              'flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors',
              r.id === roundId ? 'border-primary-700 bg-primary-700 text-white' : 'border-border hover:bg-secondary',
            )}
          >
            {r.name}
            {r.status === 'COMPLETED' ? <Check className="h-3.5 w-3.5" /> : null}
          </button>
        ))}
        <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => addSoloRound(season.id, rounds))}>
          <Plus className="h-3.5 w-3.5" /> Add Round
        </Button>
      </div>

      {round ? (
        <RoundEditor key={round.id + round.status} data={data} round={round} onSaved={reload} onDeleted={() => { setRoundId(''); reload() }} />
      ) : (
        <p className="text-sm text-muted-foreground">No rounds yet. Add one above.</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Standings</CardTitle>
          <p className="text-sm text-muted-foreground">Completed rounds only — this is what the public page shows.</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SoloStandingsTable standings={data.standings} rounds={rounds} players={players} linkPlayers={false} />
          <SoloPointsRules season={season} />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this season?"
        description={`${season.name} and all of its rounds and results will be permanently deleted.`}
        confirmLabel="Delete Season"
        loading={busy}
        onConfirm={async () => {
          setBusy(true)
          try {
            await deleteSoloSeason(season.id)
            navigate('/admin/solo-league')
          } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Unable to delete season.')
            setConfirmDelete(false)
          } finally {
            setBusy(false)
          }
        }}
      />
    </div>
  )
}

interface EntryRow {
  played: boolean
  kills: string
  deaths: string
}

function RoundEditor({
  data,
  round,
  onSaved,
  onDeleted,
}: {
  data: SoloSeasonData
  round: SoloRound
  onSaved: () => void
  onDeleted: () => void
}) {
  const { season, players } = data
  const saved = data.results.filter((r) => r.round_id === round.id)

  const initial = () =>
    Object.fromEntries(
      players.map((p) => {
        const r = saved.find((s) => s.player_id === p.id)
        return [p.id, { played: !!r, kills: r ? String(r.kills) : '', deaths: r ? String(r.deaths) : '' }]
      }),
    ) as Record<string, EntryRow>

  const [rows, setRows] = useState<Record<string, EntryRow>>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmComplete, setConfirmComplete] = useState(false)
  const [reviewing, setReviewing] = useState<string | null>(null)
  const isCompleted = round.status === 'COMPLETED'

  // Live tracking data for this round: review alerts and every kills reading.
  const { data: review, reload: reloadReview } = useAsync(() => getSoloRoundReview(round.id), [round.id])
  const flaggedIds = new Set((review?.stats ?? []).filter((s) => s.needs_review).map((s) => s.player_id))
  const trackingLive = isSessionActive(review?.session)

  const update = (playerId: string, patch: Partial<EntryRow>) =>
    setRows((prev) => ({ ...prev, [playerId]: { ...(prev[playerId] ?? { played: false, kills: '', deaths: '' }), ...patch } }))

  const toInt = (s: string) => Math.max(0, Math.floor(Number(s) || 0))

  const preview = useMemo(() => {
    const entries = players
      .filter((p) => rows[p.id]?.played)
      .map((p) => ({ player: p, kills: toInt(rows[p.id].kills), deaths: toInt(rows[p.id].deaths) }))
    return denseRankByKills(entries).map((e) => ({ ...e, score: scoreResult(season, e) }))
  }, [rows, players, season])

  const positionOf = new Map(preview.map((e) => [e.player.id, e]))

  async function save(status: 'SCHEDULED' | 'COMPLETED') {
    setSaving(true)
    setError(null)
    try {
      await saveSoloRoundResults(
        round.id,
        preview.map((e) => ({ player_id: e.player.id, kills: e.kills, deaths: e.deaths })),
        status,
      )
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save results.')
    } finally {
      setSaving(false)
    }
  }

  /** Fills the table from an import. Deaths of null keep what's already entered. Players not imported are marked DNP. */
  function applyImport(imported: { playerId: string; kills: number; deaths: number | null }[]) {
    const byId = new Map(imported.map((i) => [i.playerId, i]))
    setRows((prev) =>
      Object.fromEntries(
        players.map((p) => {
          const hit = byId.get(p.id)
          if (!hit) return [p.id, { played: false, kills: '', deaths: '' }]
          const deaths = hit.deaths === null ? prev[p.id]?.deaths ?? '' : String(hit.deaths)
          return [p.id, { played: true, kills: String(Math.max(0, hit.kills)), deaths }]
        }),
      ),
    )
  }

  function requestComplete() {
    if (flaggedIds.size > 0) setConfirmComplete(true)
    else save('COMPLETED')
  }

  const reviewingPlayer = players.find((p) => p.id === reviewing)

  return (
    <div className="flex flex-col gap-6">
      {trackingLive ? (
        <p className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <Radio className="h-4 w-4 shrink-0 animate-pulse" /> A scorekeeper is tracking this round live. When they end the
          round, its results here are replaced with the live totals — edit after that.
        </p>
      ) : null}
      {flaggedIds.size > 0 ? (
        <div className="flex flex-col gap-2 rounded-md border border-accent-300 bg-accent-50 p-3 text-sm text-accent-900">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {flaggedIds.size} player{flaggedIds.size === 1 ? '' : 's'} need
            review — a fall, a kills jump of more than {KILL_JUMP_THRESHOLD}, or a reconnect was detected while tracking.
          </p>
          <div className="flex flex-wrap gap-2">
            {players
              .filter((p) => flaggedIds.has(p.id))
              .map((p) => (
                <Button key={p.id} size="sm" variant="outline" className="bg-white" onClick={() => setReviewing(p.id)}>
                  <History className="h-3.5 w-3.5" /> {p.name}
                </Button>
              ))}
          </div>
        </div>
      ) : null}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CardTitle>{round.name}</CardTitle>
            {isCompleted ? <Badge variant="success">Completed</Badge> : <Badge variant="outline">Not completed</Badge>}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" /> Delete Round
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Tick everyone who played and enter their kills and deaths. Position is set by kills — equal kills share a
            position. Only completed rounds count on the public page.
          </p>
          {players.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add players to the season first.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16 text-center">Played</TableHead>
                  <TableHead>Player</TableHead>
                  <TableHead className="w-24 text-center">Kills</TableHead>
                  <TableHead className="w-24 text-center">Deaths</TableHead>
                  <TableHead className="w-16 text-center">Pos</TableHead>
                  <TableHead className="w-16 text-center">Pts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...players]
                  .sort(
                    (a, b) =>
                      (positionOf.get(a.id)?.position ?? 999) - (positionOf.get(b.id)?.position ?? 999) ||
                      a.name.localeCompare(b.name),
                  )
                  .map((p) => {
                    const row = rows[p.id] ?? { played: false, kills: '', deaths: '' }
                    const e = positionOf.get(p.id)
                    return (
                      <TableRow key={p.id} className={row.played ? undefined : 'opacity-60'}>
                        <TableCell className="text-center">
                          <Checkbox checked={row.played} onChange={() => update(p.id, { played: !row.played })} />
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-2 font-semibold text-primary-900">
                            <PlayerAvatar name={p.name} imageUrl={p.image_url} className="h-6 w-6 text-[9px]" />
                            {p.name}
                            {flaggedIds.has(p.id) ? (
                              <button
                                type="button"
                                onClick={() => setReviewing(p.id)}
                                className="flex items-center gap-1 rounded-full bg-accent-100 px-2 py-0.5 text-[11px] font-bold text-accent-800 hover:bg-accent-200"
                              >
                                <AlertTriangle className="h-3 w-3" /> Review
                              </button>
                            ) : review?.readings.some((r) => r.player_id === p.id) ? (
                              <button
                                type="button"
                                onClick={() => setReviewing(p.id)}
                                className="text-muted-foreground hover:text-primary-700"
                                aria-label={`Kill history for ${p.name}`}
                              >
                                <History className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            className="h-8 text-center"
                            value={row.kills}
                            onChange={(ev) => update(p.id, { kills: ev.target.value, played: true })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            className="h-8 text-center"
                            value={row.deaths}
                            onChange={(ev) => update(p.id, { deaths: ev.target.value, played: true })}
                          />
                        </TableCell>
                        <TableCell className="text-center font-semibold">{e ? ordinal(e.position) : 'DNP'}</TableCell>
                        <TableCell className="text-center font-display font-extrabold text-primary-900">
                          {e ? e.score.total : '–'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
              </TableBody>
            </Table>
          )}

          {error ? (
            <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
              <AlertCircle className="h-4 w-4" /> {error}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {isCompleted ? (
              <>
                <Button onClick={requestComplete} disabled={saving}>
                  <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save Changes'}
                </Button>
                <Button variant="outline" onClick={() => save('SCHEDULED')} disabled={saving}>
                  <Undo2 className="h-4 w-4" /> Reopen Round
                </Button>
              </>
            ) : (
              <>
                <Button onClick={requestComplete} disabled={saving || preview.length === 0}>
                  <Check className="h-4 w-4" /> {saving ? 'Saving…' : 'Save & Complete Round'}
                </Button>
                <Button variant="outline" onClick={() => save('SCHEDULED')} disabled={saving}>
                  <Save className="h-4 w-4" /> Save Draft
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {players.length > 0 ? <SoloScreenshotUpload players={players} onApply={applyImport} /> : null}
      {players.length > 0 ? <SoloScreenshotImport players={players} onApply={applyImport} /> : null}

      {reviewingPlayer ? (
        <KillHistoryDialog
          player={reviewingPlayer}
          roundId={round.id}
          readings={(review?.readings ?? []).filter((r) => r.player_id === reviewingPlayer.id)}
          flagged={flaggedIds.has(reviewingPlayer.id)}
          currentKills={rows[reviewingPlayer.id]?.kills ?? ''}
          onClose={() => setReviewing(null)}
          onApply={(kills) => update(reviewingPlayer.id, { kills: String(kills), played: true })}
          onResolved={reloadReview}
        />
      ) : null}

      <ConfirmDialog
        open={confirmComplete}
        onOpenChange={setConfirmComplete}
        title="Complete with unreviewed alerts?"
        description={`${flaggedIds.size} player${flaggedIds.size === 1 ? '' : 's'} still need review. Complete the round anyway?`}
        confirmLabel="Complete anyway"
        destructive={false}
        loading={saving}
        onConfirm={async () => {
          setConfirmComplete(false)
          await save('COMPLETED')
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${round.name}?`}
        description="The round and all of its results will be permanently deleted."
        confirmLabel="Delete Round"
        loading={saving}
        onConfirm={async () => {
          setSaving(true)
          try {
            await deleteSoloRound(round.id)
            setConfirmDelete(false)
            onDeleted()
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to delete round.')
            setConfirmDelete(false)
          } finally {
            setSaving(false)
          }
        }}
      />
    </div>
  )
}

interface ImportRow {
  entry: ExtractedStat
  playerId: string | null
}

function SoloScreenshotImport({
  players,
  onApply,
}: {
  players: Player[]
  onApply: (rows: { playerId: string; kills: number; deaths: number }[]) => void
}) {
  const [showPrompt, setShowPrompt] = useState(false)
  const [copied, setCopied] = useState(false)
  const [text, setText] = useState('')
  const [rows, setRows] = useState<ImportRow[] | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)

  const roster: RosterPlayerOption[] = players.map((p) => ({ id: p.id, name: p.name, game_name: p.game_name, team_id: '' }))

  function handleParse() {
    setApplied(false)
    const result = parseImportJson(text)
    if (!result.ok) {
      setParseError(result.error)
      setRows(null)
      return
    }
    setParseError(null)
    setRows(result.entries.map((entry) => ({ entry, playerId: matchEntryToPlayer(entry, roster) })))
  }

  const matched = rows?.filter((r): r is ImportRow & { playerId: string } => r.playerId !== null) ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageUp className="h-4 w-4 text-primary-600" /> Import from Screenshot
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Upload the round's leaderboard screenshot to Claude (or any AI chat) with the prompt below, then paste its JSON
          reply here. Matched players' kills and deaths fill the table above; players not in the screenshot are marked as
          did not play. Review, then save.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setShowPrompt((v) => !v)}>
            <Wand2 className="h-3.5 w-3.5" /> {showPrompt ? 'Hide Prompt' : 'View Extraction Prompt'}
          </Button>
          {showPrompt ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                navigator.clipboard.writeText(SOLO_SCREENSHOT_EXTRACTION_PROMPT).then(() => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                })
              }
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy Prompt'}
            </Button>
          ) : null}
        </div>
        {showPrompt ? (
          <pre className="whitespace-pre-wrap rounded-md bg-secondary/60 p-3 text-xs text-primary-900">
            {SOLO_SCREENSHOT_EXTRACTION_PROMPT}
          </pre>
        ) : null}
        <Textarea
          placeholder='Paste the AI JSON reply here, e.g. [{ "game_name": "xX_Slayer_Xx", "kills": 12, "deaths": 3 }]'
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-[100px] font-mono text-xs"
        />
        <div className="flex items-center gap-3">
          <Button type="button" size="sm" onClick={handleParse} disabled={!text.trim()}>
            Parse
          </Button>
          {parseError ? (
            <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
              <AlertCircle className="h-3.5 w-3.5" /> {parseError}
            </p>
          ) : null}
        </div>
        {rows ? (
          <div className="flex flex-col gap-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Detected Name</TableHead>
                  <TableHead className="w-14 text-center">K</TableHead>
                  <TableHead className="w-14 text-center">D</TableHead>
                  <TableHead>Matched Player</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{row.entry.game_name}</TableCell>
                    <TableCell className="text-center">{row.entry.kills}</TableCell>
                    <TableCell className="text-center">{row.entry.deaths}</TableCell>
                    <TableCell>
                      <Select
                        value={row.playerId ?? 'NONE'}
                        onValueChange={(v) =>
                          setRows((prev) => (prev ? prev.map((r, j) => (j === i ? { ...r, playerId: v === 'NONE' ? null : v } : r)) : prev))
                        }
                      >
                        <SelectTrigger className="h-8 w-full max-w-[220px]">
                          <SelectValue placeholder="— Select Player —" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE">— Not in this season —</SelectItem>
                          {players.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                disabled={matched.length === 0}
                onClick={() => {
                  onApply(matched.map((r) => ({ playerId: r.playerId, kills: r.entry.kills, deaths: r.entry.deaths })))
                  setApplied(true)
                }}
              >
                Apply {matched.length} of {rows.length}
              </Button>
              {applied ? (
                <p className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                  <Check className="h-3.5 w-3.5" /> Applied — review the table above and save.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

const ALERT_OUTCOMES = new Set(['FALL', 'HELD', 'CONFIRMED', 'RECONNECT'])

/** Every kills reading the tracker saw for one player, oldest first, with a way to set the final kills. */
function KillHistoryDialog({
  player,
  roundId,
  readings,
  flagged,
  currentKills,
  onClose,
  onApply,
  onResolved,
}: {
  player: Player
  roundId: string
  readings: SoloKillReading[]
  flagged: boolean
  currentKills: string
  onClose: () => void
  onApply: (kills: number) => void
  onResolved: () => void
}) {
  const [kills, setKills] = useState(currentKills)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function apply(markReviewed: boolean) {
    setBusy(true)
    setError(null)
    try {
      if (kills.trim() !== '') onApply(Math.max(0, Math.floor(Number(kills) || 0)))
      if (markReviewed) {
        await resolveSoloReview(roundId, player.id)
        onResolved()
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to mark as reviewed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" /> {player.name}: kill history
          </DialogTitle>
          <DialogDescription>
            Every reading taken while tracking, oldest first. Total is the kills the live board showed after that reading.
            Pick a value or type the final kills, then save the round.
          </DialogDescription>
        </DialogHeader>

        {readings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No readings were saved for this player.</p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead className="text-center">Read</TableHead>
                  <TableHead className="text-center">Deaths</TableHead>
                  <TableHead>What happened</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {readings.map((r) => (
                  <TableRow key={r.id} className={ALERT_OUTCOMES.has(r.outcome) ? 'bg-accent-50' : undefined}>
                    <TableCell className="whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleTimeString()}</TableCell>
                    <TableCell className="text-center font-semibold">{r.read_kills}</TableCell>
                    <TableCell className="text-center">{r.read_deaths ?? '–'}</TableCell>
                    <TableCell className="text-xs">
                      {ALERT_OUTCOMES.has(r.outcome) ? <AlertTriangle className="mr-1 inline h-3 w-3 text-accent-600" /> : null}
                      {SOLO_OUTCOME_LABELS[r.outcome]}
                    </TableCell>
                    <TableCell className="text-center font-display font-extrabold">{r.total_kills}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => setKills(String(Math.max(0, r.total_kills)))}
                      >
                        Use {Math.max(0, r.total_kills)}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-primary-900">
            Final kills
            <Input type="number" min={0} className="h-9 w-28" value={kills} onChange={(e) => setKills(e.target.value)} />
          </label>
          <p className="pb-2 text-xs text-muted-foreground">Goes into the table. Save the round afterwards.</p>
        </div>
        {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => apply(flagged)} disabled={busy}>
            <Check className="h-4 w-4" /> {busy ? 'Saving…' : flagged ? 'Use & mark reviewed' : 'Use'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Upload a screenshot; Gemini reads every player's kills (and deaths where the stats panel shows them). */
function SoloScreenshotUpload({
  players,
  onApply,
}: {
  players: Player[]
  onApply: (rows: { playerId: string; kills: number; deaths: number | null }[]) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const pick = useCallback((f: File | null) => {
    if (!f || !f.type.startsWith('image/')) return
    setFile(f)
    setMessage(null)
    setFileUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return URL.createObjectURL(f)
    })
  }, [])

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'))
      if (item) pick(item.getAsFile())
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [pick])

  async function read() {
    if (!file) return
    setReading(true)
    setMessage(null)
    try {
      const result = await extractSoloScoreboard([await blobToBase64(file)], file.type || 'image/png')
      const roster = players.map((p) => ({ id: p.id, name: p.name, game_name: p.game_name, team_id: '' }))
      const { matched, unmatched } = resolveSoloRows(result.players, roster)
      if (matched.length === 0) {
        setMessage({ tone: 'error', text: 'No registered players were found in this screenshot.' })
        return
      }
      onApply(matched.map((m) => ({ playerId: m.playerId, kills: m.kills, deaths: m.deaths })))
      const noDeaths = matched.filter((m) => m.deaths === null).length
      setMessage({
        tone: 'ok',
        text:
          `Filled ${matched.length} player${matched.length === 1 ? '' : 's'}` +
          (noDeaths ? `; ${noDeaths} without deaths (not in the stats panel), enter those by hand` : '') +
          (unmatched.length ? `. Not registered: ${unmatched.join(', ')}` : '') +
          '. Review the table and save.',
      })
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Unable to read the screenshot.' })
    } finally {
      setReading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageUp className="h-4 w-4 text-primary-600" /> Upload Screenshot (auto-detect)
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <p className="text-muted-foreground">
          Upload a screenshot of the game showing the top-left player list (and the stats panel if open). Kills are read for
          every player, deaths for players shown in the stats panel. BOT is ignored. Players not in the screenshot are
          marked as did not play.
        </p>
        <label
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-5 text-center hover:bg-secondary/50"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            pick(e.dataTransfer.files?.[0] ?? null)
          }}
        >
          <ImageUp className="h-6 w-6 text-primary-700" />
          <span className="font-semibold">{file ? file.name : 'Choose, drop or paste (Ctrl+V) a screenshot'}</span>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
        </label>
        {fileUrl ? <img src={fileUrl} alt="Screenshot" className="max-h-72 w-fit rounded-lg border border-border" /> : null}
        <Button className="self-start" onClick={read} disabled={!file || reading}>
          <Wand2 className="h-4 w-4" /> {reading ? 'Reading…' : 'Read screenshot'}
        </Button>
        {message ? (
          <p className={cn('text-sm font-medium', message.tone === 'ok' ? 'text-green-700' : 'text-destructive')}>{message.text}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}
