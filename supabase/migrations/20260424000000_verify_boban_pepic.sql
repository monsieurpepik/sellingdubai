-- Set boban-pepic to verified — primary test/demo agent profile.
-- Idempotent: only updates if the row exists and is not already verified.
UPDATE agents
SET verification_status = 'verified'
WHERE slug = 'boban-pepic'
  AND (verification_status IS NULL OR verification_status <> 'verified');
