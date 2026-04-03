-- 20241001000000_projects_rem_columns.sql
-- Source: sql/009_projects_rem_columns.sql
-- Extended location and unit metadata for REM API sync quality improvements.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS beds             INTEGER[],
  ADD COLUMN IF NOT EXISTS property_types  TEXT[],
  ADD COLUMN IF NOT EXISTS lat             NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS lng             NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS min_area_sqft   NUMERIC,
  ADD COLUMN IF NOT EXISTS max_area_sqft   NUMERIC,
  ADD COLUMN IF NOT EXISTS district_name   TEXT;

CREATE INDEX IF NOT EXISTS idx_projects_property_types
  ON public.projects USING GIN (property_types)
  WHERE property_types IS NOT NULL;
