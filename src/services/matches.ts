import { supabase } from '@/lib/supabase'
import type { Match, MatchPlayerStat, MatchStatus, MatchType, MatchWithTeams } from '@/types'

export interface MatchFilters {
  seasonId?: string
  teamId?: string
  matchType?: MatchType
  status?: MatchStatus
}

function withTeamsSelect() {
  return supabase
    .from('matches')
    .select('*, team_a:team_a_id(*), team_b:team_b_id(*), mvp_player:mvp_player_id(*)')
}

export async function listMatches(filters: MatchFilters = {}): Promise<MatchWithTeams[]> {
  let query = withTeamsSelect().order('scheduled_at', { ascending: true })

  if (filters.seasonId) query = query.eq('season_id', filters.seasonId)
  if (filters.matchType) query = query.eq('match_type', filters.matchType)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.teamId) query = query.or(`team_a_id.eq.${filters.teamId},team_b_id.eq.${filters.teamId}`)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as MatchWithTeams[]
}

export async function listMatchesRaw(seasonId?: string): Promise<Match[]> {
  let query = supabase.from('matches').select('*')
  if (seasonId) query = query.eq('season_id', seasonId)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getMatch(id: string): Promise<MatchWithTeams | null> {
  const { data, error } = await withTeamsSelect().eq('id', id).maybeSingle()
  if (error) throw error
  return data as unknown as MatchWithTeams | null
}

export async function getMatchStats(matchId: string): Promise<MatchPlayerStat[]> {
  const { data, error } = await supabase.from('match_player_stats').select('*').eq('match_id', matchId)
  if (error) throw error
  return data ?? []
}

export async function listStatsForSeason(seasonId: string): Promise<MatchPlayerStat[]> {
  const { data, error } = await supabase
    .from('match_player_stats')
    .select('*, matches!inner(season_id)')
    .eq('matches.season_id', seasonId)
  if (error) throw error
  return (data ?? []) as unknown as MatchPlayerStat[]
}

export async function listAllStats(): Promise<MatchPlayerStat[]> {
  const { data, error } = await supabase.from('match_player_stats').select('*')
  if (error) throw error
  return data ?? []
}

export interface CreateMatchInput {
  season_id: string
  team_a_id: string
  team_b_id: string
  scheduled_at: string | null
  match_type: MatchType
  stage_label?: string | null
}

export async function createMatch(input: CreateMatchInput): Promise<Match> {
  const { data, error } = await supabase
    .from('matches')
    .insert({ ...input, status: 'SCHEDULED' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateMatchSchedule(
  id: string,
  input: { scheduled_at?: string | null; match_type?: MatchType; status?: MatchStatus; stage_label?: string | null },
): Promise<Match> {
  const { data, error } = await supabase.from('matches').update(input).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteMatch(id: string): Promise<void> {
  const { error } = await supabase.from('matches').delete().eq('id', id)
  if (error) throw error
}

export interface SaveMatchResultInput {
  matchId: string
  teamAScore: number
  teamBScore: number
  mvpPlayerId: string | null
  stats: { player_id: string; team_id: string; kills: number; deaths: number; flags: number }[]
  status: MatchStatus
}

export async function saveMatchResult(input: SaveMatchResultInput): Promise<void> {
  const { error } = await supabase.rpc('save_match_result', {
    p_match_id: input.matchId,
    p_team_a_score: input.teamAScore,
    p_team_b_score: input.teamBScore,
    p_mvp_player_id: input.mvpPlayerId,
    p_stats: input.stats,
    p_status: input.status,
  })
  if (error) throw error
}
