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

export type PlayerSkillTier = 'BEGINNER' | 'INTERMEDIATE' | 'EXPERT'
export type AuctionPlayerStatus = 'PENDING' | 'ON_BLOCK' | 'SOLD' | 'UNSOLD'
export type AuctionStatus = 'DRAFT' | 'RUNNING' | 'PAUSED' | 'COMPLETED'
export type AuctionModeType = 'AI' | 'MANUAL'
export type PlayerDrawModeType = 'AUTO' | 'MANUAL'

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
          skill_tier: PlayerSkillTier | null
          comparable_player_id: string | null
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
          skill_tier?: PlayerSkillTier | null
          comparable_player_id?: string | null
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
          purse_total: number
          purse_remaining: number
          retention_submitted: boolean
        }
        Insert: {
          id?: string
          season_id: string
          team_id: string
          purse_total?: number
          purse_remaining?: number
          retention_submitted?: boolean
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
          is_captain: boolean
          price: number | null
          created_at: string
        }
        Insert: {
          id?: string
          season_id: string
          team_id: string
          player_id: string
          is_captain?: boolean
          price?: number | null
          created_at?: string
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
      team_owner_profiles: {
        Row: {
          id: string
          user_id: string
          team_id: string
          owner_email: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          team_id: string
          owner_email?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['team_owner_profiles']['Insert']>
        Relationships: []
      }
      team_owner_invites: {
        Row: {
          id: string
          team_id: string
          token: string
          invited_email: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          used_at: string | null
          used_by: string | null
          revoked_at: string | null
        }
        Insert: {
          id?: string
          team_id: string
          token?: string
          invited_email?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          used_at?: string | null
          used_by?: string | null
          revoked_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['team_owner_invites']['Insert']>
        Relationships: []
      }
      team_owner_strategies: {
        Row: {
          id: string
          team_id: string
          weight_kills: number
          weight_deaths: number
          weight_flags: number
          weight_kd: number
          weight_winrate: number
          weight_mvp: number
          weight_experience: number
          weight_form: number
          role_bonus_flagger: number
          role_bonus_defender: number
          role_bonus_all_rounder: number
          aggressiveness: number
          budget_discipline: number
          persistence: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          team_id: string
          weight_kills?: number
          weight_deaths?: number
          weight_flags?: number
          weight_kd?: number
          weight_winrate?: number
          weight_mvp?: number
          weight_experience?: number
          weight_form?: number
          role_bonus_flagger?: number
          role_bonus_defender?: number
          role_bonus_all_rounder?: number
          aggressiveness?: number
          budget_discipline?: number
          persistence?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['team_owner_strategies']['Insert']>
        Relationships: []
      }
      season_auction_strategies_locked: {
        Row: {
          id: string
          season_id: string
          team_id: string
          weight_kills: number
          weight_deaths: number
          weight_flags: number
          weight_kd: number
          weight_winrate: number
          weight_mvp: number
          weight_experience: number
          weight_form: number
          role_bonus_flagger: number
          role_bonus_defender: number
          role_bonus_all_rounder: number
          aggressiveness: number
          budget_discipline: number
          persistence: number
          locked_at: string
        }
        Insert: {
          id?: string
          season_id: string
          team_id: string
          weight_kills: number
          weight_deaths: number
          weight_flags: number
          weight_kd: number
          weight_winrate: number
          weight_mvp: number
          weight_experience: number
          weight_form: number
          role_bonus_flagger: number
          role_bonus_defender: number
          role_bonus_all_rounder: number
          aggressiveness: number
          budget_discipline: number
          persistence: number
          locked_at?: string
        }
        Update: Partial<Database['public']['Tables']['season_auction_strategies_locked']['Insert']>
        Relationships: []
      }
      season_auction_players: {
        Row: {
          id: string
          season_id: string
          player_id: string
          base_price: number
          player_index: number | null
          index_components: Record<string, number> | null
          order_no: number | null
          status: AuctionPlayerStatus
          sold_team_id: string | null
          sold_price: number | null
          attempt_no: number
          first_attempt_outcome: AuctionPlayerStatus | null
          created_at: string
        }
        Insert: {
          id?: string
          season_id: string
          player_id: string
          base_price: number
          player_index?: number | null
          index_components?: Record<string, number> | null
          order_no?: number | null
          status?: AuctionPlayerStatus
          sold_team_id?: string | null
          sold_price?: number | null
          attempt_no?: number
          first_attempt_outcome?: AuctionPlayerStatus | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['season_auction_players']['Insert']>
        Relationships: []
      }
      season_auction_bids: {
        Row: {
          id: string
          season_id: string
          player_id: string
          team_id: string
          amount: number
          round_no: number
          created_at: string
        }
        Insert: {
          id?: string
          season_id: string
          player_id: string
          team_id: string
          amount: number
          round_no: number
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['season_auction_bids']['Insert']>
        Relationships: []
      }
      season_retentions: {
        Row: {
          id: string
          season_id: string
          team_id: string
          player_id: string
          retention_price: number
          created_at: string
        }
        Insert: {
          id?: string
          season_id: string
          team_id: string
          player_id: string
          retention_price: number
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['season_retentions']['Insert']>
        Relationships: []
      }
      season_auctions: {
        Row: {
          id: string
          season_id: string
          status: AuctionStatus
          max_retentions_per_team: number
          retention_price_increase_pct: number
          purse_default: number | null
          base_price_default: number | null
          min_squad_size: number | null
          max_squad_size: number | null
          order_strategy: string | null
          current_player_id: string | null
          current_high_bid: number | null
          current_high_team_id: string | null
          round_no: number
          contested_rounds: Record<string, number>
          critical_mode: boolean
          driver_token: string | null
          driver_heartbeat_at: string | null
          started_at: string | null
          started_by: string | null
          completed_at: string | null
          auction_mode: AuctionModeType
          player_draw_mode: PlayerDrawModeType
          initial_bid_increment: number | null
          increment_step_range: number | null
          increment_increase: number | null
          bid_timer_seconds: number | null
          bid_expires_at: string | null
          paused_bid_seconds_remaining: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          season_id: string
          status?: AuctionStatus
          max_retentions_per_team?: number
          retention_price_increase_pct?: number
          purse_default?: number | null
          base_price_default?: number | null
          min_squad_size?: number | null
          max_squad_size?: number | null
          order_strategy?: string | null
          current_player_id?: string | null
          current_high_bid?: number | null
          current_high_team_id?: string | null
          round_no?: number
          contested_rounds?: Record<string, number>
          critical_mode?: boolean
          driver_token?: string | null
          driver_heartbeat_at?: string | null
          started_at?: string | null
          started_by?: string | null
          completed_at?: string | null
          auction_mode?: AuctionModeType
          player_draw_mode?: PlayerDrawModeType
          initial_bid_increment?: number | null
          increment_step_range?: number | null
          increment_increase?: number | null
          bid_timer_seconds?: number | null
          bid_expires_at?: string | null
          paused_bid_seconds_remaining?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['season_auctions']['Insert']>
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
          p_enable_auction?: boolean
          p_max_retentions_per_team?: number
          p_retention_price_increase_pct?: number
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
      save_owner_strategy: {
        Args: {
          p_team_id: string
          p_weights: {
            kills: number
            deaths: number
            flags: number
            kd: number
            winrate: number
            mvp: number
            experience: number
            form: number
          }
          p_role_bonuses: { flagger: number; defender: number; all_rounder: number }
          p_aggressiveness: number
          p_budget_discipline: number
          p_persistence: number
        }
        Returns: undefined
      }
      save_owner_retentions: {
        Args: { p_season_id: string; p_team_id: string; p_player_ids: string[] | null }
        Returns: undefined
      }
      start_auction: {
        Args: {
          p_season_id: string
          p_purse_default: number
          p_base_price_default: number
          p_min_squad_size: number
          p_max_squad_size: number
          p_order_strategy: string
          p_purse_overrides: { team_id: string; purse_total: number }[]
          p_base_price_overrides: Record<string, number>
          p_player_indices: Record<string, { player_index: number; index_components: Record<string, number> }>
        }
        Returns: undefined
      }
      advance_auction_bid: {
        Args: { p_season_id: string; p_driver_token: string }
        Returns: Database['public']['Tables']['season_auctions']['Row']
      }
      pause_auction: {
        Args: { p_season_id: string }
        Returns: undefined
      }
      resume_auction: {
        Args: { p_season_id: string }
        Returns: undefined
      }
      admin_skip_player: {
        Args: { p_season_id: string; p_player_id: string }
        Returns: undefined
      }
      reset_season_auction: {
        Args: { p_season_id: string }
        Returns: undefined
      }
      get_invite_info: {
        Args: { p_token: string }
        Returns: { team_name: string | null; valid: boolean; reason: string | null }[]
      }
      claim_owner_invite: {
        Args: { p_token: string; p_user_id: string; p_email: string }
        Returns: undefined
      }
      remove_team_owner: {
        Args: { p_team_id: string }
        Returns: undefined
      }
      apply_roster_prices: {
        Args: { p_season_id: string; p_prices: Record<string, number> }
        Returns: undefined
      }
      start_manual_auction: {
        Args: {
          p_season_id: string
          p_purse_default: number
          p_min_squad_size: number
          p_max_squad_size: number
          p_order_strategy: string
          p_player_draw_mode: PlayerDrawModeType
          p_initial_bid_increment: number
          p_increment_step_range: number
          p_increment_increase: number
          p_bid_timer_seconds: number
          p_purse_overrides?: { team_id: string; purse_total: number }[]
          p_base_price_default?: number | null
          p_base_price_overrides?: Record<string, number>
          p_player_indices?: Record<string, { player_index: number; index_components: Record<string, number> }>
          p_direct_assignments?: { team_id: string; player_id: string; price: number }[]
        }
        Returns: undefined
      }
      draw_next_player: {
        Args: { p_season_id: string; p_player_id?: string | null }
        Returns: Database['public']['Tables']['season_auctions']['Row']
      }
      place_bid: {
        Args: { p_season_id: string; p_team_id: string; p_amount: number }
        Returns: Database['public']['Tables']['season_auctions']['Row']
      }
      resolve_expired_player: {
        Args: { p_season_id: string }
        Returns: Database['public']['Tables']['season_auctions']['Row']
      }
      pause_manual_auction: {
        Args: { p_season_id: string }
        Returns: undefined
      }
      resume_manual_auction: {
        Args: { p_season_id: string }
        Returns: undefined
      }
    }
  }
}
