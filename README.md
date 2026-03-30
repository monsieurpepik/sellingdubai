# SellingDubai

Verified profile platform for RERA-licensed real estate agents in Dubai.

## Stack

- **Frontend**: Vanilla HTML/CSS/JS, built with esbuild (code splitting)
- **Backend**: Supabase (Postgres + Edge Functions in Deno)
- **Hosting**: Netlify (static + edge functions via `netlify/`)
- **Email**: Resend
- **Error tracking**: Sentry
- **Payments**: Stripe (gated behind `BILLING_LIVE` flag in `pricing.html`)

## Local Setup

1. Copy env vars: `cp .env.example .env`
2. Fill in all required values (see `.env.example`)
3. Install dependencies: `npm install`
4. Build JS bundles: `npm run build`
5. Serve locally: any static server (e.g. `npx serve .`)

No local Supabase emulator is configured. Edge functions connect to the production Supabase project.

## Environment Variables

All required variables are documented in `.env.example`. Key ones:

| Variable | Used by |
|---|---|
| `SUPABASE_URL` | All edge functions |
| `SUPABASE_SERVICE_ROLE_KEY` | All edge functions |
| `RESEND_API_KEY` | capture-lead, send-magic-link, lead-followup-nagger |
| `ANTHROPIC_API_KEY` | whatsapp-ingest (AI property descriptions) |
| `CRON_SECRET` | weekly-stats, notify-mortgage-lead (CRON_SECRET auth guard) |
| `RATE_LIMIT_SALT` | capture-lead-v4, capture-project-lead, submit-mortgage |
| `EXPORT_TOKEN` | export-leads (magic link token store) |
| `PLATFORM_OPS_EMAIL` | notify-mortgage-lead (ops notification recipient) |
| `STRIPE_SECRET_KEY` | create-checkout, create-portal-session, stripe-webhook |
| `STRIPE_WEBHOOK_SECRET` | stripe-webhook (signature verification) |

Set all env vars in Supabase project settings (for edge functions) and in Netlify site settings (for build/runtime).

## Deploy

1. Push to `main` — Netlify auto-deploys
2. Edge functions are deployed separately via Supabase CLI:
   ```
   supabase functions deploy <function-name> --project-ref <ref>
   ```
3. Run `npm run build` before deploy and verify:
   - `dist/init.bundle.js` stays under 30KB
   - No chunks in `dist/chunks/` exceed 20KB (except `project-detail` at ~20.3KB — see DECISIONS.md)

## Billing Gate

`BILLING_LIVE` in `pricing.html` is `false` by default. Set to `true` only after confirming Stripe price IDs in production env vars and running end-to-end checkout tests.

## Test Credentials

- **BRN verify bypass** (join flow): prefix BRN with `TEST-` in test mode (see `join.html` test mode logic)
- **OTP bypass** (join flow): use OTP `000000` in test mode
- Test mode is only active on non-production hostnames

## REM Sync

`sync-rem-offplan` is a Supabase edge function that syncs off-plan inventory from the REM API. See `DECISIONS.md` for the pg_cron setup to schedule it daily at 03:00 UTC.
