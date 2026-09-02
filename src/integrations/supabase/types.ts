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
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          status: string
          tagline: string | null
          theme: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          status?: string
          tagline?: string | null
          theme?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          status?: string
          tagline?: string | null
          theme?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      content_sections: {
        Row: {
          config: Json
          content: string | null
          created_at: string
          created_by: string | null
          id: string
          image_url: string | null
          link_url: string | null
          page: string
          section_type: string
          sort_order: number
          status: string
          subtitle: string | null
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          link_url?: string | null
          page: string
          section_type: string
          sort_order?: number
          status?: string
          subtitle?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          link_url?: string | null
          page?: string
          section_type?: string
          sort_order?: number
          status?: string
          subtitle?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      customer_addresses: {
        Row: {
          address_line_1: string
          address_line_2: string | null
          city: string
          country: string
          county: string | null
          created_at: string
          customer_id: string
          id: string
          is_default: boolean
          label: string | null
          phone: string
          postal_code: string | null
          recipient_name: string
          updated_at: string
        }
        Insert: {
          address_line_1: string
          address_line_2?: string | null
          city: string
          country?: string
          county?: string | null
          created_at?: string
          customer_id: string
          id?: string
          is_default?: boolean
          label?: string | null
          phone: string
          postal_code?: string | null
          recipient_name: string
          updated_at?: string
        }
        Update: {
          address_line_1?: string
          address_line_2?: string | null
          city?: string
          country?: string
          county?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          is_default?: boolean
          label?: string | null
          phone?: string
          postal_code?: string | null
          recipient_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_guest: boolean
          phone: string | null
          profile_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_guest?: boolean
          phone?: string | null
          profile_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_guest?: boolean
          phone?: string | null
          profile_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          created_at: string
          damaged: number
          id: string
          lost: number
          low_stock_threshold: number
          quantity: number
          reserved: number
          returned: number
          sold: number
          updated_at: string
          updated_by: string | null
          variant_id: string
        }
        Insert: {
          created_at?: string
          damaged?: number
          id?: string
          lost?: number
          low_stock_threshold?: number
          quantity?: number
          reserved?: number
          returned?: number
          sold?: number
          updated_at?: string
          updated_by?: string | null
          variant_id: string
        }
        Update: {
          created_at?: string
          damaged?: number
          id?: string
          lost?: number
          low_stock_threshold?: number
          quantity?: number
          reserved?: number
          returned?: number
          sold?: number
          updated_at?: string
          updated_by?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: true
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          idempotency_key: string | null
          inventory_id: string | null
          movement_type: string
          notes: string | null
          order_id: string | null
          product_id: string | null
          quantity_after: number
          quantity_before: number | null
          quantity_delta: number
          reason: string | null
          reference_id: string | null
          reference_type: string | null
          reservation_id: string | null
          reserved_after: number
          sold_after: number
          variant_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          inventory_id?: string | null
          movement_type: string
          notes?: string | null
          order_id?: string | null
          product_id?: string | null
          quantity_after: number
          quantity_before?: number | null
          quantity_delta: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          reservation_id?: string | null
          reserved_after: number
          sold_after: number
          variant_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          inventory_id?: string | null
          movement_type?: string
          notes?: string | null
          order_id?: string | null
          product_id?: string | null
          quantity_after?: number
          quantity_before?: number | null
          quantity_delta?: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          reservation_id?: string | null
          reserved_after?: number
          sold_after?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_reservations: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          idempotency_key: string | null
          inventory_id: string
          product_id: string | null
          quantity: number
          reference_id: string | null
          reference_type: string
          released_at: string | null
          status: string
          updated_at: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          idempotency_key?: string | null
          inventory_id: string
          product_id?: string | null
          quantity: number
          reference_id?: string | null
          reference_type?: string
          released_at?: string | null
          status?: string
          updated_at?: string
          variant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          idempotency_key?: string | null
          inventory_id?: string
          product_id?: string | null
          quantity?: number
          reference_id?: string | null
          reference_type?: string
          released_at?: string | null
          status?: string
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_reservations_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          activated_at: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          end_at: string | null
          id: string
          internal_notes: string | null
          name: string
          offer_type: string
          priority: number
          product_id: string | null
          promotional_label: string | null
          scope: string
          start_at: string
          status: string
          updated_at: string
          updated_by: string | null
          value: number
          version: number
        }
        Insert: {
          activated_at?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          end_at?: string | null
          id?: string
          internal_notes?: string | null
          name: string
          offer_type: string
          priority?: number
          product_id?: string | null
          promotional_label?: string | null
          scope: string
          start_at?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          value?: number
          version?: number
        }
        Update: {
          activated_at?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          end_at?: string | null
          id?: string
          internal_notes?: string | null
          name?: string
          offer_type?: string
          priority?: number
          product_id?: string | null
          promotional_label?: string | null
          scope?: string
          start_at?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          value?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "offers_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          discount_snapshot: number
          id: string
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          sku: string | null
          total_price: number
          unit_price: number
          variant_id: string | null
          variant_label: string | null
        }
        Insert: {
          created_at?: string
          discount_snapshot?: number
          id?: string
          order_id: string
          product_id?: string | null
          product_name: string
          quantity: number
          sku?: string | null
          total_price: number
          unit_price: number
          variant_id?: string | null
          variant_label?: string | null
        }
        Update: {
          created_at?: string
          discount_snapshot?: number
          id?: string
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          sku?: string | null
          total_price?: number
          unit_price?: number
          variant_id?: string | null
          variant_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          notes: string | null
          order_id: string
          status: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          status: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          currency: string
          customer_id: string | null
          customer_ref: string | null
          delivery_address_id: string | null
          discount_amount: number
          guest_email: string | null
          guest_phone: string | null
          id: string
          notes: string | null
          order_number: string
          payment_status: string
          placed_at: string
          shipping_address_id: string | null
          shipping_cost: number
          status: string
          subtotal: number
          tax_amount: number
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          customer_id?: string | null
          customer_ref?: string | null
          delivery_address_id?: string | null
          discount_amount?: number
          guest_email?: string | null
          guest_phone?: string | null
          id?: string
          notes?: string | null
          order_number: string
          payment_status?: string
          placed_at?: string
          shipping_address_id?: string | null
          shipping_cost?: number
          status?: string
          subtotal: number
          tax_amount?: number
          total: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          customer_id?: string | null
          customer_ref?: string | null
          delivery_address_id?: string | null
          discount_amount?: number
          guest_email?: string | null
          guest_phone?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          payment_status?: string
          placed_at?: string
          shipping_address_id?: string | null
          shipping_cost?: number
          status?: string
          subtotal?: number
          tax_amount?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_ref_fkey"
            columns: ["customer_ref"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivery_address_id_fkey"
            columns: ["delivery_address_id"]
            isOneToOne: false
            referencedRelation: "customer_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_shipping_address_id_fkey"
            columns: ["shipping_address_id"]
            isOneToOne: false
            referencedRelation: "shipping_addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_attempts: {
        Row: {
          created_at: string
          direction: string
          error_message: string | null
          id: string
          order_id: string | null
          payload: Json | null
          payment_id: string | null
          response: Json | null
          status: string | null
        }
        Insert: {
          created_at?: string
          direction: string
          error_message?: string | null
          id?: string
          order_id?: string | null
          payload?: Json | null
          payment_id?: string | null
          response?: Json | null
          status?: string | null
        }
        Update: {
          created_at?: string
          direction?: string
          error_message?: string | null
          id?: string
          order_id?: string | null
          payload?: Json | null
          payment_id?: string | null
          response?: Json | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_attempts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          order_id: string | null
          payment_id: string | null
          processed: boolean
          processed_at: string | null
          provider: string
          provider_event_id: string
          raw_payload: Json
          result_code: string | null
          result_desc: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          order_id?: string | null
          payment_id?: string | null
          processed?: boolean
          processed_at?: string | null
          provider?: string
          provider_event_id: string
          raw_payload: Json
          result_code?: string | null
          result_desc?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          order_id?: string | null
          payment_id?: string | null
          processed?: boolean
          processed_at?: string | null
          provider?: string
          provider_event_id?: string
          raw_payload?: Json
          result_code?: string | null
          result_desc?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          checkout_request_id: string | null
          created_at: string
          currency: string
          external_transaction_id: string | null
          failure_reason: string | null
          id: string
          merchant_request_id: string | null
          metadata: Json | null
          method: string
          order_id: string
          paid_at: string | null
          provider: string
          provider_reference: string | null
          result_code: string | null
          result_desc: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          checkout_request_id?: string | null
          created_at?: string
          currency?: string
          external_transaction_id?: string | null
          failure_reason?: string | null
          id?: string
          merchant_request_id?: string | null
          metadata?: Json | null
          method?: string
          order_id: string
          paid_at?: string | null
          provider?: string
          provider_reference?: string | null
          result_code?: string | null
          result_desc?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          checkout_request_id?: string | null
          created_at?: string
          currency?: string
          external_transaction_id?: string | null
          failure_reason?: string | null
          id?: string
          merchant_request_id?: string | null
          metadata?: Json | null
          method?: string
          order_id?: string
          paid_at?: string | null
          provider?: string
          provider_reference?: string | null
          result_code?: string | null
          result_desc?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          created_at: string
          description: string
          domain: string
          id: string
          key: string
        }
        Insert: {
          created_at?: string
          description: string
          domain: string
          id?: string
          key: string
        }
        Update: {
          created_at?: string
          description?: string
          domain?: string
          id?: string
          key?: string
        }
        Relationships: []
      }
      product_images: {
        Row: {
          alt_text: string | null
          created_at: string
          created_by: string | null
          id: string
          is_primary: boolean
          product_id: string
          sort_order: number
          url: string
          variant_id: string | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean
          product_id: string
          sort_order?: number
          url: string
          variant_id?: string | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean
          product_id?: string
          sort_order?: number
          url?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          barcode: string | null
          created_at: string
          id: string
          is_active: boolean
          option_1: string | null
          option_2: string | null
          option_3: string | null
          price_adjustment: number
          product_id: string
          sku: string
          updated_at: string
          weight_g: number | null
        }
        Insert: {
          barcode?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          option_1?: string | null
          option_2?: string | null
          option_3?: string | null
          price_adjustment?: number
          product_id: string
          sku: string
          updated_at?: string
          weight_g?: number | null
        }
        Update: {
          barcode?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          option_1?: string | null
          option_2?: string | null
          option_3?: string | null
          price_adjustment?: number
          product_id?: string
          sku?: string
          updated_at?: string
          weight_g?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          base_price: number
          brand: string | null
          category_id: string | null
          compare_at_price: number | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          id: string
          is_featured: boolean
          meta_description: string | null
          meta_title: string | null
          name: string
          sku: string | null
          slug: string
          status: string
          updated_at: string
          updated_by: string | null
          version: number
          weight_g: number | null
        }
        Insert: {
          base_price: number
          brand?: string | null
          category_id?: string | null
          compare_at_price?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          is_featured?: boolean
          meta_description?: string | null
          meta_title?: string | null
          name: string
          sku?: string | null
          slug: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          weight_g?: number | null
        }
        Update: {
          base_price?: number
          brand?: string | null
          category_id?: string | null
          compare_at_price?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          is_featured?: boolean
          meta_description?: string | null
          meta_title?: string | null
          name?: string
          sku?: string | null
          slug?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          weight_g?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_staff: boolean
          last_login_at: string | null
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_staff?: boolean
          last_login_at?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_staff?: boolean
          last_login_at?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          id?: string
          permission_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          id?: string
          permission_id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_addresses: {
        Row: {
          address_line_1: string
          address_line_2: string | null
          city: string
          country: string
          created_at: string
          full_name: string
          id: string
          is_default: boolean
          phone: string
          postal_code: string | null
          profile_id: string | null
          state_province: string | null
          updated_at: string
        }
        Insert: {
          address_line_1: string
          address_line_2?: string | null
          city: string
          country?: string
          created_at?: string
          full_name: string
          id?: string
          is_default?: boolean
          phone: string
          postal_code?: string | null
          profile_id?: string | null
          state_province?: string | null
          updated_at?: string
        }
        Update: {
          address_line_1?: string
          address_line_2?: string | null
          city?: string
          country?: string
          created_at?: string
          full_name?: string
          id?: string
          is_default?: boolean
          phone?: string
          postal_code?: string | null
          profile_id?: string | null
          state_province?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_addresses_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          actor_id: string | null
          amount: number
          created_at: string
          currency: string
          id: string
          notes: string | null
          order_id: string | null
          payment_id: string | null
          reference: string | null
          status: string
          transaction_date: string
          transaction_type: string
        }
        Insert: {
          actor_id?: string | null
          amount: number
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          order_id?: string | null
          payment_id?: string | null
          reference?: string | null
          status?: string
          transaction_date?: string
          transaction_type: string
        }
        Update: {
          actor_id?: string | null
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          order_id?: string | null
          payment_id?: string | null
          reference?: string | null
          status?: string
          transaction_date?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_daily_sales: {
        Row: {
          average_order_value: number | null
          currency: string | null
          discount_amount: number | null
          gross_amount: number | null
          net_amount: number | null
          order_count: number | null
          sales_date: string | null
          units_sold: number | null
        }
        Relationships: []
      }
      v_payment_summary: {
        Row: {
          currency: string | null
          failed_count: number | null
          paid_amount: number | null
          paid_count: number | null
          payment_date: string | null
          provider: string | null
          refunded_amount: number | null
          refunded_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      adjust_inventory: {
        Args: {
          _actor_id?: string
          _delta: number
          _movement_type: string
          _reason: string
          _variant_id: string
        }
        Returns: boolean
      }
      apply_inventory_movement: {
        Args: {
          _actor_id?: string
          _idempotency_key?: string
          _movement_type: string
          _notes?: string
          _quantity: number
          _reason?: string
          _reference_id?: string
          _reference_type?: string
          _reservation_id?: string
          _variant_id: string
        }
        Returns: Json
      }
      calculate_discount: {
        Args: { _base_price: number; _offer_type: string; _value: number }
        Returns: {
          discount_amount: number
          final_price: number
        }[]
      }
      commit_inventory: {
        Args: {
          _actor_id?: string
          _order_id?: string
          _qty: number
          _variant_id: string
        }
        Returns: boolean
      }
      commit_reservation: {
        Args: {
          _actor_id?: string
          _idempotency_key?: string
          _reservation_id: string
        }
        Returns: Json
      }
      expire_stale_reservations: { Args: { _limit?: number }; Returns: number }
      get_available_inventory: {
        Args: { _variant_id: string }
        Returns: number
      }
      get_product_pricing: {
        Args: { _product_id: string }
        Returns: {
          base_price: number
          discount_amount: number
          end_at: string
          final_price: number
          labels: string[]
          offer_id: string
          offer_type: string
          offer_value: number
          product_id: string
          promotional_label: string
          start_at: string
        }[]
      }
      has_permission: {
        Args: { _permission_key: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      inventory_status: {
        Args: { _available: number; _threshold: number }
        Returns: string
      }
      is_active_account: { Args: { _user_id: string }; Returns: boolean }
      money_round: { Args: { _amount: number }; Returns: number }
      my_access: {
        Args: never
        Returns: {
          account_status: string
          permission_key: string
          role: string
        }[]
      }
      offer_is_live: {
        Args: { _end_at: string; _start_at: string; _status: string }
        Returns: boolean
      }
      release_inventory: {
        Args: {
          _actor_id?: string
          _order_id?: string
          _qty: number
          _variant_id: string
        }
        Returns: boolean
      }
      release_reservation: {
        Args: {
          _actor_id?: string
          _final_status?: string
          _reason?: string
          _reservation_id: string
        }
        Returns: Json
      }
      reserve_inventory: {
        Args: {
          _actor_id?: string
          _order_id?: string
          _qty: number
          _variant_id: string
        }
        Returns: boolean
      }
      reserve_stock: {
        Args: {
          _actor_id?: string
          _idempotency_key?: string
          _quantity: number
          _reference_id?: string
          _reference_type?: string
          _ttl_minutes?: number
          _variant_id: string
        }
        Returns: Json
      }
      sync_offer_statuses: {
        Args: never
        Returns: {
          activated: number
          expired: number
        }[]
      }
    }
    Enums: {
      app_role: "CEO" | "HR" | "SALES PEOPLE" | "SALES"
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
    Enums: {
      app_role: ["CEO", "HR", "SALES PEOPLE", "SALES"],
    },
  },
} as const
