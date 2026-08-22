export type SeasonStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED'

export type MatchType =
  | 'REGULAR_SEASON'
  | 'QUALIFIER'
  | 'ELIMINATOR'
  | 'QUARTER_FINAL'
  | 'SEMI_FINAL'
  | 'FINAL'
  | 'THIRD_PLACE'
  | 'TIE_BREAKER'
  | 'CUSTOM'

export type MatchStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED'

export type PlayerRole = 'FLAGGER' | 'DEFENDER' | 'ALL_ROUNDER'

export interface Database {
  public: {
    Tables: {
      teams: {
        Row: {
          id: string
          name: string
          short_name: string
          logo_url: string | null
          description: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          short_name: string
          logo_url?: string | null
          description?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['teams']['Insert']>
        Relationships: []
      }
      players: {
        Row: {
          id: string
          name: string
          image_url: string | null
          game_name: string | null
          role: PlayerRole | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          image_url?: string | null
          game_name?: string | null
          role?: PlayerRole | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['players']['Insert']>
        Relationships: []
      }
      seasons: {
        Row: {
          id: string
          name: string
          season_number: number
          start_date: string | null
          end_date: string | null
          status: SeasonStatus
          winning_points: number
          close_loss_enabled: boolean
          close_loss_points: number
          close_loss_max_difference: number
          playoff_team_count: number
          matches_per_opponent: number
          mvp_player_id: string | null
          champion_team_id: string | null
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          season_number: number
          start_date?: string | null
          end_date?: string | null
          status?: SeasonStatus
          winning_points?: number
          close_loss_enabled?: boolean
          close_loss_points?: number
          close_loss_max_difference?: number
          playoff_team_count?: number
          matches_per_opponent?: number
          mvp_player_id?: string | null
          champion_team_id?: string | null
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['seasons']['Insert']>
        Relationships: []
      }
      season_teams: {
        Row: {
          id: string
          season_id: string
          team_id: string
        }
        Insert: {
          id?: string
          season_id: string
          team_id: string
        }
        Update: Partial<Database['public']['Tables']['season_teams']['Insert']>
        Relationships: []
      }
      season_rosters: {
        Row: {
          id: string
          season_id: string
          team_id: string
          player_id: string
        }
        Insert: {
          id?: string
          season_id: string
          team_id: string
          player_id: string
        }
        Update: Partial<Database['public']['Tables']['season_rosters']['Insert']>
        Relationships: []
      }
      matches: {
        Row: {
          id: string
          season_id: string
          team_a_id: string
          team_b_id: string
          scheduled_at: string | null
          match_type: MatchType
          status: MatchStatus
          team_a_score: number | null
          team_b_score: number | null
          mvp_player_id: string | null
          stage_label: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          season_id: string
          team_a_id: string
          team_b_id: string
          scheduled_at?: string | null
          match_type?: MatchType
          status?: MatchStatus
          team_a_score?: number | null
          team_b_score?: number | null
          mvp_player_id?: string | null
          stage_label?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['matches']['Insert']>
        Relationships: []
      }
      match_player_stats: {
        Row: {
          id: string
          match_id: string
          player_id: string
          team_id: string
          kills: number
          deaths: number
          flags: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          match_id: string
          player_id: string
          team_id: string
          kills?: number
          deaths?: number
          flags?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['match_player_stats']['Insert']>
        Relationships: []
      }
      admin_profiles: {
        Row: {
          id: string
          user_id: string
          is_admin: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          is_admin?: boolean
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['admin_profiles']['Insert']>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      create_season_with_setup: {
        Args: {
          p_name: string
          p_season_number: number
          p_start_date: string | null
          p_end_date: string | null
          p_winning_points: number
          p_close_loss_enabled: boolean
          p_close_loss_points: number
          p_close_loss_max_difference: number
          p_playoff_team_count: number
          p_matches_per_opponent: number
          p_team_ids: string[]
          p_rosters: { team_id: string; player_id: string }[]
          p_matches: { team_a_id: string; team_b_id: string; scheduled_at: string }[]
        }
        Returns: string
      }
      delete_season_schedule: {
        Args: { p_season_id: string }
        Returns: undefined
      }
      save_match_result: {
        Args: {
          p_match_id: string
          p_team_a_score: number
          p_team_b_score: number
          p_mvp_player_id: string | null
          p_stats: { player_id: string; team_id: string; kills: number; deaths: number; flags: number }[]
          p_status: MatchStatus
        }
        Returns: undefined
      }
    }
  }
}
