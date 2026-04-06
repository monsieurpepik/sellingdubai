-- Analytics and engagement tracking tables missing from Phase 3 reconstruction
-- Source: supabase db pull diff against production (2026-04-06)

-- -----------------------------------------------------------------------------
-- developers
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.developers (
  id         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug       text        NOT NULL UNIQUE,
  name       text        NOT NULL,
  logo_url   text,
  website    text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.developers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "developers_public_read" ON public.developers FOR SELECT USING (true);

-- -----------------------------------------------------------------------------
-- page_views
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.page_views (
  id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id     uuid        NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  referrer     text,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  user_agent   text,
  country      text,
  city         text,
  device_type  text,
  viewed_at    timestamptz DEFAULT now()
);
ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "page_views_anon_insert" ON public.page_views FOR INSERT WITH CHECK (true);
CREATE POLICY "page_views_agent_read"  ON public.page_views FOR SELECT USING (auth.uid()::text = agent_id::text);

-- -----------------------------------------------------------------------------
-- link_clicks
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.link_clicks (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id    uuid        NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  link_type   text        NOT NULL,
  link_url    text,
  referrer    text,
  device_type text,
  clicked_at  timestamptz DEFAULT now()
);
ALTER TABLE public.link_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "link_clicks_anon_insert" ON public.link_clicks FOR INSERT WITH CHECK (true);
CREATE POLICY "link_clicks_agent_read"  ON public.link_clicks FOR SELECT USING (auth.uid()::text = agent_id::text);

-- -----------------------------------------------------------------------------
-- email_signups
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_signups (
  id         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id   uuid        NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  email      text        NOT NULL,
  source     text        DEFAULT 'agent_page',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.email_signups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_signups_anon_insert" ON public.email_signups FOR INSERT WITH CHECK (true);
CREATE POLICY "email_signups_agent_read"  ON public.email_signups FOR SELECT USING (auth.uid()::text = agent_id::text);
