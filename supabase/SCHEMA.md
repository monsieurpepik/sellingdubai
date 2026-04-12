# SellingDubai — Supabase Schema Reference

Last updated: 2026-04-03
Reconstructed from: `sql/` migration source files + edge function source code
Applied via: `supabase/migrations/` (21 files, timestamps 20240101–20260402)

---

## Migration History

| File | Source | Feature |
|------|--------|---------|
| `20240101000000_base_schema.sql` | Reconstructed | Foundation tables (agents, properties, leads, events, page_events, mortgage_applications, project_leads, mortgage_rates) |
| `20240201000000_waitlist.sql` | sql/001 | Waitlist table + anon policies |
| `20240301000000_magic_links_auth.sql` | sql/002 | Magic link auth + agent profile columns |
| `20240401000000_agencies.sql` | sql/003 | Agency management + updated_at trigger |
| `20240501000000_market_rates.sql` | sql/004 | EIBOR/benchmark rates |
| `20240601000000_off_plan_inventory.sql` | sql/005–007 | Developers + projects + project_units |
| `20240701000000_agent_projects.sql` | sql/008 | Agent-project assignments |
| `20240801000000_billing.sql` | sql/006 (billing) | Stripe billing columns on agents |
| `20240901000000_followup_nagger.sql` | sql/006 (nagger) | leads.followup_nagged_at + agents.updated_at |
| `20241001000000_projects_rem_columns.sql` | sql/009 | REM sync: beds, lat/lng, property_types |
| `20241101000000_rate_limiting.sql` | sql/010 | ip_hash on project_leads + mortgage_applications |
| `20241201000000_session_revocation.sql` | sql/011 | magic_links.revoked_at + active token index |
| `20250101000000_rls_policies.sql` | sql/012 | Full RLS audit pass |
| `20250201000000_indexes.sql` | sql/013 | Performance indexes |
| `20250301000000_email_verification.sql` | Reconstructed | OTP verification + DLD broker registry |
| `20250401000000_referrals.sql` | Reconstructed | Agent-signup referrals |
| `20250501000000_lead_referrals.sql` | Reconstructed | Agent-to-agent lead passing |
| `20250601000000_cobroke.sql` | Reconstructed | Co-brokerage deals + increment_bonus_listings RPC |
| `20250701000000_buyer_requests.sql` | Reconstructed | Premium buyer matching network |
| `20250801000000_featured_projects.sql` | Reconstructed | Off-plan lead marketplace |
| `20260402062459_off_plan_enrichment.sql` | sql/014 | Projects gallery/payment plan enrichment |

---

## Tables

### `agents`
Primary profile table. One row per registered agent.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| slug | TEXT UNIQUE NOT NULL | URL identifier |
| name | TEXT | |
| email | TEXT | |
| phone | TEXT | |
| whatsapp | TEXT | |
| tagline | TEXT | |
| photo_url | TEXT | Served via Netlify Image CDN |
| is_active | BOOLEAN DEFAULT true | |
| verification_status | TEXT | 'unverified' \| 'pending' \| 'verified' |
| dld_verified | BOOLEAN DEFAULT false | |
| rera_brn | TEXT | Broker registration number |
| tier | TEXT DEFAULT 'free' | 'free' \| 'premium' |
| subscription_status | TEXT | Stripe subscription state |
| stripe_customer_id | TEXT | |
| stripe_subscription_id | TEXT | |
| stripe_subscription_status | TEXT | |
| stripe_plan | TEXT | |
| stripe_current_period_end | TIMESTAMPTZ | |
| agency_id | UUID FK agencies | Nullable |
| agency_name | TEXT | Denormalised for display |
| agency_logo_url | TEXT | |
| calendly_url | TEXT | |
| webhook_url | TEXT | |
| background_image_url | TEXT | |
| custom_link_1_label | TEXT | |
| custom_link_1_url | TEXT | |
| custom_link_2_label | TEXT | |
| custom_link_2_url | TEXT | |
| bayut_profile | TEXT | |
| facebook_pixel_id | TEXT | |
| facebook_capi_token | TEXT | |
| ga4_measurement_id | TEXT | |
| dld_total_deals | INTEGER DEFAULT 0 | Incremented on cobroke close |
| bonus_listings | INTEGER DEFAULT 0 | Awarded via increment_bonus_listings() |
| open_for_cobroke | BOOLEAN DEFAULT false | |
| updated_at | TIMESTAMPTZ | Set by trigger |
| created_at | TIMESTAMPTZ DEFAULT now() | |

