-- ============================================================
-- SESSION REVOCATION — add revoked_at to magic_links
-- Run in Supabase SQL Editor
-- Safe to run multiple times (IF NOT EXISTS / DO NOTHING)
-- ============================================================

-- Add revoked_at column to magic_links
ALTER TABLE public.magic_links
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ DEFAULT NULL;

-- Index for fast lookup on active tokens (expires_at in future, not revoked)
CREATE INDEX IF NOT EXISTS idx_magic_links_active
  ON public.magic_links (token)
  WHERE revoked_at IS NULL;
