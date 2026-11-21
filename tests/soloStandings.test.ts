// Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeSoloStandings,
  denseRankByKills,
  ordinal,
  scoreResult,
  DEFAULT_POSITION_POINTS,
} from '../src/utils/soloStandings'

const scoring = { points_per_kill: 1, position_points: DEFAULT_POSITION_POINTS }

test('dense ranking: equal kills share a position and the next player is not skipped', () => {
  const ranked = denseRankByKills([
    { id: 'd', kills: 9 },
    { id: 'a', kills: 15 },
    { id: 'b', kills: 11 },
    { id: 'c', kills: 11 },
    { id: 'e', kills: 7 },
  ])
  assert.deepEqual(
    ranked.map((r) => [r.id, r.position]),
    [
      ['a', 1],
      ['b', 2],
      ['c', 2],
      ['d', 3],
      ['e', 4],
    ],
  )
})

test('round score is kills plus position points; positions past the table score 0', () => {
  assert.deepEqual(scoreResult(scoring, { position: 3, kills: 9, deaths: 4 }), {
    position: 3,
    kills: 9,
    deaths: 4,
    killPoints: 9,
    positionPoints: 10,
    total: 19,
  })
  assert.equal(scoreResult(scoring, { position: 13, kills: 2, deaths: 0 }).total, 2)
})

test('standings count completed rounds only and apply tiebreakers', () => {
  const rounds = [
    { id: 'r1', round_number: 1, status: 'COMPLETED' },
    { id: 'r2', round_number: 2, status: 'COMPLETED' },
    { id: 'r3', round_number: 3, status: 'SCHEDULED' },
  ]
  const results = [
    // r1: A 1st (10 kills), B 2nd (8)
    { round_id: 'r1', player_id: 'A', position: 1, kills: 10, deaths: 2 },
    { round_id: 'r1', player_id: 'B', position: 2, kills: 8, deaths: 3 },
    // r2: B 1st (13), A 2nd (11)
    { round_id: 'r2', player_id: 'B', position: 1, kills: 13, deaths: 1 },
    { round_id: 'r2', player_id: 'A', position: 2, kills: 11, deaths: 5 },
    // r3 not completed: ignored
    { round_id: 'r3', player_id: 'A', position: 1, kills: 50, deaths: 0 },
  ]
  const rows = computeSoloStandings(scoring, rounds, results, ['A', 'B', 'C'])
  // A: 10+15 + 11+12 = 48, B: 8+12 + 13+15 = 48. Kills: A 21, B 21.
  // Best finish both 1st. Latest round (r2): B 1st beats A 2nd.
  assert.deepEqual(
    rows.map((r) => [r.playerId, r.rank, r.points]),
    [
      ['B', 1, 48],
      ['A', 2, 48],
      ['C', 3, 0],
    ],
  )
  assert.equal(rows[2].roundsPlayed, 0)
  assert.equal(rows[2].perRound.r1, null)
  assert.equal(rows[1].perRound.r3, undefined)
  assert.equal(rows[0].wins, 1)
  assert.equal(rows[0].mostKillsInRound, 13)
})

test('ordinal suffixes', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd'])
})
