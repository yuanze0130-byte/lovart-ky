import { createClient } from '@supabase/supabase-js';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      user_credits: {
        Row: {
          user_id: string;
          credits: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          credits?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          credits?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          thumbnail: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          title: string;
          thumbnail?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          thumbnail?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      credit_transactions: {
        Row: {
          id: string;
          user_id: string;
          amount: number;
          type: string;
          description: string | null;
          reference_id: string | null;
          reference_type: string | null;
          balance_after: number | null;
          order_no: string | null;
          meta: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          amount: number;
          type: string;
          description?: string | null;
          reference_id?: string | null;
          reference_type?: string | null;
          balance_after?: number | null;
          order_no?: string | null;
          meta?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          amount?: number;
          type?: string;
          description?: string | null;
          reference_id?: string | null;
          reference_type?: string | null;
          balance_after?: number | null;
          order_no?: string | null;
          meta?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      signup_bonus_claims: {
        Row: {
          user_id: string;
          email_hash: string;
          ip_hash: string;
          credits: number;
          claimed_at: string;
        };
        Insert: {
          user_id: string;
          email_hash: string;
          ip_hash: string;
          credits: number;
          claimed_at?: string;
        };
        Update: {
          email_hash?: string;
          ip_hash?: string;
          credits?: number;
          claimed_at?: string;
        };
        Relationships: [];
      };
      ai_cost_reservations: {
        Row: {
          request_id: string;
          user_id: string;
          scope: string;
          estimated_cost_micros: number;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          request_id: string;
          user_id: string;
          scope: string;
          estimated_cost_micros: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      video_generation_jobs: {
        Row: {
          request_id: string;
          user_id: string;
          task_id: string | null;
          model_id: string;
          upstream_model: string;
          price_group: string;
          price_version: string;
          duration: number;
          resolution: string | null;
          quality_mode: string;
          generate_audio: boolean;
          estimated_comfly_cost_micros: number;
          charged_credits: number;
          refunded_credits: number;
          status: string;
          failure_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          request_id: string;
          user_id: string;
          task_id?: string | null;
          model_id: string;
          upstream_model: string;
          price_group: string;
          price_version: string;
          duration: number;
          resolution?: string | null;
          quality_mode: string;
          generate_audio?: boolean;
          estimated_comfly_cost_micros: number;
          charged_credits: number;
          refunded_credits?: number;
          status?: string;
          failure_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          task_id?: string | null;
          refunded_credits?: number;
          status?: string;
          failure_reason?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      redeem_code_batches: {
        Row: {
          id: string;
          name: string;
          credit_amount: number;
          channel: string | null;
          status: string;
          expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          credit_amount: number;
          channel?: string | null;
          status?: string;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          credit_amount?: number;
          channel?: string | null;
          status?: string;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      credit_packages: {
        Row: {
          id: string;
          code: string;
          name: string;
          price: number;
          credits: number;
          bonus_credits: number;
          currency: string;
          payment_provider: string;
          payment_channel: string;
          enabled: boolean;
          is_recommended: boolean;
          sort_order: number;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          price: number;
          credits: number;
          bonus_credits?: number;
          currency?: string;
          payment_provider?: string;
          payment_channel?: string;
          enabled?: boolean;
          is_recommended?: boolean;
          sort_order?: number;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          price?: number;
          credits?: number;
          bonus_credits?: number;
          currency?: string;
          payment_provider?: string;
          payment_channel?: string;
          enabled?: boolean;
          is_recommended?: boolean;
          sort_order?: number;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      redeem_codes: {
        Row: {
          id: string;
          batch_id: string;
          code_hash: string;
          code_mask: string;
          status: string;
          redeemed_by: string | null;
          redeemed_at: string | null;
          created_at: string;
          note: string | null;
        };
        Insert: {
          id?: string;
          batch_id: string;
          code_hash: string;
          code_mask: string;
          status?: string;
          redeemed_by?: string | null;
          redeemed_at?: string | null;
          created_at?: string;
          note?: string | null;
        };
        Update: {
          id?: string;
          batch_id?: string;
          code_hash?: string;
          code_mask?: string;
          status?: string;
          redeemed_by?: string | null;
          redeemed_at?: string | null;
          created_at?: string;
          note?: string | null;
        };
        Relationships: [];
      };
      redeem_code_redemptions: {
        Row: {
          id: string;
          code_id: string;
          batch_id: string;
          user_id: string;
          credit_amount: number;
          transaction_id: string | null;
          ip: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          code_id: string;
          batch_id: string;
          user_id: string;
          credit_amount: number;
          transaction_id?: string | null;
          ip?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          code_id?: string;
          batch_id?: string;
          user_id?: string;
          credit_amount?: number;
          transaction_id?: string | null;
          ip?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      credit_orders: {
        Row: {
          id: string;
          order_no: string;
          user_id: string;
          package_id: string | null;
          package_code: string | null;
          title: string | null;
          amount: number;
          credits: number;
          bonus_credits: number;
          currency: string;
          status: string;
          payment_provider: string;
          payment_channel: string;
          provider_order_id: string | null;
          provider_trade_no: string | null;
          provider_status: string | null;
          notify_verified: boolean;
          paid_at: string | null;
          credits_granted_at: string | null;
          refunded_at: string | null;
          client_ip: string | null;
          user_agent: string | null;
          extra: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_no: string;
          user_id: string;
          package_id?: string | null;
          package_code?: string | null;
          title?: string | null;
          amount: number;
          credits: number;
          bonus_credits?: number;
          currency?: string;
          status?: string;
          payment_provider?: string;
          payment_channel?: string;
          provider_order_id?: string | null;
          provider_trade_no?: string | null;
          provider_status?: string | null;
          notify_verified?: boolean;
          paid_at?: string | null;
          credits_granted_at?: string | null;
          refunded_at?: string | null;
          client_ip?: string | null;
          user_agent?: string | null;
          extra?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_no?: string;
          user_id?: string;
          package_id?: string | null;
          package_code?: string | null;
          title?: string | null;
          amount?: number;
          credits?: number;
          bonus_credits?: number;
          currency?: string;
          status?: string;
          payment_provider?: string;
          payment_channel?: string;
          provider_order_id?: string | null;
          provider_trade_no?: string | null;
          provider_status?: string | null;
          notify_verified?: boolean;
          paid_at?: string | null;
          credits_granted_at?: string | null;
          refunded_at?: string | null;
          client_ip?: string | null;
          user_agent?: string | null;
          extra?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      payment_events: {
        Row: {
          id: string;
          provider: string;
          event_type: string | null;
          order_no: string | null;
          provider_order_id: string | null;
          provider_trade_no: string | null;
          verified: boolean;
          processed: boolean;
          payload: Json;
          processing_result: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          provider?: string;
          event_type?: string | null;
          order_no?: string | null;
          provider_order_id?: string | null;
          provider_trade_no?: string | null;
          verified?: boolean;
          processed?: boolean;
          payload: Json;
          processing_result?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          provider?: string;
          event_type?: string | null;
          order_no?: string | null;
          provider_order_id?: string | null;
          provider_trade_no?: string | null;
          verified?: boolean;
          processed?: boolean;
          payload?: Json;
          processing_result?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      canvas_elements: {
        Row: {
          id: string;
          project_id: string;
          element_data: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          element_data: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          element_data?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_access_control: {
        Row: {
          user_id: string;
          is_whitelisted: boolean;
          daily_image_limit: number;
          daily_video_limit: number;
          daily_remove_bg_limit: number;
          daily_upscale_limit: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          is_whitelisted?: boolean;
          daily_image_limit?: number;
          daily_video_limit?: number;
          daily_remove_bg_limit?: number;
          daily_upscale_limit?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          is_whitelisted?: boolean;
          daily_image_limit?: number;
          daily_video_limit?: number;
          daily_remove_bg_limit?: number;
          daily_upscale_limit?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_daily_usage: {
        Row: {
          id: string;
          user_id: string;
          usage_date: string;
          image_count: number;
          video_count: number;
          remove_bg_count: number;
          upscale_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          usage_date: string;
          image_count?: number;
          video_count?: number;
          remove_bg_count?: number;
          upscale_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          usage_date?: string;
          image_count?: number;
          video_count?: number;
          remove_bg_count?: number;
          upscale_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_project_thumbnail_candidates: {
        Args: {
          p_project_ids: string[];
        };
        Returns: {
          project_id: string;
          content: string;
          updated_at: string;
        }[];
      };
      redeem_credit_code: {
        Args: {
          p_user_id: string;
          p_code_hash: string;
          p_ip?: string | null;
          p_user_agent?: string | null;
        };
        Returns: {
          success: boolean;
          error_code: string | null;
          credits_added: number;
          current_credits: number;
          transaction_id: string | null;
          redemption_id: string | null;
          batch_name: string | null;
        }[];
      };
      consume_credits_atomic: {
        Args: {
          p_user_id: string;
          p_amount: number;
          p_type: string;
          p_description: string;
          p_reference_id: string;
          p_reference_type?: string | null;
          p_meta?: Json;
        };
        Returns: {
          success: boolean;
          error_code: string | null;
          current_credits: number;
          required_credits: number;
          transaction_id: string | null;
          idempotent: boolean;
        }[];
      };
      refund_credits_atomic: {
        Args: {
          p_user_id: string;
          p_reference_id: string;
          p_original_type: string;
          p_description: string;
          p_meta?: Json;
        };
        Returns: {
          success: boolean;
          error_code: string | null;
          current_credits: number;
          refunded_credits: number;
          transaction_id: string | null;
          idempotent: boolean;
        }[];
      };
      claim_signup_bonus_atomic: {
        Args: {
          p_user_id: string;
          p_email_hash: string;
          p_ip_hash: string;
          p_amount: number;
          p_daily_ip_limit: number;
        };
        Returns: {
          success: boolean;
          error_code: string | null;
          credits_added: number;
          current_credits: number;
          idempotent: boolean;
        }[];
      };
      reserve_ai_cost_atomic: {
        Args: {
          p_request_id: string;
          p_user_id: string;
          p_scope: string;
          p_estimated_cost_micros: number;
          p_daily_limit_micros: number;
        };
        Returns: {
          success: boolean;
          error_code: string | null;
          used_cost_micros: number;
          remaining_cost_micros: number;
          idempotent: boolean;
        }[];
      };
      finalize_ai_cost_reservation: {
        Args: {
          p_request_id: string;
          p_status: string;
        };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type ProjectRow = Database['public']['Tables']['projects']['Row'];
export type ProjectInsert = Database['public']['Tables']['projects']['Insert'];
export type ProjectUpdate = Database['public']['Tables']['projects']['Update'];
export type CanvasElementRow = Database['public']['Tables']['canvas_elements']['Row'];
export type CanvasElementInsert = Database['public']['Tables']['canvas_elements']['Insert'];
export type CanvasElementUpdate = Database['public']['Tables']['canvas_elements']['Update'];
export type UserCreditsRow = Database['public']['Tables']['user_credits']['Row'];
export type UserCreditsInsert = Database['public']['Tables']['user_credits']['Insert'];
export type UserCreditsUpdate = Database['public']['Tables']['user_credits']['Update'];
export type CreditTransactionRow = Database['public']['Tables']['credit_transactions']['Row'];
export type CreditTransactionInsert = Database['public']['Tables']['credit_transactions']['Insert'];
export type CreditTransactionUpdate = Database['public']['Tables']['credit_transactions']['Update'];

export function createAuthedSupabaseClient(token: string | null) {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    }
  );
}

export function createServerSupabaseClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export function createServiceRoleSupabaseClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
