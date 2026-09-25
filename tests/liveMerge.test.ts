// Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyLiveCapture,
  cleanGameName,
  mergeFinal,
  resolveRows,
  stateFromSaved,
  stateToRpcRows,
  teamFlags,
  totalOf,
  type LiveState,
  type MatchedRow,
} from '../src/utils/liveMerge'
import type { RosterPlayerOption } from '../src/utils/screenshotImport'

const RED = 'team-red'
const BLUE = 'team-blue'
const roster: RosterPlayerOption[] = [
  { id: 'jag', name: 'Jaguar', game_name: 'JaguarVortex', team_id: BLUE },
  { id: 'echo', name: 'Echo', game_name: 'EchoRush', team_id: RED },
  { id: 'rahul', name: 'Rahul', game_name: null, team_id: RED },
  { id: 'bench', name: 'Bench Player', game_name: 'BenchGuy', team_id: BLUE },
]

const row = (playerId: string, teamId: string, kills: number, deaths: number, flags: number): MatchedRow => ({
  playerId,
  teamId,
  stats: { kills, deaths, flags },
})

function run(captures: MatchedRow[][]): LiveState {
  let state: LiveState = {}
  for (const c of captures) state = applyLiveCapture(state, c).state
  return state
}

test('strips the final-screen numeric prefix from names', () => {
  assert.equal(cleanGameName('147.18-JaguarVortex'), 'JaguarVortex')
  assert.equal(cleanGameName('397.98 - EchoRush'), 'EchoRush')
  assert.equal(cleanGameName('JaguarVortex'), 'JaguarVortex')
  assert.equal(cleanGameName('Player-2'), 'Player-2')
})

test('resolves names to roster players, drops the Spectator row, reports unknown names', () => {
  const { matched, unmatched } = resolveRows(
    [
      { game_name: '147.18-JaguarVortex', kills: 2, deaths: 0, flags: 6 },
      { game_name: 'echorush', kills: 0, deaths: 2, flags: 0 },
      { game_name: 'Rahul', kills: 1, deaths: 1, flags: 0 },
      { game_name: 'Spectator', kills: 0, deaths: 0, flags: 0 },
      { game_name: 'RandomGuest', kills: 9, deaths: 9, flags: 9 },
    ],
    roster,
  )
  assert.deepEqual(
    matched.map((m) => [m.playerId, m.teamId, m.stats.kills]),
    [
      ['jag', BLUE, 2],
      ['echo', RED, 0],
      ['rahul', RED, 1],
    ],
  )
  assert.deepEqual(unmatched, ['RandomGuest'])
})

test('normal growth just updates the current session', () => {
  const s = run([[row('jag', BLUE, 1, 0, 0)], [row('jag', BLUE, 3, 1, 2)]])
  assert.deepEqual(totalOf(s.jag), { kills: 3, deaths: 1, flags: 2 })
  assert.equal(s.jag.sessions, 1)
})

test('player who leaves keeps their last stats', () => {
  const s = run([
    [row('jag', BLUE, 5, 2, 1), row('echo', RED, 1, 3, 0)],
    [row('echo', RED, 2, 3, 0)],
  ])
  assert.deepEqual(totalOf(s.jag), { kills: 5, deaths: 2, flags: 1 })
  assert.equal(s.jag.onBoard, false)
})

test('reconnect after being missing: previous session is banked and added', () => {
  const s = run([
    [row('jag', BLUE, 5, 2, 1)],
    [row('echo', RED, 0, 0, 0)], // jag missing (disconnected)
    [row('jag', BLUE, 1, 0, 0), row('echo', RED, 0, 1, 0)],
  ])
  assert.deepEqual(s.jag.banked, { kills: 5, deaths: 2, flags: 1 })
  assert.deepEqual(totalOf(s.jag), { kills: 6, deaths: 2, flags: 1 })
  assert.equal(s.jag.sessions, 2)
})

test('reconnect between captures (never seen missing): all stats dropped', () => {
  const s = run([[row('jag', BLUE, 5, 2, 1)], [row('jag', BLUE, 1, 0, 0)]])
  assert.deepEqual(totalOf(s.jag), { kills: 6, deaths: 2, flags: 1 })
})

test('a single misread number is ignored, not treated as a reconnect', () => {
  const { state, events } = applyLiveCapture(run([[row('jag', BLUE, 5, 2, 1)]]), [row('jag', BLUE, 3, 2, 1)])
  assert.deepEqual(totalOf(state.jag), { kills: 5, deaths: 2, flags: 1 })
  assert.equal(state.jag.sessions, 1)
  assert.equal(events[0].type, 'misread')
})

test('an empty capture (scoreboard closed) changes nothing', () => {
  const before = run([[row('jag', BLUE, 5, 2, 1)]])
  const { state } = applyLiveCapture(before, [])
  assert.equal(state, before)
  assert.equal(state.jag.onBoard, true)
})

test('final screenshot: banked + final for present players, live for leavers, 0 for unseen', () => {
  const live = run([
    [row('jag', BLUE, 5, 2, 1), row('echo', RED, 1, 3, 0), row('rahul', RED, 2, 0, 1)],
    [row('echo', RED, 1, 3, 0), row('rahul', RED, 2, 1, 1)], // jag left
    [row('jag', BLUE, 1, 0, 0), row('echo', RED, 2, 3, 0)], // jag back; rahul left for good
  ])
  const lines = mergeFinal(live, [row('jag', BLUE, 3, 1, 1), row('echo', RED, 2, 4, 0)], roster)
  const by = Object.fromEntries(lines.map((l) => [l.playerId, l]))

  assert.deepEqual([by.jag.kills, by.jag.deaths, by.jag.flags, by.jag.source], [8, 3, 2, 'final'])
  assert.deepEqual([by.echo.kills, by.echo.deaths, by.echo.flags, by.echo.source], [2, 4, 0, 'final'])
  assert.deepEqual([by.rahul.kills, by.rahul.deaths, by.rahul.flags, by.rahul.source], [2, 1, 1, 'live-only'])
  assert.deepEqual([by.bench.kills, by.bench.source], [0, 'not-seen'])

  assert.equal(teamFlags(lines, BLUE), 2)
  assert.equal(teamFlags(lines, RED), 1)
})

test('final screenshot catches a reconnect that happened after the last live capture', () => {
  const live = run([[row('jag', BLUE, 5, 2, 1)]])
  const [jag] = mergeFinal(live, [row('jag', BLUE, 1, 0, 0)], roster.filter((p) => p.id === 'jag'))
  assert.deepEqual([jag.kills, jag.deaths, jag.flags, jag.source], [6, 2, 1, 'final+reconnect'])
})

test('final lower than live on one number: final wins, with a warning', () => {
  const live = run([[row('jag', BLUE, 8, 2, 1)]]) // live misread 3 as 8
  const [jag] = mergeFinal(live, [row('jag', BLUE, 3, 2, 1)], roster.filter((p) => p.id === 'jag'))
  assert.equal(jag.kills, 3)
  assert.match(jag.warning ?? '', /lower than the last live reading/)
})

test('state survives a save/reload round trip', () => {
  const live = run([[row('jag', BLUE, 5, 2, 1)], [row('echo', RED, 0, 0, 0)], [row('jag', BLUE, 1, 0, 0)]])
  const saved = stateToRpcRows(live).map((r) => ({ ...r, team_id: live[r.player_id].teamId }))
  const restored = stateFromSaved(saved)
  assert.deepEqual(totalOf(restored.jag), totalOf(live.jag))
  assert.equal(restored.echo.onBoard, false)
  assert.equal(restored.echo.missedCapture, true)
})
