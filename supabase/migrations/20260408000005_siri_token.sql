-- supabase/migrations/20260408000005_siri_token.sql
ALTER TABLE agents ADD COLUMN IF NOT EXISTS siri_token UUID DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS agents_siri_token_idx ON agents(siri_token) WHERE siri_token IS NOT NULL;
