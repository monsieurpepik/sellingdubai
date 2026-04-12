-- supabase/migrations/20260408000005_siri_token.sql
-- siri_token column is added as TEXT in 20260408000004_sessions.sql.
-- This migration only adds the unique index (retained from original _000005).
CREATE UNIQUE INDEX IF NOT EXISTS agents_siri_token_idx ON agents(siri_token) WHERE siri_token IS NOT NULL;
