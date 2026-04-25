# Billing Activation + CI/CD Pipeline Design

## Goal

Activate Stripe billing and establish an automated CI/CD pipeline so that (a) revenue flows without manual intervention and (b) every production deploy is gated by a passing build + test run.

## Architecture

Two independent subsystems implemented in sequence: billing first (revenue), then CI/CD (operational maturity). Each is independently deployable and does not depend on the other.

---

## Part 1: Billing Activation

### Feature Flag

`BILLING_LIVE` moves from a hardcoded `false` in `js/pricing.js` to a build-time define injected by esbuild via `scripts/build-js.js`.

- `scripts/build-js.js` adds `define: { __BILLING_LIVE__: process.env.BILLING_LIVE === 'true' ? 'true' : 'false' }` to the esbuild options.
- `js/pricing.js` line 228 changes from `const BILLING_LIVE = false` to `const BILLING_LIVE = __BILLING_LIVE__`.
- Netlify environment variable `BILLING_LIVE=true` activates billing on next deploy. No code change required.

### Stripe Secrets (Supabase)

Set via `supabase secrets set` before deploying the flag change:

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
STRIPE_PRICE_PREMIUM_MONTHLY=price_...
STRIPE_PRICE_PREMIUM_YEARLY=price_...
```

The `create-checkout` and `stripe-webhook` edge functions already read these env vars — no code changes needed.

### Stripe Webhook Endpoint

Register in Stripe Dashboard → Developers → Webhooks:

- **URL:** `https://pjyorgedaxevxophpfib.supabase.co/functions/v1/stripe-webhook`
- **Events:** `customer.subscription.updated`, `customer.subscription.deleted`, `checkout.session.completed`

The webhook handler already implements HMAC-SHA256 signature verification with constant-time comparison and a 5-minute timestamp window. Idempotent — safe to receive duplicate events.

### Pricing Page Noindex

`pricing.html` has `<meta name="robots" content="noindex, nofollow">`. Remove this tag when `BILLING_LIVE=true` is set, so the pricing page gets indexed once billing is live.

### Success Criteria

- Clicking "Get Pro" on pricing.html redirects to Stripe Checkout
- Completing checkout updates `agents.tier` and `agents.stripe_subscription_status` in Supabase
- Cancelling in Stripe downgrades the agent tier via webhook
- `pricing.html` is indexable by search engines

---

## Part 2: CI/CD Pipeline

### Workflow File

`.github/workflows/ci.yml` — two jobs.

### Job 1: `ci`

Runs on: every push to `main`, every pull request.

Steps:
1. `actions/checkout@v4`
2. `actions/setup-node@v4` with Node 20, npm cache enabled
3. `npm ci`
4. `npm run check` — existing pre-deploy gate (build + chunk sizes + routing + field consistency checks)
5. `deno test` for edge functions with `--allow-env --allow-net` flags covering `capture-lead-v4` and `send-magic-link`

Build-time env vars injected from GitHub secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `BILLING_LIVE`.

### Job 2: `deploy`

Runs on: push to `main` only. Depends on `ci` job passing (`needs: ci`).

Steps:
1. `actions/checkout@v4`
2. `actions/setup-node@v4` with Node 20, npm cache enabled
3. `npm ci`
4. `npm run build` (esbuild — produces `dist/`)
5. `netlify deploy --prod --auth=$NETLIFY_AUTH_TOKEN --site=$NETLIFY_SITE_ID`

Build-time env vars same as `ci` job.

### GitHub Secrets Required (one-time setup)

| Secret | Where to find it |
|---|---|
| `NETLIFY_AUTH_TOKEN` | Netlify → User Settings → Personal access tokens |
| `NETLIFY_SITE_ID` | Netlify → Site → Site configuration → Site ID |
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon public key |
| `BILLING_LIVE` | `false` initially; change to `true` in GitHub + Netlify when billing opens |

### Branch Protection

Enable in GitHub → Settings → Branches → Add rule for `main`:
- "Require status checks to pass before merging"
- Select the `ci` job as the required check

This makes it physically impossible for a failing build to reach production.

### Success Criteria

- Every push to `main` triggers the Actions workflow
- A broken build fails the `ci` job and the `deploy` job does not run
- A green `ci` job auto-deploys to `https://sellingdubai.com`
- Every production deploy at Netlify links back to a specific GitHub commit with a green check

---

## Files Changed

| File | Change |
|---|---|
| `.github/workflows/ci.yml` | Create — CI + deploy workflow |
| `scripts/build-js.js` | Add `__BILLING_LIVE__` define from `process.env.BILLING_LIVE` |
| `js/pricing.js` | Replace `const BILLING_LIVE = false` with `const BILLING_LIVE = __BILLING_LIVE__` |
| `pricing.html` | Remove `noindex` meta tag |

Supabase secrets and GitHub secrets are set via CLI/dashboard — no files changed.

## What Is Not In Scope

- TypeScript migration of frontend JS
- Playwright E2E tests (separate initiative)
- Lighthouse performance improvements (separate initiative)
- Preview deploy environments for PRs (can add later via Netlify GitHub integration)
