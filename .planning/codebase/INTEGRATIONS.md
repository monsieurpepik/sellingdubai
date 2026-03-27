# External Integrations

**Analysis Date:** 2026-03-27

## APIs & External Services

**Database & Backend:**
- Supabase — PostgreSQL database, file storage, and edge function runtime
  - SDK/Client: `@supabase/supabase-js@2` (CDN in browser; `esm.sh` in Deno)
  - Auth: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (edge functions), `SUPABASE_ANON_KEY` (browser client — public key, safe to expose)
  - Direct REST API also used in `netlify/edge-functions/og-injector.ts` for bot/SSR requests

**Email:**
- Resend — transactional email for lead notifications and magic-link auth emails
  - SDK/Client: Direct REST API (`https://api.resend.com/emails`)
  - Auth: `RESEND_API_KEY`
  - Sender identity: `RESEND_FROM` (default: `SellingDubai <leads@sellingdubai.ae>`)
  - Used by: `edge-functions/capture-lead-v4/`, `edge-functions/send-magic-link/`, `edge-functions/lead-followup-nagger/`

**AI Content Generation:**
- Anthropic Claude API — generates professional property descriptions and social media captions from WhatsApp messages
  - SDK/Client: Direct REST API (`https://api.anthropic.com/v1/messages`)
  - Model: `claude-sonnet-4-20250514`
  - Auth: `ANTHROPIC_API_KEY`
  - Used by: `edge-functions/whatsapp-ingest/`

**Messaging:**
- WhatsApp Business API (Meta Graph API v18.0) — agents send photos via WhatsApp to create property listings
  - SDK/Client: Direct REST API (`https://graph.facebook.com/v18.0/{PHONE_ID}/messages`)
  - Auth: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`
  - Webhook verify token: `WH_VERIFY_TOKEN`
  - Used by: `edge-functions/whatsapp-ingest/` (webhook receiver + reply sender)

**Advertising & Tracking:**
- Facebook Conversions API (Meta Graph API v21.0) — server-side Lead event reporting per agent
  - SDK/Client: Direct REST API (`https://graph.facebook.com/v21.0/{pixel_id}/events`)
  - Auth: Per-agent `facebook_capi_token` stored in `agents` table
  - PII hashed with SHA-256 before sending (email, phone, name, country)
  - Used by: `edge-functions/capture-lead-v4/`
- Google Analytics GA4 — per-agent measurement tracking
  - Integration: Client-side tag injection via agent's `ga4_measurement_id` field
  - Auth: None (public measurement ID)
- Facebook Pixel — client-side pixel per agent
  - Integration: Per-agent `facebook_pixel_id` field used in browser-side scripts

**Social OAuth:**
- Instagram OAuth (Meta) — agents connect their Instagram Business account for follower count display
  - SDK/Client: Direct OAuth (`https://www.instagram.com/oauth/authorize`), token exchange via Graph API v22.0
  - Auth: `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`
  - Redirect URI: `https://agents.sellingdubai.ae/edit?ig_callback=1`
  - Scope: `instagram_business_basic`
  - Used by: `edge-functions/instagram-auth/`
- TikTok OAuth — agents connect TikTok account
  - SDK/Client: Direct OAuth (`https://www.tiktok.com/v2/auth/authorize/`), token exchange at `https://open.tiktokapis.com/v2/oauth/token/`
  - Auth: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`
  - Redirect URI: `https://agents.sellingdubai.ae/edit?tt_callback=1`
  - Used by: `edge-functions/tiktok-auth/`

**Error Monitoring:**
- Sentry — frontend error tracking
  - CDN: `https://browser.sentry-cdn.com/10.45.0/bundle.min.js` (loaded inline in `index.html`)
  - DSN: Hardcoded in `index.html` (`o4511110584926208.ingest.us.sentry.io`)
  - Traces sample rate: 0.2; PII disabled (`sendDefaultPii: false`)
  - Also supported via `error-tracking.js` (DSN blank — fallback console logger used)

**Fonts:**
- Google Fonts — Manrope and Inter typefaces
  - URLs: `https://fonts.googleapis.com`, `https://fonts.gstatic.com`
  - Cached by service worker (`sw.js`)

**3rd Party Embeds:**
- Google Maps — `frame-src` allowlist in CSP includes `maps.google.com` and `www.google.com`
- Calendly — `calendly_url` agent field used for consultation booking button

## Data Storage

**Databases:**
- Supabase PostgreSQL
  - Connection: `SUPABASE_URL` (project ref: `pjyorgedaxevxophpfib`)
  - Client: `@supabase/supabase-js@2` with anon key (browser) or service role key (edge functions)
  - Tables: `agents`, `properties`, `leads`, `magic_links`, `page_events` (also `events`), `mortgage_rates`, `mortgage_applications`
  - RLS: Enabled on all tables (`sql/rls_policies.sql`); anon key can only read verified agents and active properties; leads/magic_links/events have no anon access

