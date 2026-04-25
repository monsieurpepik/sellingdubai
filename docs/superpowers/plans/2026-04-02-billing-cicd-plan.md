# Billing Activation + CI/CD Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate Stripe billing via a build-time `BILLING_LIVE` flag and establish a GitHub Actions CI/CD pipeline that gates every production deploy behind a passing build + test run.

**Architecture:** Two independent subsystems. Task 1–2 implement billing activation (BILLING_LIVE injection + noindex removal). Task 3 implements CI/CD. Task 4 provides the one-time ops steps for Stripe secrets and webhook — no code changes. Each task is independently deployable.

**Tech Stack:** Node.js (build script), GitHub Actions, Netlify CLI, Deno (edge function tests), Playwright (E2E tests), Stripe Dashboard.

---

## Important: Spec Correction

The design spec says `js/pricing.js` — **that file does not exist**. `BILLING_LIVE` lives at line 228 of `pricing.html` inside an inline `<script>` tag. Netlify serves `pricing.html` directly from the project root (`publish = "."` in `netlify.toml`). The esbuild `--define` mechanism only injects into JS modules bundled by esbuild, not into HTML inline scripts.

**Solution used in Tasks 1–2:** `scripts/build-js.js` (which already uses `require('fs')`) does a Node.js string replacement on `pricing.html` after the esbuild build completes. When `process.env.BILLING_LIVE !== 'true'` (default), the replacement is `false → false` — a no-op. When `BILLING_LIVE=true`, it patches `false → true` in place. In Netlify CI, the working directory is a fresh clone on every deploy, so the in-place write is safe.

---

## Files Changed

| File | Change |
|---|---|
| `scripts/build-js.js` | Append BILLING_LIVE patch step after esbuild call |
| `pricing.html` | Remove noindex meta tag (line 8) — one-time source edit |
| `tests/e2e/journey5-billing.spec.js` | Update test 1: assert noindex is **absent**, not present |
| `.github/workflows/ci.yml` | Create — CI + deploy workflow |

Stripe secrets and GitHub Actions secrets are set via CLI/dashboard — no files changed (Task 4).

---

## Task 1: BILLING_LIVE Build-Time Injection

**Files:**
- Modify: `scripts/build-js.js`

The esbuild call is already inside `scripts/build-js.js`. We append a synchronous post-build step that reads `pricing.html`, replaces the `BILLING_LIVE` literal, and writes the file back.

- [ ] **Step 1: Verify the replacement target exists**

Run:
```bash
grep -n "BILLING_LIVE" pricing.html
```

Expected: line 228: `    const BILLING_LIVE = false;`

- [ ] **Step 2: Add the patch step to `scripts/build-js.js`**

Open `scripts/build-js.js`. After the closing `.catch(() => process.exit(1));` line, append:

```js
// Patch pricing.html BILLING_LIVE flag from build-time env var.
// pricing.html is served directly from root (publish = ".") and is not
// processed by esbuild, so we do a string replacement here instead.
// Safe to run in-place: Netlify CI starts from a fresh clone each deploy.
// Locally, BILLING_LIVE defaults to false so this is a no-op.
const billingLive = process.env.BILLING_LIVE === 'true';
const pricingPath = 'pricing.html';
const pricingHtml = fs.readFileSync(pricingPath, 'utf8');
const pricingPatched = pricingHtml.replace(
  'const BILLING_LIVE = false;',
  `const BILLING_LIVE = ${billingLive};`
);
if (pricingPatched === pricingHtml && billingLive) {
  console.error('build-js: BILLING_LIVE patch failed — target string not found in pricing.html');
  process.exit(1);
}
fs.writeFileSync(pricingPath, pricingPatched, 'utf8');
console.log(`build-js: pricing.html BILLING_LIVE patched to ${billingLive}`);
```

- [ ] **Step 3: Verify patch does nothing when BILLING_LIVE is unset (default)**

Run:
```bash
node scripts/build-js.js
grep "BILLING_LIVE" pricing.html
```

Expected output includes: `const BILLING_LIVE = false;` (unchanged)

- [ ] **Step 4: Verify patch applies when BILLING_LIVE=true**

Run:
```bash
BILLING_LIVE=true node scripts/build-js.js
grep "BILLING_LIVE" pricing.html
```

