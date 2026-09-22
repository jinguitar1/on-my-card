/**
 * Generated from the live `on-my-card` Supabase schema
 * (mcp__Supabase__generate_typescript_types). Do not hand-edit — regenerate instead
 * whenever a migration changes the schema.
 *
 * `boards` / `tiles` / `journal_entries` are unused leftovers from an earlier,
 * abandoned relational-tables design for this same project and are not read or
 * written by this app (see CLAUDE.md / DESIGN-FRAMEWORK.md — this app uses the single
 * `app_state` JSONB-per-user table instead).
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      app_state: {
        Row: {
          schema_version: number;
          state: Json;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          schema_version: number;
          state: Json;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          schema_version?: number;
          state?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      boards: {
        Row: {
          created_at: string;
          id: string;
          size: number;
          title: string;
          user_id: string;
          year: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          size?: number;
          title?: string;
          user_id: string;
          year: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          size?: number;
          title?: string;
          user_id?: string;
          year?: number;
        };
        Relationships: [];
      };
      journal_entries: {
        Row: {
          created_at: string;
          id: string;
          photo_url: string | null;
          reflection: string | null;
          tile_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          photo_url?: string | null;
          reflection?: string | null;
          tile_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          photo_url?: string | null;
          reflection?: string | null;
          tile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'journal_entries_tile_id_fkey';
            columns: ['tile_id'];
            isOneToOne: false;
            referencedRelation: 'tiles';
            referencedColumns: ['id'];
          },
        ];
      };
      tiles: {
        Row: {
          board_id: string;
          completed_at: string | null;
          domain: string;
          id: string;
          is_free_space: boolean;
          is_signature: boolean;
          label: string;
          position: number;
        };
        Insert: {
          board_id: string;
          completed_at?: string | null;
          domain?: string;
          id?: string;
          is_free_space?: boolean;
          is_signature?: boolean;
          label?: string;
          position: number;
        };
        Update: {
          board_id?: string;
          completed_at?: string | null;
          domain?: string;
          id?: string;
          is_free_space?: boolean;
          is_signature?: boolean;
          label?: string;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'tiles_board_id_fkey';
            columns: ['board_id'];
            isOneToOne: false;
            referencedRelation: 'boards';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
