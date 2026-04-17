-- Add intent column to leads for sell/buy qualifier tracking
ALTER TABLE leads ADD COLUMN IF NOT EXISTS intent TEXT
  CHECK (intent IN ('seller', 'buyer'));

COMMENT ON COLUMN leads.intent IS 'Qualifier intent: seller (wants to sell) or buyer (wants to buy/rent)';