Expected output includes: `const BILLING_LIVE = true;`

Then reset:
```bash
git checkout pricing.html
```

- [ ] **Step 5: Confirm build output log line**

Run:
```bash
node scripts/build-js.js 2>&1 | grep "BILLING_LIVE"
```

Expected: `build-js: pricing.html BILLING_LIVE patched to false`

- [ ] **Step 6: Commit**

```bash
git add scripts/build-js.js
git commit -m "feat: inject BILLING_LIVE into pricing.html at build time

BILLING_LIVE defaults to false. Set BILLING_LIVE=true in Netlify
environment variables to activate billing on next deploy."
```

---

## Task 2: Remove Noindex + Update Billing Test

**Files:**
- Modify: `pricing.html` (remove line 8 — the noindex meta tag)
- Modify: `tests/e2e/journey5-billing.spec.js` (flip test 1 assertion)

The noindex tag was intentional while billing was inactive (documented in DECISIONS.md). Removing it is a one-time source edit — the build-time patch in Task 1 does not manage this tag.

- [ ] **Step 1: Run the existing test to confirm it passes (noindex currently present)**

Run:
```bash
npx playwright test tests/e2e/journey5-billing.spec.js --reporter=line 2>&1 | head -30
```

Expected: 3 tests pass including `Pricing page has noindex meta tag`.

- [ ] **Step 2: Remove the noindex meta tag from `pricing.html`**

Remove line 8:
```html
  <meta name="robots" content="noindex, nofollow">
```

The line to remove is exactly:
```
  <meta name="robots" content="noindex, nofollow">
```

After removal, line 8 should be the canonical link tag.

- [ ] **Step 3: Update the billing test to assert noindex is absent**

In `tests/e2e/journey5-billing.spec.js`, replace the entire first test:

**Before:**
```js
test('Pricing page has noindex meta tag', async ({ page }) => {
  await page.goto('/pricing.html');
  const robots = await page.locator('meta[name="robots"]').getAttribute('content');
  expect(robots).toContain('noindex');
});
```

**After:**
```js
test('Pricing page does not have noindex meta tag', async ({ page }) => {
  await page.goto('/pricing.html');
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});
```

- [ ] **Step 4: Run the updated test to confirm it passes**

Run:
```bash
npx playwright test tests/e2e/journey5-billing.spec.js --reporter=line 2>&1 | head -30
```

Expected: 3 tests pass with the new test name.

- [ ] **Step 5: Commit**

```bash
git add pricing.html tests/e2e/journey5-billing.spec.js
git commit -m "feat: remove noindex from pricing.html — billing now open

Pricing page was intentionally noindexed while BILLING_LIVE=false.
Billing is now activatable via env var, so remove the gate.
Update E2E test to assert noindex is absent."
```

---

## Task 3: GitHub Actions CI/CD Workflow

**Files:**
- Create: `.github/workflows/ci.yml`

Two jobs. `ci` runs on every push and PR — it runs `npm run check` (the existing pre-deploy gate) plus Deno tests for edge functions. `deploy` runs only on push to `main`, depends on `ci` passing, and deploys to Netlify.

The Deno test files are at:
- `edge-functions/capture-lead-v4/index.test.ts`
- `edge-functions/send-magic-link/index.test.ts`

- [ ] **Step 1: Create the `.github/workflows/` directory**

Run:
```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Create `.github/workflows/ci.yml`**

```yaml
name: CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    name: Build & Test
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Pre-deploy check (build + chunk sizes + routing + field consistency)
        run: npm run check
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
          BILLING_LIVE: ${{ secrets.BILLING_LIVE }}

      - name: Setup Deno
        uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x

      - name: Run edge function tests
        run: |
          deno test --allow-env --allow-net \
            edge-functions/capture-lead-v4/index.test.ts \
            edge-functions/send-magic-link/index.test.ts
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}

  deploy:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: ci
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
          BILLING_LIVE: ${{ secrets.BILLING_LIVE }}

      - name: Deploy to Netlify
        run: |
          npx netlify-cli deploy \
            --prod \
            --auth=${{ secrets.NETLIFY_AUTH_TOKEN }} \
            --site=${{ secrets.NETLIFY_SITE_ID }}
```

- [ ] **Step 3: Verify the YAML is valid**

Run:
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "YAML valid"
```

