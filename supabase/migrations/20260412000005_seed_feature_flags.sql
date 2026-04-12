-- Seed default feature flags
INSERT INTO feature_flags (name, description, enabled) VALUES
  ('BILLING_LIVE',         'Enable Stripe billing and payment flows',  false),
  ('WHATSAPP_AI_ENABLED',  'Enable WhatsApp AI secretary',             true),
  ('COBROKE_ENABLED',      'Enable cobroke discovery and requests',    true),
  ('TELEGRAM_ENABLED',     'Enable Telegram bot integration',          false),
  ('VAPI_ENABLED',         'Enable Vapi voice layer',                  false)
ON CONFLICT (name) DO NOTHING;
