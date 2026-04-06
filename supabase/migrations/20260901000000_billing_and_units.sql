-- Analytics and engagement tracking tables missing from Phase 3 reconstruction
-- Source: supabase db pull diff against production (2026-04-06)

-- -----------------------------------------------------------------------------
-- dld_projects
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dld_projects (
  project_id          bigint PRIMARY KEY,
  project_name        text,
  developer_name      text,
  project_status      text,
  completion_date     date,
  percent_completed   numeric,
  area_name_en        text,
  master_project_en   text,
  no_of_units         integer,
  no_of_buildings     integer,
  project_start_date  date,
  project_end_date    date
);
ALTER TABLE public.dld_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dld_projects_public_read" ON public.dld_projects FOR SELECT USING (true);

-- -----------------------------------------------------------------------------
-- dld_transactions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dld_transactions (
  id               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id         uuid        NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  transaction_type text,
  property_type    text,
  area             text,
  amount_aed       bigint,
  transaction_date date,
  dld_reference    text,
  created_at       timestamptz DEFAULT now()
);
ALTER TABLE public.dld_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dld_transactions_agent_read" ON public.dld_transactions FOR SELECT USING (auth.uid()::text = agent_id::text);

-- -----------------------------------------------------------------------------
-- subscription_events
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_events (
  id               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id         uuid        NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  stripe_event_id  text,
  event_type       text        NOT NULL,
  tier             text,
  amount_cents     integer,
  currency         text        DEFAULT 'aed',
  metadata         jsonb       DEFAULT '{}'::jsonb,
  created_at       timestamptz DEFAULT now()
);
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscription_events_agent_read" ON public.subscription_events FOR SELECT USING (auth.uid()::text = agent_id::text);

-- -----------------------------------------------------------------------------
-- project_units
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_units (
  id             uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rem_id         text        NOT NULL UNIQUE,
  project_id     uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  unit_number    text,
  unit_type      text,
  bedrooms       smallint,
  bathrooms      smallint,
  floor_number   smallint,
  area_sqft      numeric,
  area_sqm       numeric,
  price          numeric,
  floor_plan_url text,
  view           text,
  furnished      text,
  status         text        NOT NULL DEFAULT 'available',
  synced_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_units_public_read" ON public.project_units FOR SELECT USING (true);
