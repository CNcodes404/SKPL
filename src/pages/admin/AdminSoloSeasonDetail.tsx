import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, Check, ChevronLeft, Copy, ImageUp, Plus, Save, Trash2, Undo2, Wand2, X } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import type { Player, SeasonStatus, SoloRound } from '@/types'

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
  const isCompleted = round.status === 'COMPLETED'

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

  function applyImport(imported: { playerId: string; kills: number; deaths: number }[]) {
    const byId = new Map(imported.map((i) => [i.playerId, i]))
    setRows(
      Object.fromEntries(
        players.map((p) => {
          const hit = byId.get(p.id)
          return [p.id, hit ? { played: true, kills: String(hit.kills), deaths: String(hit.deaths) } : { played: false, kills: '', deaths: '' }]
        }),
      ),
    )
  }

  return (
    <div className="flex flex-col gap-6">
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
                <Button onClick={() => save('COMPLETED')} disabled={saving}>
                  <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save Changes'}
                </Button>
                <Button variant="outline" onClick={() => save('SCHEDULED')} disabled={saving}>
                  <Undo2 className="h-4 w-4" /> Reopen Round
                </Button>
              </>
            ) : (
              <>
                <Button onClick={() => save('COMPLETED')} disabled={saving || preview.length === 0}>
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

      {players.length > 0 ? <SoloScreenshotImport players={players} onApply={applyImport} /> : null}

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
