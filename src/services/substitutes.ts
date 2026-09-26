import { supabase } from '@/lib/supabase'
import type { MatchSubstitute, Player } from '@/types'

export interface MatchSubstituteWithPlayer extends MatchSubstitute {
  player: Player
}

/** A season match's substitutes. Empty (not an error) if the substitutes table doesn't exist yet. */
export async function listMatchSubstitutes(matchId: string): Promise<MatchSubstituteWithPlayer[]> {
  const { data, error } = await supabase
    .from('match_substitutes')
    .select('*, player:player_id(*)')
    .eq('match_id', matchId)
    .order('created_at', { ascending: true })
  if (error) return []
  return (data ?? []) as unknown as MatchSubstituteWithPlayer[]
}

export async function addMatchSubstitute(matchId: string, playerId: string, teamId: string): Promise<void> {
  const { error } = await supabase.rpc('add_match_substitute', {
    p_match_id: matchId,
    p_player_id: playerId,
    p_team_id: teamId,
  })
  if (error) throw new Error(error.message)
}

export async function removeMatchSubstitute(matchId: string, playerId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_match_substitute', { p_match_id: matchId, p_player_id: playerId })
  if (error) throw new Error(error.message)
}
