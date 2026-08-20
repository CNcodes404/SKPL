import { supabase } from '@/lib/supabase'
import type { Player, Season, SeasonRoster, SeasonTeam, Team } from '@/types'
import type { GeneratedPairing } from '@/utils/schedule'

export async function listSeasons(): Promise<Season[]> {
  const { data, error } = await supabase.from('seasons').select('*').order('season_number', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getSeason(id: string): Promise<Season | null> {
  const { data, error } = await supabase.from('seasons').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

/** Returns the season with the highest season_number, or null if none exist. */
export async function getLatestSeason(): Promise<Season | null> {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .order('season_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function getSeasonTeams(seasonId: string): Promise<Team[]> {
  const { data, error } = await supabase
    .from('season_teams')
    .select('team_id, teams(*)')
    .eq('season_id', seasonId)
  if (error) throw error
  return (data ?? []).map((row: any) => row.teams).filter(Boolean)
}

export async function getSeasonRoster(seasonId: string): Promise<{ player: Player; team_id: string }[]> {
  const { data, error } = await supabase
    .from('season_rosters')
    .select('player_id, team_id, players(*)')
    .eq('season_id', seasonId)
  if (error) throw error
  return (data ?? []).map((row: any) => ({ player: row.players as Player, team_id: row.team_id as string }))
}

export async function getSeasonTeamRows(seasonId: string): Promise<SeasonTeam[]> {
  const { data, error } = await supabase.from('season_teams').select('*').eq('season_id', seasonId)
  if (error) throw error
  return data ?? []
}

export async function getSeasonRosterRows(seasonId: string): Promise<SeasonRoster[]> {
  const { data, error } = await supabase.from('season_rosters').select('*').eq('season_id', seasonId)
  if (error) throw error
  return data ?? []
}

export interface CreateSeasonInput {
  name: string
  season_number: number
  start_date: string | null
  end_date: string | null
  winning_points: number
  close_loss_enabled: boolean
  close_loss_points: number
  close_loss_max_difference: number
  playoff_team_count: number
  matches_per_opponent: number
  team_ids: string[]
  rosters: { team_id: string; player_id: string }[]
  matches: (GeneratedPairing & { scheduled_at: string })[]
}

export async function createSeasonWithSetup(input: CreateSeasonInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_season_with_setup', {
    p_name: input.name,
    p_season_number: input.season_number,
    p_start_date: input.start_date,
    p_end_date: input.end_date,
    p_winning_points: input.winning_points,
    p_close_loss_enabled: input.close_loss_enabled,
    p_close_loss_points: input.close_loss_points,
    p_close_loss_max_difference: input.close_loss_max_difference,
    p_playoff_team_count: input.playoff_team_count,
    p_matches_per_opponent: input.matches_per_opponent,
    p_team_ids: input.team_ids,
    p_rosters: input.rosters,
    p_matches: input.matches,
  })
  if (error) throw error
  return data as string
}

export async function deleteSeasonSchedule(seasonId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_season_schedule', { p_season_id: seasonId })
  if (error) throw error
}

export async function updateSeason(id: string, input: Partial<Season>): Promise<Season> {
  const { data, error } = await supabase.from('seasons').update(input).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function setSeasonMvp(id: string, playerId: string | null): Promise<void> {
  const { error } = await supabase.from('seasons').update({ mvp_player_id: playerId }).eq('id', id)
  if (error) throw error
}
