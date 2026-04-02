-- sql/014_off_plan_enrichment.sql
-- Adds enrichment columns to projects table.
-- All columns are nullable so existing rows are unaffected.
-- The sync function already writes to payment_plan_detail (matches this column name).

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS payment_plan_detail  JSONB    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gallery_images       TEXT[]   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS floor_plan_urls      TEXT[]   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS available_units      JSONB    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS facilities           JSONB    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS nearby_locations     JSONB    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS brochure_url         TEXT     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS images_categorized   JSONB    DEFAULT NULL;

-- GIN index for array containment queries on gallery_images
CREATE INDEX IF NOT EXISTS idx_projects_gallery_images
  ON public.projects USING GIN (gallery_images)
  WHERE gallery_images IS NOT NULL;

COMMENT ON COLUMN public.projects.payment_plan_detail IS
  'Typed milestone array: [{phase, percentage, trigger, due_date}]. Populated by sync-rem-offplan for top-30 priority projects.';
COMMENT ON COLUMN public.projects.available_units IS
  'REM typical_units array: unit specs available for sale. Populated for priority projects.';
