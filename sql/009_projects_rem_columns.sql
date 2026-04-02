-- sql/projects_rem_columns.sql
-- Add REM CRM-specific columns to projects table
-- Applied 2026-03-28 via Supabase MCP

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS beds           TEXT,
  ADD COLUMN IF NOT EXISTS property_types TEXT[],
  ADD COLUMN IF NOT EXISTS lat            NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS lng            NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS min_area_sqft  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS max_area_sqft  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS district_name  TEXT;

CREATE INDEX IF NOT EXISTS idx_projects_property_types
  ON public.projects USING GIN (property_types)
  WHERE property_types IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_district_name
  ON public.projects (district_name)
  WHERE district_name IS NOT NULL;