**RLS:** Anon SELECT WHERE `is_active = true AND verification_status = 'verified'`
**Indexes:** `idx_agents_slug`, `idx_agents_verification_status`, `idx_agents_slug_verified` (partial: is_active=true)

---

### `properties`
Active property listings attached to agents.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| agent_id | UUID FK agents | |
| title | TEXT | |
| description | TEXT | |
| price | TEXT | Display string |
| price_numeric | NUMERIC | For range queries in matching engine |
| location | TEXT | |
| property_type | TEXT | |
| bedrooms | TEXT | |
| bathrooms | TEXT | |
| area_sqft | NUMERIC | |
| image_url | TEXT | Netlify Image CDN URL |
| is_active | BOOLEAN DEFAULT true | |
| open_for_cobroke | BOOLEAN DEFAULT false | |
| cobroke_commission_split | INTEGER | Percentage offered to buying agent |
| created_at | TIMESTAMPTZ DEFAULT now() | |

**RLS:** Anon SELECT WHERE `is_active = true AND agent_id IN (verified active agents)`
**Indexes:** `idx_properties_agent_id`, `idx_properties_is_active`, `idx_properties_agent_active_sort`

---

### `leads`
Inbound leads captured via agent profile pages.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| agent_id | UUID FK agents | |
| name | TEXT | |
| phone | TEXT | |
| email | TEXT | |
| budget_range | TEXT | |
| property_type | TEXT | |
| preferred_area | TEXT | |
| message | TEXT | |
| source | TEXT | |
| status | TEXT | |
| ip_hash | TEXT | SHA-256 of client IP |
| agent_notified_at | TIMESTAMPTZ | |
| followup_nagged_at | TIMESTAMPTZ | Set when follow-up reminder sent |
| created_at | TIMESTAMPTZ DEFAULT now() | |

**RLS:** No anon access. Written by `capture-lead-v4` (service_role).
**Indexes:** `idx_leads_agent_id`, `idx_leads_ip_hash`, `idx_leads_agent_phone`, `idx_leads_agent_email`, `idx_leads_followup`

---

### `events`
Structured event log for analytics.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| agent_id | UUID FK agents | |
| event_type | TEXT | |
| metadata | JSONB | |
| created_at | TIMESTAMPTZ DEFAULT now() | |

**RLS:** No anon access. Service_role only.
**Indexes:** `idx_events_agent_id`, `idx_events_type_created`

---

### `page_events`
Public-facing page interaction events (views, taps, form submits).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| agent_id | UUID FK agents | |
| event_type | TEXT CHECK | view, whatsapp_tap, lead_submit, link_click, phone_tap, share, mortgage_calc_open, mortgage_eligibility_check, mortgage_application_submitted, mortgage_doc_uploaded |
| metadata | JSONB | |
| referrer | TEXT | |
| user_agent | TEXT | |
| ip_hash | TEXT | |
| created_at | TIMESTAMPTZ DEFAULT now() | |

**RLS:** No anon access. Written by `log-event` (service_role).
**Indexes:** `idx_page_events_agent_id`, `idx_page_events_type_created`

---

### `magic_links`
Passwordless auth tokens. One-time activation, then used as session bearer tokens.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| agent_id | UUID FK agents | |
| token | TEXT UNIQUE NOT NULL | Random UUID |
| expires_at | TIMESTAMPTZ | |
| used_at | TIMESTAMPTZ | Set when session first activated |
| revoked_at | TIMESTAMPTZ | Set by `revoke-session` for force-logout |
| created_at | TIMESTAMPTZ DEFAULT now() | |

