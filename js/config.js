// ==========================================
// CONFIGURATION
// ==========================================
export const DEMO_MODE = false;
export const SUPABASE_URL = 'https://pjyorgedaxevxophpfib.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqeW9yZ2VkYXhldnhvcGhwZmliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMjU2MzYsImV4cCI6MjA4OTgwMTYzNn0.IhIpAxk--Y0ZKufK51-CPuhw-NafyLPvhH31iqzpgrU';
export const CAPTURE_URL = `${SUPABASE_URL}/functions/v1/capture-lead`;
export const LOG_EVENT_URL = SUPABASE_URL + '/functions/v1/log-event';

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
