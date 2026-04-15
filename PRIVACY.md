# Privacy Reference — SellingDubai

Quick reference for developers. Full policy: https://sellingdubai.ae/privacy

## Data Collected

| Category | Fields | Stored In |
|----------|--------|-----------|
| Agent profile | name, email, whatsapp, broker_number, photo_url, social URLs | `agents` table |
| Lead contact | name, email, phone, budget_range, property_type | `leads` table |
| Auth | OTP codes (10-min TTL), magic link tokens (7-day TTL) | `email_verification_codes`, `magic_links` |
| Property listings | title, price, images, location, description | `properties` table |
| Billing | Stripe customer_id, subscription_status (no card data stored) | `agents` table |
| WhatsApp sessions | conversation turns (AI secretary context) | `whatsapp_sessions` |

## Sub-processors

| Service | Purpose | Privacy Policy |
|---------|---------|----------------|
| Supabase | Database, auth, storage | https://supabase.com/privacy |
| Netlify | Hosting, CDN, image transforms | https://www.netlify.com/privacy/ |
| Resend | Transactional email | https://resend.com/privacy |
| Stripe | Payment processing | https://stripe.com/privacy |
| Meta (WhatsApp Business API) | Agent notifications, onboarding | https://www.whatsapp.com/legal/privacy-policy |
| Anthropic | AI secretary responses | https://www.anthropic.com/privacy |
| Sentry | Error monitoring | https://sentry.io/privacy/ |

## Retention

- Leads: retained indefinitely (agents manage their own CRM)
- Magic link tokens: expire after 7 days; can be revoked via `revoked_at`
- OTP codes: 10-minute TTL, marked `verified=true` on use
- WhatsApp sessions: cleared on onboarding completion; persist until agent deletes or session expires
- Stripe webhooks: audited in `subscription_events` table

## Data Deletion

Agents may request full data deletion at privacy@sellingdubai.ae. This triggers deletion of `agents`, `leads`, `properties`, `magic_links`, and storage objects under `agent-images/{agent_id}/`.

## DPA

Business customers can request a Data Processing Agreement: privacy@sellingdubai.ae
