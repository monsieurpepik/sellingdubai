-- sql/waitlist.sql
-- Waitlist table for pre-launch agent signups

CREATE TABLE IF NOT EXISTS public.waitlist (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  whatsapp   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive unique index on email
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_unique
  ON public.waitlist (lower(email));

CREATE INDEX IF NOT EXISTS waitlist_created_at_idx
  ON public.waitlist (created_at DESC);

-- RLS
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_waitlist" ON public.waitlist;
CREATE POLICY "anon_insert_waitlist" ON public.waitlist
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon_read_waitlist_count" ON public.waitlist;
CREATE POLICY "anon_read_waitlist_count" ON public.waitlist
  FOR SELECT TO anon USING (true);
