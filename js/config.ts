// ==========================================
// CONFIGURATION
// ==========================================
// __SUPABASE_URL__ and __SUPABASE_ANON_KEY__ are replaced at build time by
// esbuild (see scripts/build-js.js). Both SUPABASE_URL and SUPABASE_ANON_KEY
// must be provided via environment variables — there are no hardcoded fallbacks.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';

export const DEMO_MODE = false;
export const SUPABASE_URL: string = __SUPABASE_URL__;
if (!SUPABASE_URL) {
  console.error('[config] SUPABASE_URL is not set — check your environment variables');
}
export const SUPABASE_ANON_KEY: string = __SUPABASE_ANON_KEY__;
if (!SUPABASE_ANON_KEY) {
  console.error('[config] SUPABASE_ANON_KEY is not set — check your environment variables');
}
// capture-lead-v4: production function with dedup, Resend email, FB CAPI, webhook CRM.
// Migrated from capture-lead (legacy) on 2026-04-06. verify_jwt=false (public endpoint).
// Do not revert to capture-lead — it lacks dedup and server-side tracking.
export const CAPTURE_URL = `${SUPABASE_URL}/functions/v1/capture-lead-v4`;
export const LOG_EVENT_URL = `${SUPABASE_URL}/functions/v1/log-event`;

export const supabase: SupabaseClient<Database> = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
