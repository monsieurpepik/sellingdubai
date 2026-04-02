// ==========================================
// CONFIGURATION
// ==========================================
// __SUPABASE_URL__ and __SUPABASE_ANON_KEY__ are replaced at build time by
// esbuild (see scripts/build-js.js). The typeof guard + fallback lets this file
// load without bundling in local dev (DEV script tag) without throwing.
/* global __SUPABASE_URL__, __SUPABASE_ANON_KEY__ */
export const DEMO_MODE = false;
export const SUPABASE_URL = (typeof __SUPABASE_URL__ !== 'undefined' && __SUPABASE_URL__)
  || 'https://pjyorgedaxevxophpfib.supabase.co';
export const SUPABASE_ANON_KEY = (typeof __SUPABASE_ANON_KEY__ !== 'undefined' && __SUPABASE_ANON_KEY__)
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqeW9yZ2VkYXhldnhvcGhwZmliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMjU2MzYsImV4cCI6MjA4OTgwMTYzNn0.IhIpAxk--Y0ZKufK51-CPuhw-NafyLPvhH31iqzpgrU';
export const CAPTURE_URL = `${SUPABASE_URL}/functions/v1/capture-lead`;
export const LOG_EVENT_URL = SUPABASE_URL + '/functions/v1/log-event';

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