**Auth flow:** Bearer token in Authorization header → lookup WHERE `used_at IS NOT NULL AND revoked_at IS NULL AND expires_at > now()`
**RLS:** No anon access. Service_role only.
**Indexes:** `idx_magic_links_token`, `idx_magic_links_active_token` (partial: revoked_at IS NULL), `idx_magic_links_agent_created`

---

### `mortgage_applications`
Buyer mortgage applications submitted via agent profile calculator.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| edit_token | TEXT UNIQUE | UUID for doc upload link (client-generated) |
| agent_id | UUID FK agents | |
| agent_slug | TEXT | Denormalised |
| buyer_name | TEXT | |
| buyer_phone | TEXT | |
| buyer_email | TEXT | |
| monthly_income | NUMERIC | |
| employment_type | TEXT CHECK | salaried, self_employed, business_owner |
| residency_status | TEXT CHECK | uae_national, uae_resident, non_resident |
| existing_debt_monthly | NUMERIC DEFAULT 0 | |
| property_value | NUMERIC | |
| property_id | UUID | |
| property_title | TEXT | |
| down_payment_pct | NUMERIC | |
| preferred_term_years | INTEGER | |
| preferred_rate_type | TEXT | |
| max_loan_amount | NUMERIC | |
| estimated_monthly | NUMERIC | |
| assigned_bank | TEXT | |
| source | TEXT DEFAULT 'profile_page' | |
| status | TEXT DEFAULT 'new' | |
| ip_hash | TEXT | |
| created_at | TIMESTAMPTZ DEFAULT now() | |

**RLS:** Anon INSERT (WITH CHECK true). Anon UPDATE explicitly blocked (USING false). Reads via service_role only.
**Indexes:** `idx_mortgage_applications_ip_time` (partial: ip_hash IS NOT NULL)

---

### `mortgage_rates`
Bank rate cards used by mortgage calculator UI.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| bank_name | TEXT | |
| rate_pct | NUMERIC | |
| is_active | BOOLEAN DEFAULT true | |
| created_at | TIMESTAMPTZ DEFAULT now() | |

**RLS:** Anon SELECT WHERE `is_active = true`
**Indexes:** `idx_mortgage_rates_active` (partial: is_active=true)

---

### `market_rates`
EIBOR and benchmark rates fetched by `fetch-eibor` cron function.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| rate_type | TEXT UNIQUE NOT NULL | e.g. 'EIBOR_3M' |
| rate_value | NUMERIC | |
| fetched_at | TIMESTAMPTZ | |
| source | TEXT | |
| created_at | TIMESTAMPTZ DEFAULT now() | |

**RLS:** Anon SELECT (own policy, see 20240501000000)

---

### `waitlist`
Pre-launch email capture.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| email | TEXT UNIQUE NOT NULL | Stored lowercase |
| created_at | TIMESTAMPTZ DEFAULT now() | |

**RLS:** Anon INSERT + anon SELECT (own policies)
**Indexes:** Unique on `lower(email)`

---

### `agencies`
Agency profiles. Agents can be grouped under an agency.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| slug | TEXT UNIQUE NOT NULL | |
| name | TEXT | |
| logo_url | TEXT | |
| website | TEXT | |
| description | TEXT | |
| owner_agent_id | UUID FK agents | |
| updated_at | TIMESTAMPTZ | Set by trigger |
| created_at | TIMESTAMPTZ DEFAULT now() | |

**RLS:** Service_role only (managed via `manage-agency`)

---

### `developers`
Off-plan developer profiles synced from REM API.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | TEXT | |
| logo_url | TEXT | |
| description | TEXT | |
| updated_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

**RLS:** Anon SELECT (own policy)

---