**File Storage:**
- Supabase Storage — `agent-images` bucket stores uploaded property photos
  - Upload path pattern: `{agent_slug}/property-{timestamp}.{ext}`
  - Used by: `edge-functions/whatsapp-ingest/` (downloads from WhatsApp, re-uploads to Supabase)

**Caching:**
- Browser Cache API (service worker) — static assets cached at `sd-v21`
- Netlify CDN — hashed bundles (`dist/chunks/*`) served with 1-year immutable cache; HTML served with `no-cache`

## Authentication & Identity

**Auth Provider:**
- Custom magic-link system (no Supabase Auth used)
  - Implementation: Agent requests magic link via email → `edge-functions/send-magic-link/` generates 32-byte random token stored in `magic_links` table → agent clicks link → `edge-functions/verify-magic-link/` validates token and returns agent data → token marked `used_at` (remains valid for 15-min session window)
  - Rate limits: 3 links per agent per 15 min; 30 globally per 15 min
  - Token expiry: 15 minutes

## Monitoring & Observability

**Error Tracking:**
- Sentry (production) — DSN active in `index.html`; `error-tracking.js` provides fallback console logging with optional Sentry lazy-load

**Analytics:**
- Custom page events via `edge-functions/log-event` — tracks views, WhatsApp taps, phone taps, lead submissions
  - Frontend: `js/analytics.js` calls `LOG_EVENT_URL` (Supabase edge function)
  - Data stored in `page_events` table in Supabase

**Logs:**
- `console.error` throughout edge functions; Supabase dashboard provides function invocation logs

## CI/CD & Deployment

**Hosting:**
- Netlify (static site + edge functions)
  - Publish dir: `.` (root)
  - Build command: `npm install && npm run build`
  - Edge function: `netlify/edge-functions/og-injector.ts` — OG tag injection + bot/SSR prerendering on `/a/*` routes

**Supabase Edge Functions:**
- Deployed to Supabase Functions runtime (Deno)
- Functions: `capture-lead-v4`, `send-magic-link`, `verify-magic-link`, `update-agent`, `whatsapp-ingest`, `instagram-auth`, `tiktok-auth`, `lead-followup-nagger`
- Referenced but not in repo: `log-event`, `prerender`, `capture-errors`

**CI Pipeline:**
- Not detected (no GitHub Actions or CI config found)

## Environment Configuration

**Required env vars (all consumed by Supabase edge functions):**
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key for bypassing RLS in edge functions
- `RESEND_API_KEY` — Resend transactional email
- `RESEND_FROM` — Sender address (default: `SellingDubai <leads@sellingdubai.ae>`)
- `WHATSAPP_ACCESS_TOKEN` — Meta WhatsApp Business API token
- `WHATSAPP_PHONE_NUMBER_ID` — WhatsApp Business phone number ID
- `WH_VERIFY_TOKEN` — Webhook verification token for WhatsApp
- `ANTHROPIC_API_KEY` — Claude AI API key
- `INSTAGRAM_APP_ID` — Instagram OAuth app ID
- `INSTAGRAM_APP_SECRET` — Instagram OAuth app secret
- `TIKTOK_CLIENT_KEY` — TikTok OAuth client key
- `TIKTOK_CLIENT_SECRET` — TikTok OAuth client secret
- `RATE_LIMIT_SALT` — Salt for IP hash rate limiting (default: `sd-salt-2026`)
- `CRON_SECRET` — Auth secret for `lead-followup-nagger` cron endpoint

**Secrets location:**
- `.env.example` at repo root documents all required vars
- Actual secrets managed in Supabase project dashboard (Functions → Secrets)
- No `.env` file committed

## Webhooks & Callbacks

**Incoming:**
- `edge-functions/whatsapp-ingest/` — receives WhatsApp Business webhook events (GET for verification, POST for messages) from Meta
- `edge-functions/instagram-auth/` — handles Instagram OAuth callback code exchange
- `edge-functions/tiktok-auth/` — handles TikTok OAuth callback code exchange
- Per-agent `webhook_url` — outgoing CRM webhook fired on new leads (configured by agent in dashboard)

**Outgoing:**
- Per-agent CRM webhook — `POST` to agent's configured `webhook_url` on new lead, with `event: "lead.created"` payload
- Facebook Conversions API — server-side `Lead` event posted per lead capture
- WhatsApp Business API — reply messages sent to agents after property listing creation

**Scheduled:**
- `edge-functions/lead-followup-nagger/` — designed to be triggered every 15 minutes via cron (Supabase `pg_cron` or external `cron-job.org`); finds unresponded leads >30 min old and sends reminder emails via Resend

---

*Integration audit: 2026-03-27*
