// ==========================================
// CONFIGURATION
// ==========================================
// __SUPABASE_URL__ and __SUPABASE_ANON_KEY__ are replaced at build time by
// esbuild (see scripts/build-js.js). Both SUPABASE_URL and SUPABASE_ANON_KEY
// must be provided via environment variables — there are no hardcoded fallbacks.
/* global __SUPABASE_URL__, __SUPABASE_ANON_KEY__ */
export const DEMO_MODE = false;
export const SUPABASE_URL = (typeof __SUPABASE_URL__ !== 'undefined') ? __SUPABASE_URL__ : undefined;
if (!SUPABASE_URL) {
  console.error('[config] SUPABASE_URL is not set — check your environment variables');
}
export const SUPABASE_ANON_KEY = (typeof __SUPABASE_ANON_KEY__ !== 'undefined') ? __SUPABASE_ANON_KEY__ : undefined;
if (!SUPABASE_ANON_KEY) {
  console.error('[config] SUPABASE_ANON_KEY is not set — check your environment variables');
}
export const CAPTURE_URL = `${SUPABASE_URL}/functions/v1/capture-lead-v4`;
export const LOG_EVENT_URL = `${SUPABASE_URL}/functions/v1/log-event`;

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