### `projects`
Off-plan project inventory synced from REM API.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| rem_id | TEXT UNIQUE | REM API identifier |
| slug | TEXT UNIQUE | |
| developer_id | UUID FK developers | |
| name | TEXT | |
| status | TEXT CHECK | off_plan, ready, under_construction |
| description | TEXT | |
| location | TEXT | |
| district_name | TEXT | |
| lat | NUMERIC(10,7) | |
| lng | NUMERIC(10,7) | |
| beds | INTEGER[] | |
| property_types | TEXT[] | GIN indexed |
| min_area_sqft | NUMERIC | |
| max_area_sqft | NUMERIC | |
| payment_plan_detail | TEXT | |
| gallery_images | TEXT[] | GIN indexed |
| floor_plan_urls | TEXT[] | |
| available_units | INTEGER | |
| facilities | TEXT[] | |
| nearby_locations | TEXT[] | |
| brochure_url | TEXT | |
| images_categorized | JSONB | |
| updated_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

**RLS:** Anon SELECT (own policy)
**Indexes:** `idx_projects_property_types` (GIN, partial: not null)

---

### `project_units`
Individual unit inventory within projects.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| rem_id | TEXT UNIQUE | |
| project_id | UUID FK projects | |
| unit_number | TEXT | |
| property_type | TEXT | |
| bedrooms | INTEGER | |
| bathrooms | INTEGER | |
| area_sqft | NUMERIC | |
| price | NUMERIC | |
| status | TEXT CHECK | available, reserved, sold |
| updated_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

**RLS:** Anon SELECT (own policy)

---

### `agent_projects`
Which agents are approved to promote which off-plan projects.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| agent_id | UUID FK agents | |
| project_id | UUID FK projects | |
| status | TEXT CHECK DEFAULT 'pending' | pending, approved, rejected |
| approved_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ DEFAULT now() | |
| UNIQUE | (agent_id, project_id) | |

**RLS:** Anon SELECT (own policy)

---

### `email_verification_codes`
6-digit OTPs for agent email verification during join flow. Expire in 10 minutes.

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL PK | |
| email | TEXT | Lowercase |
| code | TEXT | 6-digit string |
| broker_number | INTEGER | Optional, stored for later lookup |
| expires_at | TIMESTAMPTZ | now() + 10 min |
| verified | BOOLEAN DEFAULT false | |
| ip_address | TEXT | For IP-level rate limiting |
| created_at | TIMESTAMPTZ DEFAULT now() | |

**RLS:** No anon access. Written by `send-otp`, read by `create-agent` (service_role).
**Rate limits:** 5/email/hour, 15/IP/hour (enforced in edge function)
**Indexes:** `idx_evc_email_created`, `idx_evc_ip_created`, `idx_evc_email_code`

---

### `dld_brokers`
DLD broker registry snapshot. Loaded by admin sync job.

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL PK | |
| broker_number | INTEGER UNIQUE | DLD identifier |
| broker_name_en | TEXT | |
| broker_name_ar | TEXT | |
| real_estate_number | TEXT | Brokerage RERA ID |
| license_start_date | DATE | |
| license_end_date | DATE | License expiry |
| created_at | TIMESTAMPTZ DEFAULT now() | |

**RLS:** No anon access. Read by `verify-broker` (service_role).

---

### `referrals`
Agent-signup referral tracking. One row per agent who joined via referral link.

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL PK | |
| referrer_id | UUID FK agents | Agent who shared the link |
| referred_id | UUID FK agents | Agent who signed up |
| referral_code | TEXT | Code from the link |
| status | TEXT DEFAULT 'pending' | pending, verified, rewarded |
| created_at / updated_at | TIMESTAMPTZ | |
| UNIQUE | (referrer_id, referred_id) | |

**RLS:** No anon access. Written by `track-referral` (service_role).

---

### `lead_referrals`
Agent-to-agent lead passing. Agent A refers a lead to Agent B with agreed fee split.

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL PK | |
| referrer_id | UUID FK agents | Agent passing the lead |
| receiver_id | UUID FK agents | Agent receiving the lead |
| lead_name/phone/email | TEXT | Lead contact details |
| lead_budget_range / property_type / preferred_area / notes | TEXT | |
| referral_fee_percent | NUMERIC DEFAULT 25 | 5–50 range |
| platform_fee_percent | NUMERIC DEFAULT 10 | Platform cut |
| status | TEXT DEFAULT 'pending' | pending → accepted/declined → in_progress/close_won/close_lost |
| accepted_at / declined_at / closed_at / updated_at | TIMESTAMPTZ | |
| deal_value_aed / commission_aed / referral_fee_aed / platform_fee_aed | NUMERIC | Populated on close_won |

