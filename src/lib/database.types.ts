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
      ai_insights: {
        Row: {
          content: string
          created_at: string
          id: string
          kind: string
          model: string
          period: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          kind: string
          model: string
          period: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          kind?: string
          model?: string
          period?: string
          user_id?: string
        }
        Relationships: []
      }
      app_state: {
        Row: {
          schema_version: number
          state: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          schema_version: number
          state: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          schema_version?: number
          state?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      boards: {
        Row: {
          created_at: string
          id: string
          size: number
          title: string
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          size?: number
          title?: string
          user_id: string
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          size?: number
          title?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          created_at: string
          id: string
          photo_url: string | null
          reflection: string | null
          tile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          photo_url?: string | null
          reflection?: string | null
          tile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          photo_url?: string | null
          reflection?: string | null
          tile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_tile_id_fkey"
            columns: ["tile_id"]
            isOneToOne: false
            referencedRelation: "tiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_prefs: {
        Row: {
          coach_days: number[]
          coach_minutes: number[]
          enabled: boolean
          expo_push_token: string | null
          last_sent_slot: string | null
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          coach_days?: number[]
          coach_minutes?: number[]
          enabled?: boolean
          expo_push_token?: string | null
          last_sent_slot?: string | null
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          coach_days?: number[]
          coach_minutes?: number[]
          enabled?: boolean
          expo_push_token?: string | null
          last_sent_slot?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tiles: {
        Row: {
          board_id: string
          completed_at: string | null
          domain: string
          id: string
          is_free_space: boolean
          is_signature: boolean
          label: string
          position: number
        }
        Insert: {
          board_id: string
          completed_at?: string | null
          domain?: string
          id?: string
          is_free_space?: boolean
          is_signature?: boolean
          label?: string
          position: number
        }
        Update: {
          board_id?: string
          completed_at?: string | null
          domain?: string
          id?: string
          is_free_space?: boolean
          is_signature?: boolean
          label?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "tiles_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      smallint_array_in_range: {
        Args: { arr: number[]; hi: number; lo: number }
        Returns: boolean
      }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
