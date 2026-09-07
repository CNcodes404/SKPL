import { supabase } from '@/lib/supabase'
import type { Player, PlayerDetailStats, PlayerRole, Team } from '@/types'
import { ALL_SEASONS } from '@/components/shared/SeasonSelector'
import { calculatePlayerDetailStats } from '@/utils/calculations'

export async function listPlayers(includeInactive = false): Promise<Player[]> {
  let query = supabase.from('players').select('*').order('name', { ascending: true })
  if (!includeInactive) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getPlayer(id: string): Promise<Player | null> {
  const { data, error } = await supabase.from('players').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function createPlayer(input: {
  name: string
  image_url?: string | null
  game_name?: string | null
  role?: PlayerRole | null
}): Promise<Player> {
  const { data, error } = await supabase.from('players').insert(input).select().single()
  if (error) throw error
  return data
}

export async function updatePlayer(id: string, input: Partial<Player>): Promise<Player> {
  const { data, error } = await supabase.from('players').update(input).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function setPlayerActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('players').update({ is_active: isActive }).eq('id', id)
  if (error) throw error
}

export interface CareerTotals {
  kills: number
  deaths: number
  flags: number
  matchesPlayed: number
}

/** Aggregates a player's stats across every completed match, in every season. */
export async function getPlayersCareerStats(playerIds: string[]): Promise<Record<string, CareerTotals>> {
  if (playerIds.length === 0) return {}

  const { data, error } = await supabase
    .from('match_player_stats')
    .select('player_id, kills, deaths, flags, matches!inner(status)')
    .in('player_id', playerIds)
    .eq('matches.status', 'COMPLETED')
  if (error) throw error

  const totals: Record<string, CareerTotals> = {}
  for (const id of playerIds) totals[id] = { kills: 0, deaths: 0, flags: 0, matchesPlayed: 0 }

  for (const row of (data ?? []) as any[]) {
    const t = totals[row.player_id]
    if (!t) continue
    t.kills += row.kills
    t.deaths += row.deaths
    t.flags += row.flags
    t.matchesPlayed += 1
  }

  return totals
}

export interface PlayerHonors {
  goldTrophies: number
  silverTrophies: number
  matchMvps: number
  seasonMvps: number
}

/**
 * Career-wide trophy and MVP counts for every player who has at least one,
 * independent of any season filter. Gold/silver come from each season's
 * champion (stored) and runner-up (derived from that season's Final match,
 * since there's no stored runner-up column) rosters.
 */
export async function getPlayerHonors(): Promise<Record<string, PlayerHonors>> {
  const honors: Record<string, PlayerHonors> = {}
  const bump = (playerId: string, key: keyof PlayerHonors) => {
    if (!honors[playerId]) honors[playerId] = { goldTrophies: 0, silverTrophies: 0, matchMvps: 0, seasonMvps: 0 }
    honors[playerId][key]++
  }

  const { data: seasons, error: seasonsError } = await supabase.from('seasons').select('id, champion_team_id, mvp_player_id')
  if (seasonsError) throw seasonsError

  for (const s of seasons ?? []) {
    if (s.mvp_player_id) bump(s.mvp_player_id, 'seasonMvps')
  }

  const { data: finals, error: finalsError } = await supabase
    .from('matches')
    .select('season_id, team_a_id, team_b_id, team_a_score, team_b_score')
    .eq('match_type', 'FINAL')
    .eq('status', 'COMPLETED')
  if (finalsError) throw finalsError

  const runnerUpTeamBySeasonId = new Map<string, string>()
  for (const m of finals ?? []) {
    if (m.team_a_score == null || m.team_b_score == null || m.team_a_score === m.team_b_score) continue
    runnerUpTeamBySeasonId.set(m.season_id, m.team_a_score > m.team_b_score ? m.team_b_id : m.team_a_id)
  }

  const championTeamBySeasonId = new Map(
    (seasons ?? []).filter((s) => s.champion_team_id).map((s) => [s.id, s.champion_team_id as string]),
  )
  const relevantSeasonIds = [...new Set([...championTeamBySeasonId.keys(), ...runnerUpTeamBySeasonId.keys()])]

  if (relevantSeasonIds.length > 0) {
    const { data: rosters, error: rostersError } = await supabase
      .from('season_rosters')
      .select('season_id, team_id, player_id')
      .in('season_id', relevantSeasonIds)
    if (rostersError) throw rostersError

    for (const r of rosters ?? []) {
      if (championTeamBySeasonId.get(r.season_id) === r.team_id) bump(r.player_id, 'goldTrophies')
      if (runnerUpTeamBySeasonId.get(r.season_id) === r.team_id) bump(r.player_id, 'silverTrophies')
    }
  }

  const { data: matchMvps, error: mvpError } = await supabase.from('matches').select('mvp_player_id').not('mvp_player_id', 'is', null)
  if (mvpError) throw mvpError
  for (const m of matchMvps ?? []) {
    if (m.mvp_player_id) bump(m.mvp_player_id, 'matchMvps')
  }

  return honors
}

export interface PlayerWithCurrentTeam {
  player: Player
  currentTeam: Team | null
}

/** Every player with the team they most recently rostered for (by highest season_number). */
export async function listPlayersWithCurrentTeam(includeInactive = true): Promise<PlayerWithCurrentTeam[]> {
  const [players, rosterResult] = await Promise.all([
    listPlayers(includeInactive),
    supabase.from('season_rosters').select('player_id, teams(*), seasons(season_number)'),
  ])
  if (rosterResult.error) throw rosterResult.error

  const rosterByPlayer = new Map<string, any[]>()
  for (const row of (rosterResult.data ?? []) as any[]) {
    const list = rosterByPlayer.get(row.player_id) ?? []
    list.push(row)
    rosterByPlayer.set(row.player_id, list)
  }

  return players.map((player) => {
    const rows = rosterByPlayer.get(player.id) ?? []
    if (rows.length === 0) return { player, currentTeam: null }
    const latest = rows.reduce((a, b) => ((b.seasons?.season_number ?? 0) > (a.seasons?.season_number ?? 0) ? b : a))
    return { player, currentTeam: (latest.teams as Team) ?? null }
  })
}

export interface PlayerTeamInfo {
  team: Team
  isCaptain: boolean
}

/** The team a player most recently rostered for, across all seasons. */
export async function getPlayerCurrentTeam(playerId: string): Promise<PlayerTeamInfo | null> {
  const { data, error } = await supabase
    .from('season_rosters')
    .select('teams(*), seasons(season_number), is_captain')
    .eq('player_id', playerId)
  if (error) throw error

  const rows = (data ?? []) as any[]
  if (rows.length === 0) return null
  const latest = rows.reduce((a, b) => ((b.seasons?.season_number ?? 0) > (a.seasons?.season_number ?? 0) ? b : a))
  return latest.teams ? { team: latest.teams as Team, isCaptain: Boolean(latest.is_captain) } : null
}

/** The team a player was rostered to in a specific season, or null if they weren't part of it. */
export async function getPlayerTeamForSeason(playerId: string, seasonId: string): Promise<PlayerTeamInfo | null> {
  const { data, error } = await supabase
    .from('season_rosters')
    .select('teams(*), is_captain')
    .eq('player_id', playerId)
    .eq('season_id', seasonId)
    .maybeSingle()
  if (error) throw error
  const row = data as any
  return row?.teams ? { team: row.teams as Team, isCaptain: Boolean(row.is_captain) } : null
}

/** Detailed stats for a single player, scoped to a season or ALL_SEASONS, including per-match extremes. */
export async function getPlayerDetailStats(playerId: string, seasonId: string): Promise<PlayerDetailStats> {
  let query = supabase
    .from('match_player_stats')
    .select('*, matches!inner(status, season_id, team_a_id, team_b_id, team_a_score, team_b_score)')
    .eq('player_id', playerId)
  if (seasonId !== ALL_SEASONS) query = query.eq('matches.season_id', seasonId)

  const { data, error } = await query
  if (error) throw error

  const rows = (data ?? []) as any[]
  const completedMatchIds = new Set(rows.filter((r) => r.matches.status === 'COMPLETED').map((r) => r.match_id))
  const matches = rows.map((r) => ({
    id: r.match_id as string,
    status: r.matches.status,
    team_a_id: r.matches.team_a_id,
    team_b_id: r.matches.team_b_id,
    team_a_score: r.matches.team_a_score,
    team_b_score: r.matches.team_b_score,
  }))
  return calculatePlayerDetailStats(playerId, rows, completedMatchIds, matches)
}
