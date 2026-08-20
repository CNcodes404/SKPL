/**
 * Optional development seed script.
 *
 * Populates demo teams, players, a sample season and a few matches so the
 * app has something to show locally. This is demo data only — it is never
 * imported by the application itself and can be safely deleted from the
 * Supabase dashboard at any time.
 *
 * Usage (from the project root):
 *   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxxx npm run seed
 *
 * The service role key is required because seeding writes league data
 * directly, bypassing Row Level Security. It is only ever used here, in a
 * local Node script — never in frontend code, and never committed.
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables before running the seed script.')
  process.exitCode = 1
  throw new Error('Missing environment variables.')
}

const supabase = createClient(url, serviceKey)

const TEAM_NAMES = [
  ['Purple Reign Racers', 'PRR'],
  ['Orange Blitz', 'OBZ'],
  ['Neon Vipers', 'NVP'],
  ['Iron Wolves', 'IWL'],
  ['Crimson Comets', 'CCM'],
  ['Shadow Falcons', 'SFA'],
] as const

const PLAYER_FIRST_NAMES = [
  'Aarav', 'Vihaan', 'Ishaan', 'Kabir', 'Reyansh', 'Advik', 'Arjun', 'Sai',
  'Diya', 'Ananya', 'Myra', 'Isha', 'Kiara', 'Anika', 'Riya', 'Meera',
  'Rohan', 'Karan', 'Dev', 'Yash', 'Nikhil', 'Aditya', 'Zara', 'Tara',
]

async function main() {
  console.log('Seeding demo data…')

  const { data: teams, error: teamError } = await supabase
    .from('teams')
    .insert(TEAM_NAMES.map(([name, short_name]) => ({ name, short_name })))
    .select()
  if (teamError) throw teamError
  console.log(`Created ${teams.length} teams.`)

  const playerRows = PLAYER_FIRST_NAMES.map((name) => ({ name }))
  const { data: players, error: playerError } = await supabase.from('players').insert(playerRows).select()
  if (playerError) throw playerError
  console.log(`Created ${players.length} players.`)

  const { data: season, error: seasonError } = await supabase
    .from('seasons')
    .insert({
      name: 'SKPL Season 1',
      season_number: 1,
      status: 'ACTIVE',
      winning_points: 3,
      close_loss_enabled: true,
      close_loss_points: 1,
      close_loss_max_difference: 2,
      playoff_team_count: 4,
      matches_per_opponent: 1,
    })
    .select()
    .single()
  if (seasonError) throw seasonError
  console.log(`Created season "${season.name}".`)

  const seasonTeamRows = teams.map((t) => ({ season_id: season.id, team_id: t.id }))
  const { error: seasonTeamError } = await supabase.from('season_teams').insert(seasonTeamRows)
  if (seasonTeamError) throw seasonTeamError

  const rosterRows: { season_id: string; team_id: string; player_id: string }[] = []
  players.forEach((player, i) => {
    const team = teams[i % teams.length]
    rosterRows.push({ season_id: season.id, team_id: team.id, player_id: player.id })
  })
  const { error: rosterError } = await supabase.from('season_rosters').insert(rosterRows)
  if (rosterError) throw rosterError
  console.log('Assigned rosters.')

  const pairings: { team_a_id: string; team_b_id: string }[] = []
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      pairings.push({ team_a_id: teams[i].id, team_b_id: teams[j].id })
    }
  }

  const now = Date.now()
  const matchRows = pairings.map((p, i) => ({
    season_id: season.id,
    team_a_id: p.team_a_id,
    team_b_id: p.team_b_id,
    match_type: 'REGULAR_SEASON' as const,
    status: (i < 4 ? 'COMPLETED' : 'SCHEDULED') as const,
    scheduled_at: new Date(now + (i - 4) * 2 * 24 * 60 * 60 * 1000).toISOString(),
    team_a_score: i < 4 ? 10 : null,
    team_b_score: i < 4 ? 6 + (i % 3) : null,
  }))

  const { data: matches, error: matchError } = await supabase.from('matches').insert(matchRows).select()
  if (matchError) throw matchError
  console.log(`Created ${matches.length} matches (4 completed).`)

  const rosterByTeam = new Map<string, string[]>()
  for (const row of rosterRows) {
    const list = rosterByTeam.get(row.team_id) ?? []
    list.push(row.player_id)
    rosterByTeam.set(row.team_id, list)
  }

  for (const match of matches.filter((m) => m.status === 'COMPLETED')) {
    const teamAPlayers = rosterByTeam.get(match.team_a_id) ?? []
    const teamBPlayers = rosterByTeam.get(match.team_b_id) ?? []
    const statRows = [
      ...distributeFlags(teamAPlayers, match.team_a_id, match.team_a_score ?? 0),
      ...distributeFlags(teamBPlayers, match.team_b_id, match.team_b_score ?? 0),
    ].map((row) => ({ ...row, match_id: match.id }))

    const { error: statsError } = await supabase.from('match_player_stats').insert(statRows)
    if (statsError) throw statsError
  }
  console.log('Recorded match statistics for completed matches.')

  console.log('Seed complete.')
}

function distributeFlags(playerIds: string[], teamId: string, totalFlags: number) {
  const rows = playerIds.map((player_id) => ({ player_id, team_id: teamId, kills: 0, deaths: 0, flags: 0 }))
  let remaining = totalFlags
  let i = 0
  while (remaining > 0 && rows.length > 0) {
    rows[i % rows.length].flags += 1
    remaining -= 1
    i += 1
  }
  rows.forEach((row) => {
    row.kills = row.flags + Math.floor(Math.random() * 3)
    row.deaths = Math.floor(Math.random() * 4)
  })
  return rows
}

main().catch((err) => {
  console.error('Seed failed:', err.message ?? err)
  process.exitCode = 1
})
