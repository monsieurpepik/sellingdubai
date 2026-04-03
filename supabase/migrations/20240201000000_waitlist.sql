-- 20240201000000_waitlist.sql
-- Source: sql/001_waitlist.sql

CREATE TABLE IF NOT EXISTS public.waitlist (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  email      TEXT        NOT NULL,
  whatsapp   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_email_lower
  ON public.waitlist (lower(email));

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- anon can join the waitlist and view their own entry
CREATE POLICY IF NOT EXISTS "waitlist_anon_insert"
  ON public.waitlist FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "waitlist_anon_select"
  ON public.waitlist FOR SELECT TO anon
  USING (true);
