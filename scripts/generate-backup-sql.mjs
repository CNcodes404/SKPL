// One-off script: converts the JSON pulled from the live Supabase REST API
// (.backup_raw/*.json) into idempotent SQL insert scripts, used as a
// stand-in for a real backup on the free plan (no PITR/dashboard backups).
// Not part of the app build — run manually with `node scripts/generate-backup-sql.mjs`.
import { readFileSync, writeFileSync } from 'node:fs'

const RAW_DIR = '.backup_raw'
const OUT_DIR = 'supabase/backups'

function load(table) {
  return JSON.parse(readFileSync(`${RAW_DIR}/${table}.json`, 'utf8'))
}

function sqlValue(v) {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return String(v)
  return `'${String(v).replace(/'/g, "''")}'`
}

function insertStatements(table, rows) {
  if (rows.length === 0) return `-- ${table}: no rows\n`
  const columns = Object.keys(rows[0])
  return rows
    .map((row) => {
      const values = columns.map((c) => sqlValue(row[c])).join(', ')
      return `insert into ${table} (${columns.join(', ')}) values (${values}) on conflict (id) do nothing;`
    })
    .join('\n') + '\n'
}

const teams = load('teams')
const players = load('players')
const seasons = load('seasons')
const seasonTeams = load('season_teams')
const seasonRosters = load('season_rosters')
const matches = load('matches')
const matchPlayerStats = load('match_player_stats')

// Static reference data (not tied to any one season)
writeFileSync(
  `${OUT_DIR}/static_data.sql`,
  `-- Backup: teams + players (static/reference data), generated ${new Date().toISOString()}\n\n` +
    `-- teams\n${insertStatements('teams', teams)}\n` +
    `-- players\n${insertStatements('players', players)}\n`,
)

// One file per season: the season row + everything scoped to it
for (const season of seasons) {
  const sTeams = seasonTeams.filter((r) => r.season_id === season.id)
  const sRosters = seasonRosters.filter((r) => r.season_id === season.id)
  const sMatches = matches.filter((r) => r.season_id === season.id)
  const matchIds = new Set(sMatches.map((m) => m.id))
  const sStats = matchPlayerStats.filter((r) => matchIds.has(r.match_id))

  const fileName = `${OUT_DIR}/season${season.season_number}_data.sql`
  writeFileSync(
    fileName,
    `-- Backup: ${season.name} (season_number=${season.season_number}), generated ${new Date().toISOString()}\n` +
      `-- Depends on static_data.sql being loaded first (teams, players).\n\n` +
      `-- seasons\n${insertStatements('seasons', [season])}\n` +
      `-- season_teams\n${insertStatements('season_teams', sTeams)}\n` +
      `-- season_rosters\n${insertStatements('season_rosters', sRosters)}\n` +
      `-- matches\n${insertStatements('matches', sMatches)}\n` +
      `-- match_player_stats\n${insertStatements('match_player_stats', sStats)}\n`,
  )
  console.log(`Wrote ${fileName}: ${sTeams.length} season_teams, ${sRosters.length} rosters, ${sMatches.length} matches, ${sStats.length} stat rows`)
}

console.log('Wrote', `${OUT_DIR}/static_data.sql`, `: ${teams.length} teams, ${players.length} players`)
