import { supabase } from '@/lib/supabase'
import type { Season, Tournament } from '@/types'

export const ALL_TOURNAMENTS = 'ALL'

export async function listTournaments(): Promise<Tournament[]> {
  const { data, error } = await supabase.from('tournaments').select('*').order('sort_order', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function getTournamentBySlug(slug: string): Promise<Tournament | null> {
  const { data, error } = await supabase.from('tournaments').select('*').eq('slug', slug).maybeSingle()
  if (error) throw error
  return data
}

export async function getTournament(id: string): Promise<Tournament | null> {
  const { data, error } = await supabase.from('tournaments').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

/** Every team → the ids of the tournaments it's eligible for. */
export async function listTeamTournaments(): Promise<Record<string, string[]>> {
  const { data, error } = await supabase.from('team_tournaments').select('*')
  if (error) throw error
  const byTeam: Record<string, string[]> = {}
  for (const row of data ?? []) (byTeam[row.team_id] ??= []).push(row.tournament_id)
  return byTeam
}

export async function listTournamentTeamIds(tournamentId: string): Promise<string[]> {
  const { data, error } = await supabase.from('team_tournaments').select('team_id').eq('tournament_id', tournamentId)
  if (error) throw error
  return (data ?? []).map((row) => row.team_id)
}

/** Replaces the tournaments a team is eligible for. */
export async function setTeamTournaments(teamId: string, tournamentIds: string[]): Promise<void> {
  const { data: existing, error } = await supabase.from('team_tournaments').select('tournament_id').eq('team_id', teamId)
  if (error) throw error
  const current = new Set((existing ?? []).map((r) => r.tournament_id))
  const wanted = new Set(tournamentIds)

  const toAdd = tournamentIds.filter((id) => !current.has(id))
  const toRemove = [...current].filter((id) => !wanted.has(id))

  if (toAdd.length) {
    const { error: addError } = await supabase
      .from('team_tournaments')
      .insert(toAdd.map((tournament_id) => ({ team_id: teamId, tournament_id })))
    if (addError) throw addError
  }
  if (toRemove.length) {
    const { error: removeError } = await supabase
      .from('team_tournaments')
      .delete()
      .eq('team_id', teamId)
      .in('tournament_id', toRemove)
    if (removeError) throw removeError
  }
}

/** "SKCTF · Season 4" — a season's name prefixed with its tournament, for lists that mix tournaments. */
export function seasonLabel(season: Season, tournaments: Tournament[] | null | undefined): string {
  const tournament = tournaments?.find((t) => t.id === season.tournament_id)
  return tournament ? `${tournament.short_name} · ${season.name}` : season.name
}
