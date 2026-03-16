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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      companies: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          bankgiro: string | null
          bic: string | null
          billing_email: string | null
          city: string | null
          country: string | null
          created_at: string
          iban: string | null
          id: string
          invoice_prefix: string | null
          name: string
          org_no: string | null
          phone: string | null
          plusgiro: string | null
          postal_code: string | null
          locked_until: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          bankgiro?: string | null
          bic?: string | null
          billing_email?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          iban?: string | null
          id?: string
          invoice_prefix?: string | null
          name: string
          org_no?: string | null
          phone?: string | null
          plusgiro?: string | null
          postal_code?: string | null
          locked_until?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          bankgiro?: string | null
          bic?: string | null
          billing_email?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          iban?: string | null
          id?: string
          invoice_prefix?: string | null
          name?: string
          org_no?: string | null
          phone?: string | null
          plusgiro?: string | null
          postal_code?: string | null
          locked_until?: string | null
        }
        Relationships: []
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          archived_at: string | null
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          archived_at?: string | null
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          archived_at?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      order_lines: {
        Row: {
          company_id: string
          created_at: string
          id: string
          order_id: string
          qty: number
          title: string
          total: number
          unit_price: number
          vat_rate: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          order_id: string
          qty?: number
          title: string
          total?: number
          unit_price?: number
          vat_rate?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          order_id?: string
          qty?: number
          title?: string
          total?: number
          unit_price?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          company_id: string
          created_at: string
          id: string
          project_id: string
          status: string
          total: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          project_id: string
          status?: string
          total?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          project_id?: string
          status?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_history: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          order_id: string
          project_id: string
          rpc_result: Json
          summary: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          order_id: string
          project_id: string
          rpc_result?: Json
          summary?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          order_id?: string
          project_id?: string
          rpc_result?: Json
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_counters: {
        Row: {
          company_id: string
          last_number: number
          updated_at: string
        }
        Insert: {
          company_id: string
          last_number?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          last_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_counters_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          company_id: string
          company_snapshot: Json
          created_at: string
          created_by: string | null
          credited_at: string | null
          credited_by: string | null
          credit_for_invoice_id: string | null
          attachment_path: string | null
          collection_note: string | null
          collection_stage: string
          reminder_1_sent_at: string | null
          reminder_2_sent_at: string | null
          inkasso_sent_at: string | null
          currency: string
          customer_snapshot: Json
          due_date: string
          id: string
          invoice_no: string
          issue_date: string
          kind: string
          lines_snapshot: Json
          order_id: string | null
          project_id: string
          rpc_result: Json
          status: string
          subtotal: number
          total: number
          vat_total: number
        }
        Insert: {
          company_id: string
          company_snapshot?: Json
          created_at?: string
          created_by?: string | null
          credited_at?: string | null
          credited_by?: string | null
          credit_for_invoice_id?: string | null
          attachment_path?: string | null
          collection_note?: string | null
          collection_stage?: string
          reminder_1_sent_at?: string | null
          reminder_2_sent_at?: string | null
          inkasso_sent_at?: string | null
          currency?: string
          customer_snapshot?: Json
          due_date: string
          id?: string
          invoice_no: string
          issue_date?: string
          kind?: string
          lines_snapshot?: Json
          order_id?: string | null
          project_id: string
          rpc_result?: Json
          status?: string
          subtotal?: number
          total?: number
          vat_total?: number
        }
        Update: {
          company_id?: string
          company_snapshot?: Json
          created_at?: string
          created_by?: string | null
          credited_at?: string | null
          credited_by?: string | null
          credit_for_invoice_id?: string | null
          attachment_path?: string | null
          collection_note?: string | null
          collection_stage?: string
          reminder_1_sent_at?: string | null
          reminder_2_sent_at?: string | null
          inkasso_sent_at?: string | null
          currency?: string
          customer_snapshot?: Json
          due_date?: string
          id?: string
          invoice_no?: string
          issue_date?: string
          kind?: string
          lines_snapshot?: Json
          order_id?: string | null
          project_id?: string
          rpc_result?: Json
          status?: string
          subtotal?: number
          total?: number
          vat_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_credit_for_invoice_id_fkey"
            columns: ["credit_for_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          amount: number
          attachment_path: string | null
          booking_verification_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          direction: string
          id: string
          invoice_id: string
          method: string
          note: string | null
          overpayment_amount: number
          payment_date: string
          reference: string | null
          reversed_from_payment_id: string | null
        }
        Insert: {
          amount: number
          attachment_path?: string | null
          booking_verification_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          direction?: string
          id?: string
          invoice_id: string
          method?: string
          note?: string | null
          overpayment_amount?: number
          payment_date: string
          reference?: string | null
          reversed_from_payment_id?: string | null
        }
        Update: {
          amount?: number
          attachment_path?: string | null
          booking_verification_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          direction?: string
          id?: string
          invoice_id?: string
          method?: string
          note?: string | null
          overpayment_amount?: number
          payment_date?: string
          reference?: string | null
          reversed_from_payment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_booking_verification_id_fkey"
            columns: ["booking_verification_id"]
            isOneToOne: false
            referencedRelation: "verifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_reversed_from_payment_id_fkey"
            columns: ["reversed_from_payment_id"]
            isOneToOne: false
            referencedRelation: "invoice_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_reminders: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          fee: number
          id: string
          invoice_id: string
          note: string | null
          sent_at: string
          stage: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          fee?: number
          id?: string
          invoice_id: string
          note?: string | null
          sent_at?: string
          stage: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          fee?: number
          id?: string
          invoice_id?: string
          note?: string | null
          sent_at?: string
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_reminders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      project_columns: {
        Row: {
          company_id: string
          created_at: string
          id: string
          key: string
          position: number
          title: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          key: string
          position?: number
          title: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          key?: string
          position?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_columns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          company_id: string
          created_at: string
          customer_id: string | null
          id: string
          position: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          customer_id?: string | null
          id?: string
          position?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          position?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_company_preferences: {
        Row: {
          company_id: string
          created_at: string
          id: string
          preference_key: string
          preference_value: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          preference_key: string
          preference_value?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          preference_key?: string
          preference_value?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_company_preferences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_lines: {
        Row: {
          account_no: string
          company_id: string
          created_at: string
          credit: number
          debit: number
          id: string
          vat_code: string | null
          verification_id: string
        }
        Insert: {
          account_no: string
          company_id: string
          created_at?: string
          credit?: number
          debit?: number
          id?: string
          vat_code?: string | null
          verification_id: string
        }
        Update: {
          account_no?: string
          company_id?: string
          created_at?: string
          credit?: number
          debit?: number
          id?: string
          vat_code?: string | null
          verification_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_lines_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "verifications"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_number_counters: {
        Row: {
          company_id: string
          fiscal_year: number
          next_no: number
        }
        Insert: {
          company_id: string
          fiscal_year: number
          next_no?: number
        }
        Update: {
          company_id?: string
          fiscal_year?: number
          next_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "verification_number_counters_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      verifications: {
        Row: {
          attachment_path: string | null
          company_id: string
          created_at: string
          created_by: string | null
          date: string
          description: string
          id: string
          source: string | null
          status: string
          total: number
          client_request_id: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          fiscal_year: number | null
          verification_no: number | null
          reversed_from_id: string | null
        }
        Insert: {
          attachment_path?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          date: string
          description: string
          id?: string
          source?: string | null
          status?: string
          total?: number
          client_request_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          fiscal_year?: number | null
          verification_no?: number | null
          reversed_from_id?: string | null
        }
        Update: {
          attachment_path?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string
          id?: string
          source?: string | null
          status?: string
          total?: number
          client_request_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          fiscal_year?: number | null
          verification_no?: number | null
          reversed_from_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      app_user_role: { Args: { p_company_id: string }; Returns: string }
      assert_finance_period_open: {
        Args: { p_company_id: string; p_date: string }
        Returns: undefined
      }
      book_invoice_issue: { Args: { p_invoice_id: string }; Returns: Json }
      create_credit_invoice: { Args: { p_original_invoice_id: string; p_reason?: string | null }; Returns: Json }
      create_invoice_from_order: { Args: { order_id: string }; Returns: Json }
      create_project_with_order: { Args: { payload: Json }; Returns: Json }
      create_verification_from_wizard: {
        Args: { payload: Json }
        Returns: Json
      }
      create_reversal_verification: {
        Args: { original_verification_id: string; reason?: string | null }
        Returns: Json
      }
      set_period_lock: {
        Args: { p_company_id: string; p_locked_until: string | null }
        Returns: Json
      }
      has_finance_access: { Args: { p_company_id: string }; Returns: boolean }
      has_finance_write_access: { Args: { p_company_id: string }; Returns: boolean }
      next_invoice_number: { Args: { p_company_id: string }; Returns: string }
      move_project: {
        Args: { project_id: string; to_position: number; to_status: string }
        Returns: {
          company_id: string
          created_at: string
          customer_id: string | null
          id: string
          position: number
          status: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      next_verification_number: {
        Args: { p_company_id: string; p_date: string }
        Returns: Json
      }
      normalize_project_positions: {
        Args: { p_company_id: string; p_status: string }
        Returns: undefined
      }
      receivables_open_report: {
        Args: { p_as_of?: string; p_company_id: string }
        Returns: Json
      }
      receivables_reconciliation_report: {
        Args: { p_as_of?: string; p_company_id: string }
        Returns: Json
      }
      register_invoice_payment: {
        Args: {
          p_allow_overpayment?: boolean
          p_amount: number
          p_attachment_path?: string | null
          p_invoice_id: string
          p_method?: string | null
          p_note?: string | null
          p_payment_date: string
          p_reference?: string | null
        }
        Returns: Json
      }
      refund_invoice_payment: {
        Args: {
          p_amount: number
          p_attachment_path?: string | null
          p_invoice_id: string
          p_method?: string | null
          p_note?: string | null
          p_payment_date: string
          p_reference?: string | null
        }
        Returns: Json
      }
      reverse_invoice_payment: {
        Args: { p_payment_id: string; p_reason?: string | null; p_reverse_date?: string }
        Returns: Json
      }
      mark_invoice_collection_stage: {
        Args: {
          p_fee?: number
          p_invoice_id: string
          p_note?: string | null
          p_sent_at?: string
          p_stage: string
        }
        Returns: Json
      }
      period_close_checklist: {
        Args: { p_company_id: string; p_period_end: string; p_period_start: string }
        Returns: Json
      }
      set_project_status: {
        Args: { project_id: string; to_status: string }
        Returns: {
          company_id: string
          created_at: string
          customer_id: string | null
          id: string
          position: number
          status: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      vat_report: {
        Args: { company_id: string; period_end: string; period_start: string }
        Returns: Json
      }
      general_ledger_report: {
        Args: { p_company_id: string; p_period_end: string; p_period_start: string }
        Returns: Json
      }
      trial_balance_report: {
        Args: { p_as_of: string; p_company_id: string }
        Returns: Json
      }
      income_statement_report: {
        Args: { p_company_id: string; p_period_end: string; p_period_start: string }
        Returns: Json
      }
      balance_sheet_report: {
        Args: { p_as_of: string; p_company_id: string }
        Returns: Json
      }
      finance_audit_log_report: {
        Args: { p_company_id: string; p_limit?: number }
        Returns: Json
      }
      tre60_auth_context: {
        Args: Record<PropertyKey, never>
        Returns: {
          user_id: string | null
          role: string | null
          status: string | null
          default_company_id: string | null
          customer_id: string | null
          redirect_url: string | null
        }
      }
      void_verification: {
        Args: { reason?: string | null; verification_id: string }
        Returns: Json
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


export type TableRow<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type TableInsertRow<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type TableUpdateRow<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];






