**RLS:** No anon access. Written by `refer-lead`, managed by `manage-referral` (service_role).

---

### `co_broke_deals`
Co-brokerage deal records. Buying agent brings buyer to listing agent's property.

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL PK | |
| property_id | UUID FK properties | |
| listing_agent_id | UUID FK agents | |
| buying_agent_id | UUID FK agents | |
| listing_agent_split / buying_agent_split | INTEGER | Percentage split |
| platform_fee_percent | INTEGER DEFAULT 5 | |
| status | TEXT DEFAULT 'requested' | requested → accepted/declined, accepted → viewing/close_won/close_lost |
| buyer_name / buyer_phone / buyer_email / buyer_notes | TEXT | Revealed to listing agent after acceptance |
| accepted_at / declined_at / closed_at / updated_at | TIMESTAMPTZ | |
| deal_value_aed / total_commission_aed / listing_agent_commission_aed / buying_agent_commission_aed / platform_fee_aed | NUMERIC | |

**RLS:** No anon access. Written by `cobroke-request`, managed by `manage-cobroke` (service_role).

---

### `buyer_requests`
Premium-gated buyer criteria. Agent posts what their buyer is looking for.

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL PK | |
| agent_id | UUID FK agents | Premium-tier only |
| property_type / bedrooms_min / bedrooms_max / budget_min / budget_max | TEXT/INTEGER/NUMERIC | Search criteria |
| preferred_areas | TEXT[] | |
| additional_notes | TEXT | |
| buyer_name / buyer_phone / buyer_nationality / buyer_timeline | TEXT | Private PII |
| status | TEXT DEFAULT 'active' | active → matched |
| matches_found / last_matched_at | INTEGER / TIMESTAMPTZ | Populated by matching engine |

**RLS:** No anon access. Written by `post-buyer-request` (service_role).
**Constraints:** Max 5 active per agent (enforced in edge function).

---

### `property_matches`
Matching engine output. Links buyer requests to matching listings.
No buyer PII — listing agents see only match metadata.

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL PK | |
| buyer_request_id | BIGINT FK buyer_requests | |
| property_id | UUID FK properties | |
| buying_agent_id | UUID FK agents | |
| listing_agent_id | UUID FK agents | |
| match_score | INTEGER | 0–100 |
| status | TEXT DEFAULT 'notified' | |
| UNIQUE | (buyer_request_id, property_id) | |

**RLS:** No anon access. Written by `post-buyer-request`, read by `respond-to-match` (service_role).

---

### `featured_projects`
Off-plan projects curated for the lead marketplace.

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL PK | |
| project_slug | TEXT UNIQUE | |
| project_name | TEXT | |
| developer_name | TEXT | |
| commission_percent | NUMERIC | |
| platform_fee_per_lead | NUMERIC DEFAULT 0 | |
| status | TEXT DEFAULT 'active' | active, inactive |

**RLS:** No anon access. Read by `capture-project-lead` (service_role).

---

### `project_agent_assignments`
Which agents are assigned to promote featured projects.

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL PK | |
| project_id | BIGINT FK featured_projects | |
| agent_id | UUID FK agents | |
| leads_generated | INTEGER DEFAULT 0 | Incremented on each captured lead |
| UNIQUE | (project_id, agent_id) | |

**RLS:** No anon access. Service_role only via `capture-project-lead`.

---

### `project_leads`
Leads captured via agent-promoted featured project pages.

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL PK | |
| project_id | BIGINT FK featured_projects | |
| agent_id | UUID FK agents | |
| name | TEXT | |
| phone / email | TEXT | |
| budget_range / preferred_bedrooms / message / nationality | TEXT | |
| source | TEXT DEFAULT 'agent_profile' | |
| utm_source / utm_medium / utm_campaign / device_type | TEXT | |
| platform_fee_earned | NUMERIC DEFAULT 0 | |
| ip_hash | TEXT | Added by 20241101000000_rate_limiting.sql |

