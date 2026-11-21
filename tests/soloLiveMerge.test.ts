// Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applySoloCapture,
  resolveSoloRows,
  soloStateFromSaved,
  soloStateToRpcRows,
  totalDeaths,
  totalKills,
  type SoloLiveState,
  type SoloReading,
} from '../src/utils/soloLiveMerge'

const read = (kills: number, deaths: number | null = null, playerId = 'A'): SoloReading => ({ playerId, kills, deaths })

function run(steps: SoloReading[][]) {
  let state: SoloLiveState = {}
  const outcomes: string[] = []
  for (const step of steps) {
    const res = applySoloCapture(state, step)
    state = res.state
    outcomes.push(...res.logs.map((l) => l.outcome))
  }
  return { state, outcomes }
}

test('small rises apply; unchanged readings log nothing', () => {
  const { state, outcomes } = run([[read(2)], [read(3)], [read(3)], [read(6)]])
  assert.deepEqual(outcomes, ['FIRST', 'APPLIED', 'APPLIED'])
  assert.equal(totalKills(state.A), 6)
  assert.equal(state.A.needsReview, false)
})

test('a fall lowers kills and flags the player', () => {
  const { state, outcomes } = run([[read(4)], [read(3)]])
  assert.deepEqual(outcomes, ['FIRST', 'FALL'])
  assert.equal(totalKills(state.A), 3)
  assert.equal(state.A.needsReview, true)
})

test('a jump of more than 3 is held, then dropped if the next reading disagrees', () => {
  const { state, outcomes } = run([[read(4)], [read(14)], [read(5)]])
  assert.deepEqual(outcomes, ['FIRST', 'HELD', 'APPLIED'])
  assert.equal(totalKills(state.A), 5)
  assert.equal(state.A.held, null)
  assert.equal(state.A.needsReview, true)
})

test('a held jump is applied when the next reading confirms it', () => {
  const { state, outcomes } = run([[read(4)], [read(14)], [read(15)]])
  assert.deepEqual(outcomes, ['FIRST', 'HELD', 'CONFIRMED'])
  assert.equal(totalKills(state.A), 15)
})

test('a drop after missing a capture is a reconnect and earlier kills are kept', () => {
  const { state, outcomes } = run([[read(6, 2), read(1, 1, 'B')], [read(2, 1, 'B')], [read(1, 0), read(2, 1, 'B')]])
  assert.deepEqual(outcomes, ['FIRST', 'FIRST', 'APPLIED', 'RECONNECT'])
  assert.equal(totalKills(state.A), 7)
  assert.equal(totalDeaths(state.A), 2)
  assert.equal(state.A.sessions, 2)
  assert.equal(state.A.needsReview, true)
})

test('deaths going down with a kills drop is a reconnect even without a missed capture', () => {
  const { state, outcomes } = run([[read(8, 3)], [read(0, 0)]])
  assert.deepEqual(outcomes, ['FIRST', 'RECONNECT'])
  assert.equal(totalKills(state.A), 8)
})

test('deaths: null keeps last known, lower is ignored, higher applies', () => {
  const { state } = run([[read(1, 2)], [read(1, null)], [read(2, 1)], [read(2, 4)]])
  assert.equal(totalDeaths(state.A), 4)
})

test('players missing from a read are marked off the board; empty read changes nothing', () => {
  const first = applySoloCapture({}, [read(1), read(1, null, 'B')]).state
  const second = applySoloCapture(first, [read(2)]).state
  assert.equal(second.B.onBoard, false)
  assert.equal(second.B.missedCapture, true)
  assert.equal(applySoloCapture(second, []).state, second)
})

test('rows: BOT and spectator are ignored, "-" kills skipped, names matched exactly', () => {
  const roster = [
    { id: 'p1', name: 'Sudhir', game_name: 'Sudhir', team_id: '' },
    { id: 'p2', name: 'Drift', game_name: 'DriftDriver', team_id: '' },
  ]
  const { matched, unmatched } = resolveSoloRows(
    [
      { game_name: 'Sudhir', kills: 3, deaths: 2 },
      { game_name: 'BOT', kills: null, deaths: null },
      { game_name: 'bot', kills: 4, deaths: 0 },
      { game_name: 'driftdriver', kills: -1, deaths: null },
      { game_name: 'Stranger', kills: 1, deaths: 0 },
    ],
    roster,
  )
  assert.deepEqual(matched, [
    { playerId: 'p1', kills: 3, deaths: 2 },
    { playerId: 'p2', kills: -1, deaths: null },
  ])
  assert.deepEqual(unmatched, ['Stranger'])
})

test('state survives a save and reload round trip', () => {
  const { state } = run([[read(4)], [read(14)]])
  const restored = soloStateFromSaved(soloStateToRpcRows(state))
  assert.deepEqual(restored.A.held, { kills: 14, count: 1 })
  assert.equal(totalKills(restored.A), 4)
})
