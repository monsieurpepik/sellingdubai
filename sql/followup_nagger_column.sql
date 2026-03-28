-- Add followup_nagged_at column to leads table
-- Run in Supabase SQL Editor

DO $$ BEGIN
  ALTER TABLE public.leads ADD COLUMN followup_nagged_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add updated_at to agents if missing
DO $$ BEGIN
  ALTER TABLE public.agents ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

SELECT 'followup_nagged_at + updated_at columns added' AS result;
