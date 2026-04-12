-- supabase/migrations/20260408000004_sessions.sql
-- AI secretary conversation state for WhatsApp and Telegram channels.
--
-- TTL policy: sessions inactive for more than 24 hours are purged by the
-- edge function (whatsapp-secretary / telegram-secretary) on each invocation.
-- No DB trigger or pg_cron job is used — application-layer enforcement only.

-- ---------------------------------------------------------------------------
-- WhatsApp conversation state
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  turns        JSONB       NOT NULL DEFAULT '[]'::jsonb,  -- [{role, content}], max 10 items
  last_active  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_sessions_agent
  ON whatsapp_sessions(agent_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_last_active
  ON whatsapp_sessions(last_active);

-- RLS: enabled; no client-facing policies — all access is via edge functions
-- using the service role key, which bypasses RLS entirely.
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Telegram conversation state + auth
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS telegram_sessions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id         UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  telegram_user_id TEXT        NOT NULL,
  session_token    TEXT,                              -- issued after magic link auth
  turns            JSONB       NOT NULL DEFAULT '[]'::jsonb,  -- [{role, content}], max 10 items
  last_active      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_sessions_agent
  ON telegram_sessions(agent_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_sessions_telegram_user_id
  ON telegram_sessions(telegram_user_id);

CREATE INDEX IF NOT EXISTS idx_telegram_sessions_last_active
  ON telegram_sessions(last_active);

-- RLS: enabled; no client-facing policies — all access is via edge functions
-- using the service role key, which bypasses RLS entirely.
ALTER TABLE telegram_sessions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Siri / voice-layer token on agents
-- ---------------------------------------------------------------------------
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS siri_token TEXT;
