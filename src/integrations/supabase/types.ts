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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      books: {
        Row: {
          author: string
          author_email: string | null
          created_at: string | null
          ean: string | null
          id: string
          isbn: string | null
          maidhisa_ref: string | null
          publication_date: string | null
          pvp: number
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          author: string
          author_email?: string | null
          created_at?: string | null
          ean?: string | null
          id?: string
          isbn?: string | null
          maidhisa_ref?: string | null
          publication_date?: string | null
          pvp: number
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          author?: string
          author_email?: string | null
          created_at?: string | null
          ean?: string | null
          id?: string
          isbn?: string | null
          maidhisa_ref?: string | null
          publication_date?: string | null
          pvp?: number
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      distributors: {
        Row: {
          code: string
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          code: string
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          code?: string
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          distributor_id: string
          error_log: Json | null
          file_name: string
          id: string
          imported_at: string | null
          imported_by: string | null
          month: number
          records_imported: number | null
          records_skipped: number | null
          status: string | null
          year: number
        }
        Insert: {
          distributor_id: string
          error_log?: Json | null
          file_name: string
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          month: number
          records_imported?: number | null
          records_skipped?: number | null
          status?: string | null
          year: number
        }
        Update: {
          distributor_id?: string
          error_log?: Json | null
          file_name?: string
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          month?: number
          records_imported?: number | null
          records_skipped?: number | null
          status?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
        ]
      }
      liquidation_items: {
        Row: {
          book_id: string
          distributor_amount: number | null
          distributor_units: number | null
          id: string
          liquidation_id: string
          online_amount: number | null
          online_units: number | null
          school_amount: number | null
          school_units: number | null
          total_amount: number | null
        }
        Insert: {
          book_id: string
          distributor_amount?: number | null
          distributor_units?: number | null
          id?: string
          liquidation_id: string
          online_amount?: number | null
          online_units?: number | null
          school_amount?: number | null
          school_units?: number | null
          total_amount?: number | null
        }
        Update: {
          book_id?: string
          distributor_amount?: number | null
          distributor_units?: number | null
          id?: string
          liquidation_id?: string
          online_amount?: number | null
          online_units?: number | null
          school_amount?: number | null
          school_units?: number | null
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "liquidation_items_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidation_items_liquidation_id_fkey"
            columns: ["liquidation_id"]
            isOneToOne: false
            referencedRelation: "liquidations"
            referencedColumns: ["id"]
          },
        ]
      }
      liquidations: {
        Row: {
          created_at: string | null
          distributor_royalty_pct: number | null
          finalized_at: string | null
          id: string
          online_royalty_pct: number | null
          school_royalty_pct: number | null
          status: string | null
          year: number
        }
        Insert: {
          created_at?: string | null
          distributor_royalty_pct?: number | null
          finalized_at?: string | null
          id?: string
          online_royalty_pct?: number | null
          school_royalty_pct?: number | null
          status?: string | null
          year: number
        }
        Update: {
          created_at?: string | null
          distributor_royalty_pct?: number | null
          finalized_at?: string | null
          id?: string
          online_royalty_pct?: number | null
          school_royalty_pct?: number | null
          status?: string | null
          year?: number
        }
        Relationships: []
      }
      sales_movements: {
        Row: {
          book_id: string
          created_at: string | null
          distributor_id: string
          id: string
          import_batch_id: string | null
          month: number
          notes: string | null
          quantity: number
          type: string
          year: number
        }
        Insert: {
          book_id: string
          created_at?: string | null
          distributor_id: string
          id?: string
          import_batch_id?: string | null
          month: number
          notes?: string | null
          quantity: number
          type: string
          year: number
        }
        Update: {
          book_id?: string
          created_at?: string | null
          distributor_id?: string
          id?: string
          import_batch_id?: string | null
          month?: number
          notes?: string | null
          quantity?: number
          type?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_movements_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_movements_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_movements_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      book_inventory_annual: {
        Row: {
          book_id: string | null
          devoluciones: number | null
          distributor_id: string | null
          envios: number | null
          inventario: number | null
          ventas: number | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_movements_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_movements_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
        ]
      }
      book_inventory_summary: {
        Row: {
          book_id: string | null
          devoluciones: number | null
          distributor_id: string | null
          envios: number | null
          inventario: number | null
          month: number | null
          ventas: number | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_movements_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_movements_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      get_dashboard_summary: {
        Args: { p_year: number }
        Returns: {
          active_books: number
          books_with_sales: number
          estimated_royalties: number
          total_units_sold: number
        }[]
      }
      get_liquidation_items_page: {
        Args: {
          p_author_filter?: string
          p_limit?: number
          p_liquidation_id: string
          p_offset?: number
          p_only_with_sales?: boolean
          p_search?: string
        }
        Returns: {
          author: string
          book_id: string
          book_title: string
          distributor_amount: number
          distributor_units: number
          item_id: string
          online_amount: number
          online_units: number
          publication_date: string
          pvp: number
          school_amount: number
          school_units: number
          total_amount: number
          total_authors: number
        }[]
      }
      get_liquidation_totals: {
        Args: { p_liquidation_id: string }
        Returns: {
          total_all_amount: number
          total_authors: number
          total_books: number
          total_positive_amount: number
          total_units: number
        }[]
      }
      get_monthly_sales_summary: {
        Args: { p_year: number }
        Returns: {
          distributor_returns: number
          distributor_sales: number
          month: number
          online_returns: number
          online_sales: number
          school_returns: number
          school_sales: number
        }[]
      }
      get_sales_page: {
        Args: {
          p_limit?: number
          p_month?: number
          p_offset?: number
          p_search?: string
          p_year: number
        }
        Returns: {
          book_id: string
          book_title: string
          devoluciones: number
          distributor_code: string
          distributor_id: string
          distributor_name: string
          envios: number
          inventario: number
          total_books: number
          ventas: number
        }[]
      }
      get_top_authors: {
        Args: { p_limit?: number; p_year: number }
        Returns: {
          author: string
          estimated_royalties: number
          num_books: number
          total_units: number
        }[]
      }
      get_top_books: {
        Args: { p_limit?: number; p_year: number }
        Returns: {
          author: string
          book_id: string
          main_channel: string
          net_sales: number
          title: string
          total_returns: number
          total_sales: number
        }[]
      }
      match_book_by_normalized_title: {
        Args: { p_title: string }
        Returns: {
          id: string
          maidhisa_ref: string
          title: string
        }[]
      }
      normalize_text: { Args: { input: string }; Returns: string }
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
