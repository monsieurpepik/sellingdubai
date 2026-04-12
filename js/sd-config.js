// @ts-check
// ==========================================================
// SD_CONFIG — canonical non-module config for IIFE scripts
// ==========================================================
// SINGLE SOURCE OF TRUTH for non-bundled scripts.
// When rotating the Supabase anon key, update BOTH this file
// AND js/config.js (used by the esbuild ES module bundle).
// ==========================================================
window.SD_CONFIG = {
  SUPABASE_URL: 'https://pjyorgedaxevxophpfib.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqeW9yZ2VkYXhldnhvcGhwZmliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMjU2MzYsImV4cCI6MjA4OTgwMTYzNn0.IhIpAxk--Y0ZKufK51-CPuhw-NafyLPvhH31iqzpgrU',
  VAPI_PHONE_NUMBER: '+971XXXXXXXXX', // Set after Vapi phone number provisioned
};

// window.SD_FLAGS is populated by loadFeatureFlags() below.
// Call it once per page (non-blocking). Falls back to all-false on error.
window.SD_FLAGS = {};

async function loadFeatureFlags() {
  try {
    const url = (window.SD_CONFIG && window.SD_CONFIG.SUPABASE_URL) || '';
    const res = await fetch(`${url}/functions/v1/get-flags`);
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.flags && typeof data.flags === 'object') {
      window.SD_FLAGS = data.flags;
    }
  } catch (_e) {
    // non-blocking — SD_FLAGS stays {}
  }
}

loadFeatureFlags();