Expected: `YAML valid`

- [ ] **Step 4: Install netlify-cli as a dev dependency so `npx netlify-cli` resolves from lockfile**

Run:
```bash
npm install --save-dev netlify-cli
```

Verify:
```bash
grep '"netlify-cli"' package.json
```

Expected: version entry present.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml package.json package-lock.json
git commit -m "feat: add GitHub Actions CI/CD pipeline

ci job: npm run check + deno tests on every push/PR.
deploy job: auto-deploys to Netlify on green ci, main only.
Requires GitHub secrets: NETLIFY_AUTH_TOKEN, NETLIFY_SITE_ID,
SUPABASE_URL, SUPABASE_ANON_KEY, BILLING_LIVE."
```

---

## Task 4: One-Time Ops Setup (No Code Changes)

This task contains the CLI commands and dashboard steps to activate Stripe billing. No files are committed. Do these BEFORE setting `BILLING_LIVE=true` in GitHub/Netlify.

### 4a: Set Stripe secrets in Supabase

Run these commands with your actual Stripe live keys. The `create-checkout` and `stripe-webhook` edge functions already read these env vars — no code changes needed.

```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_live_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  STRIPE_PRICE_PRO_MONTHLY=price_... \
  STRIPE_PRICE_PRO_YEARLY=price_... \
  STRIPE_PRICE_PREMIUM_MONTHLY=price_... \
  STRIPE_PRICE_PREMIUM_YEARLY=price_...
```

Verify the secrets are set:
```bash
supabase secrets list | grep STRIPE
```

Expected: 6 STRIPE_* entries listed.

### 4b: Register the Stripe webhook endpoint

In Stripe Dashboard → Developers → Webhooks → Add endpoint:

- **URL:** `https://pjyorgedaxevxophpfib.supabase.co/functions/v1/stripe-webhook`
- **Events to listen for:**
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `checkout.session.completed`

Copy the webhook signing secret (`whsec_...`) and use it as `STRIPE_WEBHOOK_SECRET` in step 4a above.

### 4c: Set GitHub Actions secrets

In GitHub → repository Settings → Secrets and variables → Actions → New repository secret:

| Secret name | Where to find it |
|---|---|
| `NETLIFY_AUTH_TOKEN` | Netlify → User Settings → Personal access tokens → New token |
| `NETLIFY_SITE_ID` | Netlify → Site → Site configuration → Site ID |
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon public key |
| `BILLING_LIVE` | Set to `false` initially. Change to `true` in both GitHub AND Netlify when billing opens. |

### 4d: Enable branch protection on `main`

In GitHub → repository Settings → Branches → Add rule for `main`:

- Check: **Require status checks to pass before merging**
- In the status check search box, type `Build & Test` and select the `ci` job
- Check: **Require branches to be up to date before merging**
- Save

### 4e: Activate billing

Once 4a–4d are complete and the CI pipeline has run successfully at least once:

1. Change `BILLING_LIVE` from `false` to `true` in:
   - GitHub → repository secrets → `BILLING_LIVE`
   - Netlify → Site configuration → Environment variables → `BILLING_LIVE`
2. Push any commit to `main` (or trigger a manual deploy in Netlify)
3. Verify on `sellingdubai.com/pricing.html`:
   - Clicking "Upgrade Now" redirects to Stripe Checkout (not "Billing coming soon")
   - Completing a test checkout updates `agents.tier` in Supabase
   - `pricing.html` source no longer has `noindex`

---

## Success Criteria

**Billing:**
- [ ] Clicking "Get Pro" / "Upgrade Now" on `pricing.html` redirects to Stripe Checkout when `BILLING_LIVE=true`
- [ ] Completing checkout updates `agents.tier` and `agents.stripe_subscription_status` in Supabase
- [ ] Cancelling in Stripe downgrades the agent tier via webhook
- [ ] `pricing.html` is indexable (no `<meta name="robots" content="noindex">`)

**CI/CD:**
- [ ] Every push to `main` triggers the Actions workflow
- [ ] A broken `npm run check` fails the `ci` job and the `deploy` job does not run
- [ ] A green `ci` job on `main` auto-deploys to `https://sellingdubai.com`
- [ ] Every production deploy at Netlify links back to a specific GitHub commit with a green check
