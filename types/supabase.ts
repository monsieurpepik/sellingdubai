// AUTO-GENERATED — do not edit manually.
// Regenerate with: supabase gen types typescript --project-id pjyorgedaxevxophpfib > types/supabase.ts

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
      agencies: {
        Row: {
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          owner_agent_id: string
          slug: string
          updated_at: string
          website: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          owner_agent_id: string
          slug: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          owner_agent_id?: string
          slug?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agencies_owner_agent_id_fkey"
            columns: ["owner_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agencies_owner_agent_id_fkey"
            columns: ["owner_agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_projects: {
        Row: {
          agent_id: string
          approved_at: string | null
          created_at: string
          id: string
          project_id: string
          status: string
        }
        Insert: {
          agent_id: string
          approved_at?: string | null
          created_at?: string
          id?: string
          project_id: string
          status?: string
        }
        Update: {
          agent_id?: string
          approved_at?: string | null
          created_at?: string
          id?: string
          project_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_projects_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_projects_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          agency_id: string | null
          agency_logo_url: string | null
          agency_name: string | null
          agency_website: string | null
          areas_covered: string | null
          auth_user_id: string | null
          background_image_url: string | null
          bayut_profile: string | null
          bio: string | null
          bonus_listing_slots: number | null
          broker_number: number | null
          calendly_url: string | null
          created_at: string | null
          custom_link_1_label: string | null
          custom_link_1_url: string | null
          custom_link_2_label: string | null
          custom_link_2_url: string | null
          dld_avg_deal_aed: number | null
          dld_broker_id: string | null
          dld_broker_number: string | null
          dld_last_synced_at: string | null
          dld_total_deals: number | null
          dld_total_volume_aed: number | null
          dld_verified: boolean | null
          email: string | null
          email_verified: boolean | null
          facebook_capi_token: string | null
          facebook_pixel_id: string | null
          ga4_measurement_id: string | null
          id: string
          instagram_access_token: string | null
          instagram_connected_at: string | null
          instagram_handle: string | null
          instagram_url: string | null
          instagram_user_id: string | null
          is_active: boolean | null
          is_featured: boolean | null
          license_expiry: string | null
          license_image_url: string | null
          license_verified: boolean | null
          linkedin_url: string | null
          name: string
          notify_email: boolean | null
          notify_whatsapp: boolean | null
          phone: string | null
          photo_url: string | null
          property_finder_profile: string | null
          referral_code: string | null
          rera_brn: string | null
          show_golden_visa: boolean | null
          show_preapproval: boolean | null
          slug: string
          specialization: string | null
          stripe_current_period_end: string | null
          stripe_customer_id: string | null
          stripe_plan: string | null
          stripe_subscription_id: string | null
          stripe_subscription_status: string | null
          subscription_ends_at: string | null
          subscription_status: string | null
          tagline: string | null
          telegram_chat_id: string | null
          tier: string | null
          tiktok_access_token: string | null
          tiktok_connected_at: string | null
          tiktok_url: string | null
          tiktok_user_id: string | null
          updated_at: string | null
          verification_date: string | null
          verification_notes: string | null
          verification_status: string | null
          verified_at: string | null
          webhook_url: string | null
          whatsapp: string | null
          whatsapp_business_number: string | null
          youtube_url: string | null
        }
        Insert: {
          agency_id?: string | null
          agency_logo_url?: string | null
          agency_name?: string | null
          agency_website?: string | null
          areas_covered?: string | null
          auth_user_id?: string | null
          background_image_url?: string | null
          bayut_profile?: string | null
          bio?: string | null
          bonus_listing_slots?: number | null
          broker_number?: number | null
          calendly_url?: string | null
          created_at?: string | null
          custom_link_1_label?: string | null
          custom_link_1_url?: string | null
          custom_link_2_label?: string | null
          custom_link_2_url?: string | null
          dld_avg_deal_aed?: number | null
          dld_broker_id?: string | null
          dld_broker_number?: string | null
          dld_last_synced_at?: string | null
          dld_total_deals?: number | null
          dld_total_volume_aed?: number | null
          dld_verified?: boolean | null
          email?: string | null
          email_verified?: boolean | null
          facebook_capi_token?: string | null
          facebook_pixel_id?: string | null
          ga4_measurement_id?: string | null
          id?: string
          instagram_access_token?: string | null
          instagram_connected_at?: string | null
          instagram_handle?: string | null
          instagram_url?: string | null
          instagram_user_id?: string | null
          is_active?: boolean | null
          is_featured?: boolean | null
          license_expiry?: string | null
          license_image_url?: string | null
          license_verified?: boolean | null
          linkedin_url?: string | null
          name: string
          notify_email?: boolean | null
          notify_whatsapp?: boolean | null
          phone?: string | null
          photo_url?: string | null
          property_finder_profile?: string | null
          referral_code?: string | null
          rera_brn?: string | null
          show_golden_visa?: boolean | null
          show_preapproval?: boolean | null
          slug: string
          specialization?: string | null
          stripe_current_period_end?: string | null
          stripe_customer_id?: string | null
          stripe_plan?: string | null
          stripe_subscription_id?: string | null
          stripe_subscription_status?: string | null
          subscription_ends_at?: string | null
          subscription_status?: string | null
          tagline?: string | null
          telegram_chat_id?: string | null
          tier?: string | null
          tiktok_access_token?: string | null
          tiktok_connected_at?: string | null
          tiktok_url?: string | null
          tiktok_user_id?: string | null
          updated_at?: string | null
          verification_date?: string | null
          verification_notes?: string | null
          verification_status?: string | null
          verified_at?: string | null
          webhook_url?: string | null
          whatsapp?: string | null
          whatsapp_business_number?: string | null
          youtube_url?: string | null
        }
        Update: {
          agency_id?: string | null
          agency_logo_url?: string | null
          agency_name?: string | null
          agency_website?: string | null
          areas_covered?: string | null
          auth_user_id?: string | null
          background_image_url?: string | null
          bayut_profile?: string | null
          bio?: string | null
          bonus_listing_slots?: number | null
          broker_number?: number | null
          calendly_url?: string | null
          created_at?: string | null
          custom_link_1_label?: string | null
          custom_link_1_url?: string | null
          custom_link_2_label?: string | null
          custom_link_2_url?: string | null
          dld_avg_deal_aed?: number | null
          dld_broker_id?: string | null
          dld_broker_number?: string | null
          dld_last_synced_at?: string | null
          dld_total_deals?: number | null
          dld_total_volume_aed?: number | null
          dld_verified?: boolean | null
          email?: string | null
          email_verified?: boolean | null
          facebook_capi_token?: string | null
          facebook_pixel_id?: string | null
          ga4_measurement_id?: string | null
          id?: string
          instagram_access_token?: string | null
          instagram_connected_at?: string | null
          instagram_handle?: string | null
          instagram_url?: string | null
          instagram_user_id?: string | null
          is_active?: boolean | null
          is_featured?: boolean | null
          license_expiry?: string | null
          license_image_url?: string | null
          license_verified?: boolean | null
          linkedin_url?: string | null
          name?: string
          notify_email?: boolean | null
          notify_whatsapp?: boolean | null
          phone?: string | null
          photo_url?: string | null
          property_finder_profile?: string | null
          referral_code?: string | null
          rera_brn?: string | null
          show_golden_visa?: boolean | null
          show_preapproval?: boolean | null
          slug?: string
          specialization?: string | null
          stripe_current_period_end?: string | null
          stripe_customer_id?: string | null
          stripe_plan?: string | null
          stripe_subscription_id?: string | null
          stripe_subscription_status?: string | null
          subscription_ends_at?: string | null
          subscription_status?: string | null
          tagline?: string | null
          telegram_chat_id?: string | null
          tier?: string | null
          tiktok_access_token?: string | null
          tiktok_connected_at?: string | null
          tiktok_url?: string | null
          tiktok_user_id?: string | null
          updated_at?: string | null
          verification_date?: string | null
          verification_notes?: string | null
          verification_status?: string | null
          verified_at?: string | null
          webhook_url?: string | null
          whatsapp?: string | null
          whatsapp_business_number?: string | null
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_dld_broker_id_fkey"
            columns: ["dld_broker_id"]
            isOneToOne: false
            referencedRelation: "dld_brokers"
            referencedColumns: ["id"]
          },
        ]
      }
      buyer_requests: {
        Row: {
          additional_notes: string | null
          agent_id: string
          bedrooms_max: number | null
          bedrooms_min: number | null
          budget_max: number | null
          budget_min: number | null
          buyer_name: string | null
          buyer_nationality: string | null
          buyer_phone: string | null
          buyer_timeline: string | null
          created_at: string | null
          expires_at: string | null
          features_wanted: string[] | null
          id: string
          last_matched_at: string | null
          matches_found: number | null
          preferred_areas: string[] | null
          property_type: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          additional_notes?: string | null
          agent_id: string
          bedrooms_max?: number | null
          bedrooms_min?: number | null
          budget_max?: number | null
          budget_min?: number | null
          buyer_name?: string | null
          buyer_nationality?: string | null
          buyer_phone?: string | null
          buyer_timeline?: string | null
          created_at?: string | null
          expires_at?: string | null
          features_wanted?: string[] | null
          id?: string
          last_matched_at?: string | null
          matches_found?: number | null
          preferred_areas?: string[] | null
          property_type?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          additional_notes?: string | null
          agent_id?: string
          bedrooms_max?: number | null
          bedrooms_min?: number | null
          budget_max?: number | null
          budget_min?: number | null
          buyer_name?: string | null
          buyer_nationality?: string | null
          buyer_phone?: string | null
          buyer_timeline?: string | null
          created_at?: string | null
          expires_at?: string | null
          features_wanted?: string[] | null
          id?: string
          last_matched_at?: string | null
          matches_found?: number | null
          preferred_areas?: string[] | null
          property_type?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "buyer_requests_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_requests_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
        ]
      }
      co_broke_deals: {
        Row: {
          accepted_at: string | null
          buying_agent_commission_aed: number | null
          buying_agent_id: string
          buying_agent_split: number
          closed_at: string | null
          created_at: string | null
          deal_value_aed: number | null
          declined_at: string | null
          id: string
          listing_agent_commission_aed: number | null
          listing_agent_id: string
          listing_agent_split: number
          property_id: string
          status: string
          total_commission_aed: number | null
          updated_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          buying_agent_commission_aed?: number | null
          buying_agent_id: string
          buying_agent_split?: number
          closed_at?: string | null
          created_at?: string | null
          deal_value_aed?: number | null
          declined_at?: string | null
          id?: string
          listing_agent_commission_aed?: number | null
          listing_agent_id: string
          listing_agent_split?: number
          property_id: string
          status?: string
          total_commission_aed?: number | null
          updated_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          buying_agent_commission_aed?: number | null
          buying_agent_id?: string
          buying_agent_split?: number
          closed_at?: string | null
          created_at?: string | null
          deal_value_aed?: number | null
          declined_at?: string | null
          id?: string
          listing_agent_commission_aed?: number | null
          listing_agent_id?: string
          listing_agent_split?: number
          property_id?: string
          status?: string
          total_commission_aed?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "co_broke_deals_buying_agent_id_fkey"
            columns: ["buying_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "co_broke_deals_buying_agent_id_fkey"
            columns: ["buying_agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "co_broke_deals_listing_agent_id_fkey"
            columns: ["listing_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "co_broke_deals_listing_agent_id_fkey"
            columns: ["listing_agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "co_broke_deals_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      developers: {
        Row: {
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
          website: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      dld_brokers: {
        Row: {
          broker_name_ar: string | null
          broker_name_en: string
          broker_number: number
          created_at: string | null
          fax: string | null
          gender: number | null
          id: string
          license_end_date: string | null
          license_start_date: string | null
          participant_id: number | null
          phone: string | null
          real_estate_broker_id: number | null
          real_estate_id: number | null
          real_estate_number: number | null
          updated_at: string | null
          webpage: string | null
        }
        Insert: {
          broker_name_ar?: string | null
          broker_name_en: string
          broker_number: number
          created_at?: string | null
          fax?: string | null
          gender?: number | null
          id?: string
          license_end_date?: string | null
          license_start_date?: string | null
          participant_id?: number | null
          phone?: string | null
          real_estate_broker_id?: number | null
          real_estate_id?: number | null
          real_estate_number?: number | null
          updated_at?: string | null
          webpage?: string | null
        }
        Update: {
          broker_name_ar?: string | null
          broker_name_en?: string
          broker_number?: number
          created_at?: string | null
          fax?: string | null
          gender?: number | null
          id?: string
          license_end_date?: string | null
          license_start_date?: string | null
          participant_id?: number | null
          phone?: string | null
          real_estate_broker_id?: number | null
          real_estate_id?: number | null
          real_estate_number?: number | null
          updated_at?: string | null
          webpage?: string | null
        }
        Relationships: []
      }
      dld_projects: {
        Row: {
          area_name_en: string | null
          completion_date: string | null
          developer_name: string | null
          master_project_en: string | null
          no_of_buildings: number | null
          no_of_units: number | null
          percent_completed: number | null
          project_end_date: string | null
          project_id: number
          project_name: string | null
          project_start_date: string | null
          project_status: string | null
        }
        Insert: {
          area_name_en?: string | null
          completion_date?: string | null
          developer_name?: string | null
          master_project_en?: string | null
          no_of_buildings?: number | null
          no_of_units?: number | null
          percent_completed?: number | null
          project_end_date?: string | null
          project_id: number
          project_name?: string | null
          project_start_date?: string | null
          project_status?: string | null
        }
        Update: {
          area_name_en?: string | null
          completion_date?: string | null
          developer_name?: string | null
          master_project_en?: string | null
          no_of_buildings?: number | null
          no_of_units?: number | null
          percent_completed?: number | null
          project_end_date?: string | null
          project_id?: number
          project_name?: string | null
          project_start_date?: string | null
          project_status?: string | null
        }
        Relationships: []
      }
      dld_transactions: {
        Row: {
          agent_id: string
          amount_aed: number | null
          area: string | null
          created_at: string | null
          dld_reference: string | null
          id: string
          property_type: string | null
          transaction_date: string | null
          transaction_type: string | null
        }
        Insert: {
          agent_id: string
          amount_aed?: number | null
          area?: string | null
          created_at?: string | null
          dld_reference?: string | null
          id?: string
          property_type?: string | null
          transaction_date?: string | null
          transaction_type?: string | null
        }
        Update: {
          agent_id?: string
          amount_aed?: number | null
          area?: string | null
          created_at?: string | null
          dld_reference?: string | null
          id?: string
          property_type?: string | null
          transaction_date?: string | null
          transaction_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dld_transactions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dld_transactions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
        ]
      }
      email_signups: {
        Row: {
          agent_id: string
          created_at: string | null
          email: string
          id: string
          source: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string | null
          email: string
          id?: string
          source?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string | null
          email?: string
          id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_signups_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_signups_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
        ]
      }
      email_verification_codes: {
        Row: {
          broker_number: number | null
          code: string
          created_at: string | null
          email: string
          expires_at: string
          id: string
          ip_address: string | null
          verified: boolean | null
        }
        Insert: {
          broker_number?: number | null
          code: string
          created_at?: string | null
          email: string
          expires_at: string
          id?: string
          ip_address?: string | null
          verified?: boolean | null
        }
        Update: {
          broker_number?: number | null
          code?: string
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          verified?: boolean | null
        }
        Relationships: []
      }
      featured_projects: {
        Row: {
          area_location: string
          bedrooms: string | null
          brochure_url: string | null
          commission_percent: number | null
          completion_date: string | null
          created_at: string | null
          description: string | null
          developer_logo_url: string | null
          developer_name: string
          expires_at: string | null
          gallery_urls: string[] | null
          hero_image_url: string
          id: string
          payment_plan: string | null
          platform_fee_per_lead: number | null
          price_label: string | null
          priority: number | null
          project_name: string
          project_slug: string
          project_url: string | null
          property_types: string[] | null
          show_to_all: boolean | null
          starting_price_aed: number | null
          starts_at: string | null
          status: string
          tagline: string | null
          target_agent_ids: string[] | null
          target_areas: string[] | null
          updated_at: string | null
        }
        Insert: {
          area_location: string
          bedrooms?: string | null
          brochure_url?: string | null
          commission_percent?: number | null
          completion_date?: string | null
          created_at?: string | null
          description?: string | null
          developer_logo_url?: string | null
          developer_name: string
          expires_at?: string | null
          gallery_urls?: string[] | null
          hero_image_url: string
          id?: string
          payment_plan?: string | null
          platform_fee_per_lead?: number | null
          price_label?: string | null
          priority?: number | null
          project_name: string
          project_slug: string
          project_url?: string | null
          property_types?: string[] | null
          show_to_all?: boolean | null
          starting_price_aed?: number | null
          starts_at?: string | null
          status?: string
          tagline?: string | null
          target_agent_ids?: string[] | null
          target_areas?: string[] | null
          updated_at?: string | null
        }
        Update: {
          area_location?: string
          bedrooms?: string | null
          brochure_url?: string | null
          commission_percent?: number | null
          completion_date?: string | null
          created_at?: string | null
          description?: string | null
          developer_logo_url?: string | null
          developer_name?: string
          expires_at?: string | null
          gallery_urls?: string[] | null
          hero_image_url?: string
          id?: string
          payment_plan?: string | null
          platform_fee_per_lead?: number | null
          price_label?: string | null
          priority?: number | null
          project_name?: string
          project_slug?: string
          project_url?: string | null
          property_types?: string[] | null
          show_to_all?: boolean | null
          starting_price_aed?: number | null
          starts_at?: string | null
          status?: string
          tagline?: string | null
          target_agent_ids?: string[] | null
          target_areas?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      lead_referrals: {
        Row: {
          accepted_at: string | null
          closed_at: string | null
          commission_aed: number | null
          created_at: string | null
          deal_value_aed: number | null
          declined_at: string | null
          id: string
          lead_budget_range: string | null
          lead_email: string | null
          lead_name: string
          lead_notes: string | null
          lead_phone: string | null
          lead_preferred_area: string | null
          lead_property_type: string | null
          receiver_id: string
          referral_fee_aed: number | null
          referral_fee_percent: number | null
          referrer_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          closed_at?: string | null
          commission_aed?: number | null
          created_at?: string | null
          deal_value_aed?: number | null
          declined_at?: string | null
          id?: string
          lead_budget_range?: string | null
          lead_email?: string | null
          lead_name: string
          lead_notes?: string | null
          lead_phone?: string | null
          lead_preferred_area?: string | null
          lead_property_type?: string | null
          receiver_id: string
          referral_fee_aed?: number | null
          referral_fee_percent?: number | null
          referrer_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          closed_at?: string | null
          commission_aed?: number | null
          created_at?: string | null
          deal_value_aed?: number | null
          declined_at?: string | null
          id?: string
          lead_budget_range?: string | null
          lead_email?: string | null
          lead_name?: string
          lead_notes?: string | null
          lead_phone?: string | null
          lead_preferred_area?: string | null
          lead_property_type?: string | null
          receiver_id?: string
          referral_fee_aed?: number | null
          referral_fee_percent?: number | null
          referrer_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_referrals_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_referrals_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          agent_id: string
          agent_notified_at: string | null
          agent_responded_at: string | null
          budget_range: string | null
          created_at: string | null
          device_type: string | null
          email: string | null
          followup_nagged_at: string | null
          id: string
          ip_hash: string | null
          message: string | null
          name: string
          phone: string | null
          preferred_area: string | null
          property_type: string | null
          response_time_seconds: number | null
          source: string | null
          status: string | null
          updated_at: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          agent_id: string
          agent_notified_at?: string | null
          agent_responded_at?: string | null
          budget_range?: string | null
          created_at?: string | null
          device_type?: string | null
          email?: string | null
          followup_nagged_at?: string | null
          id?: string
          ip_hash?: string | null
          message?: string | null
          name: string
          phone?: string | null
          preferred_area?: string | null
          property_type?: string | null
          response_time_seconds?: number | null
          source?: string | null
          status?: string | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          agent_id?: string
          agent_notified_at?: string | null
          agent_responded_at?: string | null
          budget_range?: string | null
          created_at?: string | null
          device_type?: string | null
          email?: string | null
          followup_nagged_at?: string | null
          id?: string
          ip_hash?: string | null
          message?: string | null
          name?: string
          phone?: string | null
          preferred_area?: string | null
          property_type?: string | null
          response_time_seconds?: number | null
          source?: string | null
          status?: string | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
        ]
      }
      link_clicks: {
        Row: {
          agent_id: string
          clicked_at: string | null
          device_type: string | null
          id: string
          link_type: string
          link_url: string | null
          referrer: string | null
        }
        Insert: {
          agent_id: string
          clicked_at?: string | null
          device_type?: string | null
          id?: string
          link_type: string
          link_url?: string | null
          referrer?: string | null
        }
        Update: {
          agent_id?: string
          clicked_at?: string | null
          device_type?: string | null
          id?: string
          link_type?: string
          link_url?: string | null
          referrer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "link_clicks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_clicks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
        ]
      }
      magic_links: {
        Row: {
          agent_id: string
          created_at: string | null
          expires_at: string
          id: string
          revoked_at: string | null
          token: string
          used_at: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string | null
          expires_at: string
          id?: string
          revoked_at?: string | null
          token: string
          used_at?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          revoked_at?: string | null
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "magic_links_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "magic_links_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
        ]
      }
      market_rates: {
        Row: {
          fetched_at: string
          id: string
          rate_type: string
          rate_value: number
          source: string | null
        }
        Insert: {
          fetched_at?: string
          id?: string
          rate_type: string
          rate_value: number
          source?: string | null
        }
        Update: {
          fetched_at?: string
          id?: string
          rate_type?: string
          rate_value?: number
          source?: string | null
        }
        Relationships: []
      }
      mortgage_applications: {
        Row: {
          agent_id: string | null
          agent_slug: string | null
          assigned_bank: string | null
          assigned_broker: string | null
          broker_notes: string | null
          buyer_email: string | null
          buyer_name: string
          buyer_phone: string | null
          commission_agent_pct: number | null
          commission_platform_pct: number | null
          commission_total: number | null
          created_at: string | null
          docs_additional: string | null
          docs_bank_statements: string | null
          docs_passport: string | null
          docs_salary_cert: string | null
          docs_visa: string | null
          down_payment_pct: number | null
          edit_token: string
          employment_type: string | null
          estimated_monthly: number | null
          existing_debt_monthly: number | null
          id: string
          ip_hash: string | null
          max_loan_amount: number | null
          monthly_income: number | null
          preferred_rate_type: string | null
          preferred_term_years: number | null
          property_id: string | null
          property_title: string | null
          property_value: number | null
          residency_status: string | null
          source: string | null
          status: string | null
          status_updated_at: string | null
          updated_at: string | null
        }
        Insert: {
          agent_id?: string | null
          agent_slug?: string | null
          assigned_bank?: string | null
          assigned_broker?: string | null
          broker_notes?: string | null
          buyer_email?: string | null
          buyer_name: string
          buyer_phone?: string | null
          commission_agent_pct?: number | null
          commission_platform_pct?: number | null
          commission_total?: number | null
          created_at?: string | null
          docs_additional?: string | null
          docs_bank_statements?: string | null
          docs_passport?: string | null
          docs_salary_cert?: string | null
          docs_visa?: string | null
          down_payment_pct?: number | null
          edit_token?: string
          employment_type?: string | null
          estimated_monthly?: number | null
          existing_debt_monthly?: number | null
          id?: string
          ip_hash?: string | null
          max_loan_amount?: number | null
          monthly_income?: number | null
          preferred_rate_type?: string | null
          preferred_term_years?: number | null
          property_id?: string | null
          property_title?: string | null
          property_value?: number | null
          residency_status?: string | null
          source?: string | null
          status?: string | null
          status_updated_at?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string | null
          agent_slug?: string | null
          assigned_bank?: string | null
          assigned_broker?: string | null
          broker_notes?: string | null
          buyer_email?: string | null
          buyer_name?: string
          buyer_phone?: string | null
          commission_agent_pct?: number | null
          commission_platform_pct?: number | null
          commission_total?: number | null
          created_at?: string | null
          docs_additional?: string | null
          docs_bank_statements?: string | null
          docs_passport?: string | null
          docs_salary_cert?: string | null
          docs_visa?: string | null
          down_payment_pct?: number | null
          edit_token?: string
          employment_type?: string | null
          estimated_monthly?: number | null
          existing_debt_monthly?: number | null
          id?: string
          ip_hash?: string | null
          max_loan_amount?: number | null
          monthly_income?: number | null
          preferred_rate_type?: string | null
          preferred_term_years?: number | null
          property_id?: string | null
          property_title?: string | null
          property_value?: number | null
          residency_status?: string | null
          source?: string | null
          status?: string | null
          status_updated_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mortgage_applications_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mortgage_applications_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mortgage_applications_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      mortgage_rates: {
        Row: {
          bank_logo_url: string | null
          bank_name: string
          created_at: string | null
          early_settlement_fee_pct: number | null
          id: string
          is_active: boolean | null
          is_islamic: boolean | null
          last_updated: string | null
          max_ltv_pct: number | null
          max_term_years: number | null
          min_income_aed: number | null
          min_term_years: number | null
          notes: string | null
          processing_fee_pct: number | null
          product_type: string
          rate_pct: number
        }
        Insert: {
          bank_logo_url?: string | null
          bank_name: string
          created_at?: string | null
          early_settlement_fee_pct?: number | null
          id?: string
          is_active?: boolean | null
          is_islamic?: boolean | null
          last_updated?: string | null
          max_ltv_pct?: number | null
          max_term_years?: number | null
          min_income_aed?: number | null
          min_term_years?: number | null
          notes?: string | null
          processing_fee_pct?: number | null
          product_type: string
          rate_pct: number
        }
        Update: {
          bank_logo_url?: string | null
          bank_name?: string
          created_at?: string | null
          early_settlement_fee_pct?: number | null
          id?: string
          is_active?: boolean | null
          is_islamic?: boolean | null
          last_updated?: string | null
          max_ltv_pct?: number | null
          max_term_years?: number | null
          min_income_aed?: number | null
          min_term_years?: number | null
          notes?: string | null
          processing_fee_pct?: number | null
          product_type?: string
          rate_pct?: number
        }
        Relationships: []
      }
      page_events: {
        Row: {
          agent_id: string
          created_at: string
          event_type: string
          id: string
          ip_hash: string | null
          metadata: Json | null
          referrer: string | null
          user_agent: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string
          event_type: string
          id?: string
          ip_hash?: string | null
          metadata?: Json | null
          referrer?: string | null
          user_agent?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string
          event_type?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json | null
          referrer?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "page_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
        ]
      }
      page_views: {
        Row: {
          agent_id: string
          city: string | null
          country: string | null
          device_type: string | null
          id: string
          referrer: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          viewed_at: string | null
        }
        Insert: {
          agent_id: string
          city?: string | null
          country?: string | null
          device_type?: string | null
          id?: string
          referrer?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          viewed_at?: string | null
        }
        Update: {
          agent_id?: string
          city?: string | null
          country?: string | null
          device_type?: string | null
          id?: string
          referrer?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "page_views_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_views_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
        ]
      }
      project_agent_assignments: {
        Row: {
          agent_id: string
          clicks: number | null
          created_at: string | null
          id: string
          impressions: number | null
          leads_generated: number | null
          opted_in: boolean | null
          project_id: string
        }
        Insert: {
          agent_id: string
          clicks?: number | null
          created_at?: string | null
          id?: string
          impressions?: number | null
          leads_generated?: number | null
          opted_in?: boolean | null
          project_id: string
        }
        Update: {
          agent_id?: string
          clicks?: number | null
          created_at?: string | null
          id?: string
          impressions?: number | null
          leads_generated?: number | null
          opted_in?: boolean | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_agent_assignments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_agent_assignments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_agent_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "featured_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_leads: {
        Row: {
          agent_id: string
          budget_range: string | null
          commission_earned_aed: number | null
          conversion_value_aed: number | null
          created_at: string | null
          device_type: string | null
          email: string | null
          id: string
          ip_hash: string | null
          message: string | null
          name: string
          nationality: string | null
          phone: string | null
          platform_fee_earned: number | null
          preferred_bedrooms: string | null
          project_id: string
          source: string | null
          status: string | null
          updated_at: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          agent_id: string
          budget_range?: string | null
          commission_earned_aed?: number | null
          conversion_value_aed?: number | null
          created_at?: string | null
          device_type?: string | null
          email?: string | null
          id?: string
          ip_hash?: string | null
          message?: string | null
          name: string
          nationality?: string | null
          phone?: string | null
          platform_fee_earned?: number | null
          preferred_bedrooms?: string | null
          project_id: string
          source?: string | null
          status?: string | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          agent_id?: string
          budget_range?: string | null
          commission_earned_aed?: number | null
          conversion_value_aed?: number | null
          created_at?: string | null
          device_type?: string | null
          email?: string | null
          id?: string
          ip_hash?: string | null
          message?: string | null
          name?: string
          nationality?: string | null
          phone?: string | null
          platform_fee_earned?: number | null
          preferred_bedrooms?: string | null
          project_id?: string
          source?: string | null
          status?: string | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_leads_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_leads_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_leads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "featured_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_units: {
        Row: {
          area_sqft: number | null
          area_sqm: number | null
          bathrooms: number | null
          bedrooms: number | null
          created_at: string
          floor_number: number | null
          floor_plan_url: string | null
          furnished: string | null
          id: string
          price: number | null
          project_id: string
          rem_id: string
          status: string
          synced_at: string | null
          unit_number: string | null
          unit_type: string | null
          updated_at: string
          view: string | null
        }
        Insert: {
          area_sqft?: number | null
          area_sqm?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          created_at?: string
          floor_number?: number | null
          floor_plan_url?: string | null
          furnished?: string | null
          id?: string
          price?: number | null
          project_id: string
          rem_id: string
          status?: string
          synced_at?: string | null
          unit_number?: string | null
          unit_type?: string | null
          updated_at?: string
          view?: string | null
        }
        Update: {
          area_sqft?: number | null
          area_sqm?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          created_at?: string
          floor_number?: number | null
          floor_plan_url?: string | null
          furnished?: string | null
          id?: string
          price?: number | null
          project_id?: string
          rem_id?: string
          status?: string
          synced_at?: string | null
          unit_number?: string | null
          unit_type?: string | null
          updated_at?: string
          view?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_units_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          area: string | null
          available_units: Json | null
          beds: string | null
          brochure_url: string | null
          completion_date: string | null
          cover_image_url: string | null
          created_at: string
          description: string | null
          developer_id: string | null
          district_name: string | null
          facilities: Json | null
          floor_plan_urls: string[] | null
          gallery_images: string[] | null
          handover_percentage: number | null
          id: string
          images_categorized: Json | null
          lat: number | null
          lng: number | null
          location: string | null
          max_area_sqft: number | null
          max_price: number | null
          min_area_sqft: number | null
          min_price: number | null
          name: string
          nearby_locations: Json | null
          payment_plan: Json | null
          payment_plan_detail: Json | null
          percent_completed: number | null
          property_types: string[] | null
          rem_id: string | null
          slug: string
          status: string
          synced_at: string | null
          updated_at: string
        }
        Insert: {
          area?: string | null
          available_units?: Json | null
          beds?: string | null
          brochure_url?: string | null
          completion_date?: string | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          developer_id?: string | null
          district_name?: string | null
          facilities?: Json | null
          floor_plan_urls?: string[] | null
          gallery_images?: string[] | null
          handover_percentage?: number | null
          id?: string
          images_categorized?: Json | null
          lat?: number | null
          lng?: number | null
          location?: string | null
          max_area_sqft?: number | null
          max_price?: number | null
          min_area_sqft?: number | null
          min_price?: number | null
          name: string
          nearby_locations?: Json | null
          payment_plan?: Json | null
          payment_plan_detail?: Json | null
          percent_completed?: number | null
          property_types?: string[] | null
          rem_id?: string | null
          slug: string
          status?: string
          synced_at?: string | null
          updated_at?: string
        }
        Update: {
          area?: string | null
          available_units?: Json | null
          beds?: string | null
          brochure_url?: string | null
          completion_date?: string | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          developer_id?: string | null
          district_name?: string | null
          facilities?: Json | null
          floor_plan_urls?: string[] | null
          gallery_images?: string[] | null
          handover_percentage?: number | null
          id?: string
          images_categorized?: Json | null
          lat?: number | null
          lng?: number | null
          location?: string | null
          max_area_sqft?: number | null
          max_price?: number | null
          min_area_sqft?: number | null
          min_price?: number | null
          name?: string
          nearby_locations?: Json | null
          payment_plan?: Json | null
          payment_plan_detail?: Json | null
          percent_completed?: number | null
          property_types?: string[] | null
          rem_id?: string | null
          slug?: string
          status?: string
          synced_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_developer_id_fkey"
            columns: ["developer_id"]
            isOneToOne: false
            referencedRelation: "developers"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          additional_photos: string[] | null
          agent_id: string
          area_sqft: number | null
          bathrooms: number | null
          bedrooms: number | null
          cobroke_commission_split: number | null
          cobroke_expires_at: string | null
          cobroke_notes: string | null
          created_at: string | null
          description: string | null
          developer: string | null
          dld_permit: string | null
          external_url: string | null
          features: string[] | null
          handover_date: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          is_featured: boolean | null
          listing_type: string
          location: string | null
          open_for_cobroke: boolean | null
          payment_plan: string | null
          price: string | null
          price_numeric: number | null
          property_type: string | null
          reference_number: string | null
          sort_order: number | null
          source: string | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          additional_photos?: string[] | null
          agent_id: string
          area_sqft?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          cobroke_commission_split?: number | null
          cobroke_expires_at?: string | null
          cobroke_notes?: string | null
          created_at?: string | null
          description?: string | null
          developer?: string | null
          dld_permit?: string | null
          external_url?: string | null
          features?: string[] | null
          handover_date?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_featured?: boolean | null
          listing_type?: string
          location?: string | null
          open_for_cobroke?: boolean | null
          payment_plan?: string | null
          price?: string | null
          price_numeric?: number | null
          property_type?: string | null
          reference_number?: string | null
          sort_order?: number | null
          source?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          additional_photos?: string[] | null
          agent_id?: string
          area_sqft?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          cobroke_commission_split?: number | null
          cobroke_expires_at?: string | null
          cobroke_notes?: string | null
          created_at?: string | null
          description?: string | null
          developer?: string | null
          dld_permit?: string | null
          external_url?: string | null
          features?: string[] | null
          handover_date?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_featured?: boolean | null
          listing_type?: string
          location?: string | null
          open_for_cobroke?: boolean | null
          payment_plan?: string | null
          price?: string | null
          price_numeric?: number | null
          property_type?: string | null
          reference_number?: string | null
          sort_order?: number | null
          source?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
        ]
      }
      property_matches: {
        Row: {
          buyer_request_id: string
          buying_agent_id: string
          connected_at: string | null
          created_at: string | null
          deal_id: string | null
          id: string
          listing_agent_id: string
          listing_agent_responded_at: string | null
          match_score: number | null
          property_id: string
          status: string
        }
        Insert: {
          buyer_request_id: string
          buying_agent_id: string
          connected_at?: string | null
          created_at?: string | null
          deal_id?: string | null
          id?: string
          listing_agent_id: string
          listing_agent_responded_at?: string | null
          match_score?: number | null
          property_id: string
          status?: string
        }
        Update: {
          buyer_request_id?: string
          buying_agent_id?: string
          connected_at?: string | null
          created_at?: string | null
          deal_id?: string | null
          id?: string
          listing_agent_id?: string
          listing_agent_responded_at?: string | null
          match_score?: number | null
          property_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_matches_buyer_request_id_fkey"
            columns: ["buyer_request_id"]
            isOneToOne: false
            referencedRelation: "buyer_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_matches_buying_agent_id_fkey"
            columns: ["buying_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_matches_buying_agent_id_fkey"
            columns: ["buying_agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_matches_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "co_broke_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_matches_listing_agent_id_fkey"
            columns: ["listing_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_matches_listing_agent_id_fkey"
            columns: ["listing_agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_matches_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          created_at: string | null
          free_listings_granted: number | null
          id: string
          referral_code: string
          referred_id: string
          referrer_id: string
          reward_applied_at: string | null
          reward_type: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          free_listings_granted?: number | null
          id?: string
          referral_code: string
          referred_id: string
          referrer_id: string
          reward_applied_at?: string | null
          reward_type?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          free_listings_granted?: number | null
          id?: string
          referral_code?: string
          referred_id?: string
          referrer_id?: string
          reward_applied_at?: string | null
          reward_type?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: true
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: true
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_events: {
        Row: {
          agent_id: string
          amount_cents: number | null
          created_at: string | null
          currency: string | null
          event_type: string
          id: string
          metadata: Json | null
          stripe_event_id: string | null
          tier: string | null
        }
        Insert: {
          agent_id: string
          amount_cents?: number | null
          created_at?: string | null
          currency?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          stripe_event_id?: string | null
          tier?: string | null
        }
        Update: {
          agent_id?: string
          amount_cents?: number | null
          created_at?: string | null
          currency?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          stripe_event_id?: string | null
          tier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_public"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          broker_number: string | null
          created_at: string | null
          email: string
          id: string
          name: string | null
          source: string | null
        }
        Insert: {
          broker_number?: string | null
          created_at?: string | null
          email: string
          id?: string
          name?: string | null
          source?: string | null
        }
        Update: {
          broker_number?: string | null
          created_at?: string | null
          email?: string
          id?: string
          name?: string | null
          source?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      agents_public: {
        Row: {
          agency_logo_url: string | null
          agency_name: string | null
          agency_website: string | null
          areas_covered: string | null
          background_image_url: string | null
          bayut_profile: string | null
          bio: string | null
          calendly_url: string | null
          created_at: string | null
          custom_link_1_label: string | null
          custom_link_1_url: string | null
          custom_link_2_label: string | null
          custom_link_2_url: string | null
          dld_avg_deal_aed: number | null
          dld_broker_number: string | null
          dld_total_deals: number | null
          dld_total_volume_aed: number | null
          dld_verified: boolean | null
          email: string | null
          id: string | null
          instagram_handle: string | null
          instagram_url: string | null
          is_active: boolean | null
          is_featured: boolean | null
          linkedin_url: string | null
          name: string | null
          phone: string | null
          photo_url: string | null
          property_finder_profile: string | null
          rera_brn: string | null
          show_golden_visa: boolean | null
          show_preapproval: boolean | null
          slug: string | null
          specialization: string | null
          tagline: string | null
          tier: string | null
          tiktok_url: string | null
          verification_status: string | null
          whatsapp: string | null
          youtube_url: string | null
        }
        Insert: {
          agency_logo_url?: string | null
          agency_name?: string | null
          agency_website?: string | null
          areas_covered?: string | null
          background_image_url?: string | null
          bayut_profile?: string | null
          bio?: string | null
          calendly_url?: string | null
          created_at?: string | null
          custom_link_1_label?: string | null
          custom_link_1_url?: string | null
          custom_link_2_label?: string | null
          custom_link_2_url?: string | null
          dld_avg_deal_aed?: number | null
          dld_broker_number?: string | null
          dld_total_deals?: number | null
          dld_total_volume_aed?: number | null
          dld_verified?: boolean | null
          email?: string | null
          id?: string | null
          instagram_handle?: string | null
          instagram_url?: string | null
          is_active?: boolean | null
          is_featured?: boolean | null
          linkedin_url?: string | null
          name?: string | null
          phone?: string | null
          photo_url?: string | null
          property_finder_profile?: string | null
          rera_brn?: string | null
          show_golden_visa?: boolean | null
          show_preapproval?: boolean | null
          slug?: string | null
          specialization?: string | null
          tagline?: string | null
          tier?: string | null
          tiktok_url?: string | null
          verification_status?: string | null
          whatsapp?: string | null
          youtube_url?: string | null
        }
        Update: {
          agency_logo_url?: string | null
          agency_name?: string | null
          agency_website?: string | null
          areas_covered?: string | null
          background_image_url?: string | null
          bayut_profile?: string | null
          bio?: string | null
          calendly_url?: string | null
          created_at?: string | null
          custom_link_1_label?: string | null
          custom_link_1_url?: string | null
          custom_link_2_label?: string | null
          custom_link_2_url?: string | null
          dld_avg_deal_aed?: number | null
          dld_broker_number?: string | null
          dld_total_deals?: number | null
          dld_total_volume_aed?: number | null
          dld_verified?: boolean | null
          email?: string | null
          id?: string | null
          instagram_handle?: string | null
          instagram_url?: string | null
          is_active?: boolean | null
          is_featured?: boolean | null
          linkedin_url?: string | null
          name?: string | null
          phone?: string | null
          photo_url?: string | null
          property_finder_profile?: string | null
          rera_brn?: string | null
          show_golden_visa?: boolean | null
          show_preapproval?: boolean | null
          slug?: string | null
          specialization?: string | null
          tagline?: string | null
          tier?: string | null
          tiktok_url?: string | null
          verification_status?: string | null
          whatsapp?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_social_token: {
        Args: { p_agent_id: string; p_provider: string }
        Returns: string
      }
      increment_bonus_listings: {
        Args: { agent_uuid: string }
        Returns: undefined
      }
      load_brokers_from_json: { Args: { data: Json }; Returns: number }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      store_social_token: {
        Args: { p_agent_id: string; p_provider: string; p_token: string }
        Returns: undefined
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
