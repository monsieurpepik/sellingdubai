-- 20241201000000_session_revocation.sql
-- Source: sql/011_session_revocation.sql
-- Force-logout support via revoke-session edge function.

ALTER TABLE public.magic_links
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

-- Partial index — used by token verification queries to skip revoked/expired tokens
CREATE INDEX IF NOT EXISTS idx_magic_links_active_token
  ON public.magic_links (token)
  WHERE revoked_at IS NULL;

COMMENT ON COLUMN public.magic_links.revoked_at IS 'Set by revoke-session function. Token becomes invalid immediately regardless of expires_at.';
