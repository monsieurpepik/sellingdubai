-- supabase/migrations/20260415000002_lead_quality_and_outcomes.sql
-- RSI Feedback Loop: lead quality rating, ai_conversation_outcomes table,
-- and pg_cron schedules for quality follow-up and weekly performance report.

-- 1. Lead quality rating columns
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS quality_rating INTEGER
    CHECK (quality_rating IN (1, 2)),
  ADD COLUMN IF NOT EXISTS rated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quality_followup_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quality_followup_sent_at TIMESTAMPTZ;

-- Index: find leads needing quality follow-up (partial — only unrated unsent)
CREATE INDEX IF NOT EXISTS idx_leads_quality_followup
  ON leads(quality_followup_due_at)
  WHERE quality_rating IS NULL AND quality_followup_sent_at IS NULL;

-- 2. ai_conversation_outcomes: one row per closed session
CREATE TABLE IF NOT EXISTS ai_conversation_outcomes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID NOT NULL,
  agent_id              UUID NOT NULL REFERENCES agents(id),
  buyer_phone           TEXT,
  turn_count            INTEGER DEFAULT 0,
  lead_captured         BOOLEAN DEFAULT false,
  lead_quality          INTEGER CHECK (lead_quality IN (1, 2)),
  response_time_seconds INTEGER,
  outcome               TEXT
    CHECK (outcome IN ('qualified', 'unqualified', 'no_response', 'unknown'))
    DEFAULT 'unknown',
  created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_outcomes_agent_created
  ON ai_conversation_outcomes(agent_id, created_at DESC);

-- 3. pg_cron: lead quality follow-up every 30 minutes
SELECT cron.schedule(
  'lead-quality-followup',
  '*/30 * * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/lead-quality-followup',
      headers := '{"Authorization": "Bearer ' || current_setting('app.service_role_key') || '", "Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);

-- 4. pg_cron: weekly performance report — Monday 05:00 UTC (09:00 Dubai/UTC+4)
SELECT cron.schedule(
  'weekly-performance-report',
  '0 5 * * 1',
  $$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/weekly-performance-report',
      headers := '{"Authorization": "Bearer ' || current_setting('app.service_role_key') || '", "Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);
