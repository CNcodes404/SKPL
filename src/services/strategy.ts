import { supabase } from '@/lib/supabase'
import type { TeamOwnerStrategy } from '@/types'

export async function getOwnerStrategy(teamId: string): Promise<TeamOwnerStrategy | null> {
  const { data, error } = await supabase.from('team_owner_strategies').select('*').eq('team_id', teamId).maybeSingle()
  if (error) throw error
  return data
}

export interface OwnerStrategyWeights {
  kills: number
  deaths: number
  flags: number
  kd: number
  winrate: number
  mvp: number
  experience: number
  form: number
}

export interface OwnerStrategyRoleBonuses {
  flagger: number
  defender: number
  all_rounder: number
}

export async function saveOwnerStrategy(
  teamId: string,
  weights: OwnerStrategyWeights,
  roleBonuses: OwnerStrategyRoleBonuses,
  aggressiveness: number,
  budgetDiscipline: number,
  persistence: number,
): Promise<void> {
  const { error } = await supabase.rpc('save_owner_strategy', {
    p_team_id: teamId,
    p_weights: weights,
    p_role_bonuses: roleBonuses,
    p_aggressiveness: aggressiveness,
    p_budget_discipline: budgetDiscipline,
    p_persistence: persistence,
  })
  if (error) throw error
}