**RLS:** No anon access. Written by `capture-project-lead` (service_role).

---

## RLS Summary

| Table | Anon SELECT | Anon INSERT | Anon UPDATE | Notes |
|-------|------------|------------|------------|-------|
| agents | ✅ verified+active only | ❌ | ❌ | |
| properties | ✅ active from verified agents | ❌ | ❌ | |
| mortgage_rates | ✅ active only | ❌ | ❌ | |
| mortgage_applications | ❌ | ✅ | ❌ (blocked) | UPDATE USING(false) |
| market_rates | ✅ | ❌ | ❌ | |
| waitlist | ❌ | ✅ | ❌ | SELECT also allowed for own row |
| developers | ✅ | ❌ | ❌ | |
| projects | ✅ | ❌ | ❌ | |
| project_units | ✅ | ❌ | ❌ | |
| agent_projects | ✅ | ❌ | ❌ | |
| leads | ❌ | ❌ | ❌ | service_role only |
| magic_links | ❌ | ❌ | ❌ | service_role only |
| events | ❌ | ❌ | ❌ | service_role only |
| page_events | ❌ | ❌ | ❌ | service_role only |
| agencies | ❌ | ❌ | ❌ | service_role only |
| email_verification_codes | ❌ | ❌ | ❌ | service_role only |
| dld_brokers | ❌ | ❌ | ❌ | service_role only |
| referrals | ❌ | ❌ | ❌ | service_role only |
| lead_referrals | ❌ | ❌ | ❌ | service_role only |
| co_broke_deals | ❌ | ❌ | ❌ | service_role only |
| buyer_requests | ❌ | ❌ | ❌ | service_role only |
| property_matches | ❌ | ❌ | ❌ | service_role only |
| featured_projects | ❌ | ❌ | ❌ | service_role only |
| project_agent_assignments | ❌ | ❌ | ❌ | service_role only |
| project_leads | ❌ | ❌ | ❌ | service_role only |

---

## Functions / RPCs

| Function | Signature | Purpose |
|----------|-----------|---------|
| `set_updated_at()` | `() RETURNS TRIGGER` | Generic `updated_at = now()` trigger. Used by agencies, developers, projects, project_units, agents. |
| `increment_bonus_listings()` | `(agent_uuid UUID) RETURNS VOID` | Increments `agents.bonus_listings` by 1. Called by `manage-cobroke` (both agents on close_won) and `manage-referral` (referrer on close_won). SECURITY DEFINER. |

## Schema Diff — Production vs Reconstructed Migrations (2026-04-06)

A `supabase db pull` diff revealed 8 tables present in production that were missing from the Phase 3 reconstruction. All have been added via migrations `20260900000000_analytics_tables.sql` and `20260901000000_billing_and_units.sql`.

### Tables added

| Table | Migration | Purpose |
|-------|-----------|---------|
| `developers` | analytics_tables | Developer profiles for off-plan projects |
| `page_views` | analytics_tables | Agent page view analytics (UTM, device, geo) |
| `link_clicks` | analytics_tables | Agent link click tracking (WhatsApp, email, etc.) |
| `email_signups` | analytics_tables | Email signups from agent pages |
| `dld_projects` | billing_and_units | DLD project registry (synced by sync-rem-offplan) |
| `dld_transactions` | billing_and_units | DLD transaction records per agent |
| `subscription_events` | billing_and_units | Stripe billing event log |
| `project_units` | billing_and_units | Individual off-plan project units |

### Migration history note

The production database's `supabase_migrations` table contains 35 real migration files (timestamps 20260323–20260401) that predate the Phase 3 reconstruction. Our local `supabase/migrations/` directory contains 23 files with reconstructed timestamps (20240101–20260901). The histories diverge — run `supabase migration repair` commands documented in `.planning/STATE.md` to reconcile if needed.
