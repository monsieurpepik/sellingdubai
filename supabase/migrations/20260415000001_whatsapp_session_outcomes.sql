-- supabase/migrations/20260415000001_whatsapp_session_outcomes.sql
-- RSI Data Layer — implicit lead labeling columns + ai_training_data view.
--
-- Every whatsapp_sessions row becomes a labeled training example automatically.
-- No agent action required — labeling is inferred from behavior (reply, no-reply, tag).

ALTER TABLE whatsapp_sessions
  ADD COLUMN IF NOT EXISTS outcome TEXT
    CHECK (outcome IN ('qualified', 'unqualified', 'no_response', 'unknown'))
    DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS outcome_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outcome_source TEXT
    CHECK (outcome_source IN ('implicit_reply', 'implicit_no_reply', 'agent_tag', 'manual_review')),
  ADD COLUMN IF NOT EXISTS agent_replied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS turn_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buyer_nationality TEXT,
  ADD COLUMN IF NOT EXISTS buyer_budget_aed BIGINT,
  ADD COLUMN IF NOT EXISTS buyer_timeline_months INTEGER,
  ADD COLUMN IF NOT EXISTS qualifying_question_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversation_turns JSONB;

-- Index for training data queries (outcome + recency)
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_outcome
  ON whatsapp_sessions(outcome, created_at DESC)
  WHERE outcome != 'unknown';

-- ---------------------------------------------------------------------------
-- Training data view
-- Every row is a labeled conversation with buyer signals attached.
-- Pull training data: SELECT * FROM ai_training_data WHERE created_at > NOW() - INTERVAL '30 days'
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW ai_training_data AS
SELECT
  ws.id                       AS session_id,
  ws.agent_id,
  ws.conversation_turns,
  ws.outcome,
  ws.outcome_source,
  ws.outcome_set_at,
  ws.turn_count,
  ws.qualifying_question_count,
  ws.buyer_budget_aed,
  ws.buyer_timeline_months,
  ws.buyer_nationality,
  ws.agent_replied_at,
  a.areas,
  a.agency_name,
  (ws.outcome = 'qualified')  AS is_positive,
  ws.created_at
FROM whatsapp_sessions ws
JOIN agents a ON ws.agent_id = a.id
WHERE ws.outcome != 'unknown'
  AND ws.conversation_turns IS NOT NULL;
