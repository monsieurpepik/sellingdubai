-- Seed 5 demo agents for the public agent directory
-- Safe to re-run: ON CONFLICT DO NOTHING

INSERT INTO agents (
  id, slug, name, email,
  verification_status, dld_verified, tier,
  rera_brn, agency_name, is_active,
  photo_url, created_at
) VALUES
  (
    gen_random_uuid(),
    'ahmed-al-mansouri',
    'Ahmed Al Mansouri',
    'ahmed.mansouri@demo.sellingdubai.ae',
    'verified', true, 'pro',
    '12847', 'Allsopp & Allsopp', true,
    null, now() - interval '120 days'
  ),
  (
    gen_random_uuid(),
    'sarah-johnson-dubai',
    'Sarah Johnson',
    'sarah.johnson@demo.sellingdubai.ae',
    'verified', true, 'premium',
    '23561', 'Betterhomes', true,
    null, now() - interval '90 days'
  ),
  (
    gen_random_uuid(),
    'khalid-al-rashid',
    'Khalid Al Rashid',
    'khalid.rashid@demo.sellingdubai.ae',
    'verified', true, 'premium',
    '34912', 'haus & haus', true,
    null, now() - interval '60 days'
  ),
  (
    gen_random_uuid(),
    'priya-sharma-dubai',
    'Priya Sharma',
    'priya.sharma@demo.sellingdubai.ae',
    'verified', true, 'free',
    '45238', 'Driven Properties', true,
    null, now() - interval '30 days'
  ),
  (
    gen_random_uuid(),
    'james-thornton-dubai',
    'James Thornton',
    'james.thornton@demo.sellingdubai.ae',
    'verified', true, 'pro',
    '56704', 'Fäm Properties', true,
    null, now() - interval '15 days'
  )
ON CONFLICT (slug) DO NOTHING;
