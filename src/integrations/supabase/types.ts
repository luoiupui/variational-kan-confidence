export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_decisions: {
        Row: {
          arm_cmd: string | null
          context: string | null
          frame_id: string | null
          id: string
          latency_ms: number | null
          model_version: string | null
          nav_cmd: string | null
          raw_output: string | null
          target_id: string | null
          ts: string
        }
        Insert: {
          arm_cmd?: string | null
          context?: string | null
          frame_id?: string | null
          id?: string
          latency_ms?: number | null
          model_version?: string | null
          nav_cmd?: string | null
          raw_output?: string | null
          target_id?: string | null
          ts?: string
        }
        Update: {
          arm_cmd?: string | null
          context?: string | null
          frame_id?: string | null
          id?: string
          latency_ms?: number | null
          model_version?: string | null
          nav_cmd?: string | null
          raw_output?: string | null
          target_id?: string | null
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_decisions_frame_id_fkey"
            columns: ["frame_id"]
            isOneToOne: false
            referencedRelation: "frames"
            referencedColumns: ["id"]
          },
        ]
      }
      frames: {
        Row: {
          height: number
          id: string
          sequence_id: string | null
          storage_path: string
          tag: string | null
          ts: string
          width: number
        }
        Insert: {
          height: number
          id?: string
          sequence_id?: string | null
          storage_path: string
          tag?: string | null
          ts?: string
          width: number
        }
        Update: {
          height?: number
          id?: string
          sequence_id?: string | null
          storage_path?: string
          tag?: string | null
          ts?: string
          width?: number
        }
        Relationships: []
      }
      runs: {
        Row: {
          ate_per_frame: Json | null
          checkpoint_hash: string | null
          completed_at: string | null
          created_at: string
          error: string | null
          fe: Json | null
          frames: number | null
          git_sha: string | null
          id: string
          keyframes: Json | null
          map_points: Json | null
          method: string
          metrics: Json | null
          notes: string | null
          requested_by: string | null
          sequence_id: string
          sequence_name: string
          started_at: string | null
          status: string
          trajectory_est: Json | null
          trajectory_gt: Json | null
        }
        Insert: {
          ate_per_frame?: Json | null
          checkpoint_hash?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          fe?: Json | null
          frames?: number | null
          git_sha?: string | null
          id?: string
          keyframes?: Json | null
          map_points?: Json | null
          method: string
          metrics?: Json | null
          notes?: string | null
          requested_by?: string | null
          sequence_id: string
          sequence_name: string
          started_at?: string | null
          status?: string
          trajectory_est?: Json | null
          trajectory_gt?: Json | null
        }
        Update: {
          ate_per_frame?: Json | null
          checkpoint_hash?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          fe?: Json | null
          frames?: number | null
          git_sha?: string | null
          id?: string
          keyframes?: Json | null
          map_points?: Json | null
          method?: string
          metrics?: Json | null
          notes?: string | null
          requested_by?: string | null
          sequence_id?: string
          sequence_name?: string
          started_at?: string | null
          status?: string
          trajectory_est?: Json | null
          trajectory_gt?: Json | null
        }
        Relationships: []
      }
      sequences: {
        Row: {
          created_at: string
          description: string | null
          dynamic_pct: number
          enabled: boolean
          family: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          dynamic_pct?: number
          enabled?: boolean
          family: string
          id: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          dynamic_pct?: number
          enabled?: boolean
          family?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      worker_heartbeats: {
        Row: {
          id: string
          last_ingest_at: string
          last_method: string | null
          last_run_id: string | null
          last_status: string | null
        }
        Insert: {
          id?: string
          last_ingest_at?: string
          last_method?: string | null
          last_run_id?: string | null
          last_status?: string | null
        }
        Update: {
          id?: string
          last_ingest_at?: string
          last_method?: string | null
          last_run_id?: string | null
          last_status?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
