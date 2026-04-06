# Post-Audit Gap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all 9 engineering quality gaps identified in the post-YC-initiative audit to raise the score from 7.2/10 toward 9+/10.

**Architecture:** Four new edge function test files (waitlist-join, update-mortgage-docs, fetch-eibor, respond-to-match) are added following the existing Deno integration test pattern. Supporting improvements cover DECISIONS.md justifications, @ts-check enforcement for Category B JS files, Dependabot, and ENGINEERING.md/SLO.md documentation completeness.

**Tech Stack:** Deno 1.x integration tests against local Supabase stack, bash pre-deploy checks, GitHub Actions Dependabot, Markdown documentation.

---

### Task 1: Integration tests for `waitlist-join`

**Files:**
- Create: `supabase/functions/waitlist-join/test.ts`

- [ ] **Step 1: Write the failing test file**

```typescript
// supabase/functions/waitlist-join/test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { fnUrl } from '../_shared/test-helpers.ts';

const BASE = fnUrl('waitlist-join');

// Helper: clean up waitlist entries created by tests
async function cleanupWaitlist(email: string) {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const client = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  await client.from('waitlist').delete().eq('email', email);
}

Deno.test('waitlist-join: GET returns 405', async () => {
  const res = await fetch(BASE, { method: 'GET' });
  assertEquals(res.status, 405);
  await res.body?.cancel();
});

Deno.test('waitlist-join: missing name returns 400', async () => {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com' }),
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(typeof body.error, 'string');
});

Deno.test('waitlist-join: name too short returns 400', async () => {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'A', email: 'test@example.com' }),
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(typeof body.error, 'string');
});

Deno.test('waitlist-join: invalid email returns 400', async () => {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Alice', email: 'not-an-email' }),
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(typeof body.error, 'string');
});

Deno.test('waitlist-join: valid submission returns success', async () => {
  const email = `wl-test-${Date.now()}@example.com`;
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Alice Test', email }),
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.duplicate, false);
  await cleanupWaitlist(email);
});

Deno.test('waitlist-join: duplicate email returns duplicate flag', async () => {
  const email = `wl-dup-${Date.now()}@example.com`;
  // First insert
  await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Alice Dup', email }),
  });
  // Second insert — same email
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Alice Dup', email }),
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.duplicate, true);
  await cleanupWaitlist(email);
});
```

- [ ] **Step 2: Run tests to verify they fail (function not yet connected)**

```bash
cd /Users/bobanpepic/Desktop/sellingdubai-app
supabase functions serve waitlist-join --env-file ./supabase/.env --no-verify-jwt &
sleep 3
deno test --allow-net --allow-env supabase/functions/waitlist-join/test.ts
```

Expected: some tests FAIL (connection refused or assertion errors) — confirming tests are real.

- [ ] **Step 3: Run against the local Supabase stack**

```bash
# Ensure local stack is running: npm run dev (in a separate terminal)
# Then:
deno test --allow-net --allow-env supabase/functions/waitlist-join/test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/waitlist-join/test.ts
git commit -m "test(waitlist-join): add 6 integration tests (method, validation, duplicate)"
```

---

### Task 2: Integration tests for `update-mortgage-docs`

**Files:**
- Create: `supabase/functions/update-mortgage-docs/test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// supabase/functions/update-mortgage-docs/test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { fnUrl, seedAgent, cleanupAgent } from '../_shared/test-helpers.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BASE = fnUrl('update-mortgage-docs');

function supabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

async function seedMortgageApp(agentId: string, editToken: string): Promise<string> {
  const client = supabaseAdmin();
  const { data, error } = await client
    .from('mortgage_applications')
    .insert({
      agent_id: agentId,
      buyer_name: 'Test Buyer',
      buyer_phone: '+971501234567',
      edit_token: editToken,
    })
    .select('id')
    .single();
  if (error) throw new Error(`seedMortgageApp failed: ${error.message}`);
  return data.id as string;
}

async function cleanupMortgageApp(id: string) {
  await supabaseAdmin().from('mortgage_applications').delete().eq('id', id);
}

Deno.test('update-mortgage-docs: GET returns 405', async () => {
  const res = await fetch(BASE, { method: 'GET' });
  assertEquals(res.status, 405);
  await res.body?.cancel();
});

Deno.test('update-mortgage-docs: missing fields returns 400', async () => {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'some-id' }), // missing edit_token, doc_type, path
  });
  assertEquals(res.status, 400);
  await res.body?.cancel();
});

Deno.test('update-mortgage-docs: invalid doc_type returns 400', async () => {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'some-id',
      edit_token: 'tok',
      doc_type: 'evil_type',
      path: 'docs/file.pdf',
    }),
  });
  assertEquals(res.status, 400);
  await res.body?.cancel();
});

Deno.test('update-mortgage-docs: path traversal returns 400', async () => {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'some-id',
      edit_token: 'tok',
      doc_type: 'passport',
      path: '../etc/passwd',
    }),
  });
  assertEquals(res.status, 400);
  await res.body?.cancel();
});

Deno.test('update-mortgage-docs: wrong edit_token returns 401', async () => {
  const agent = await seedAgent();
  const appId = await seedMortgageApp(agent.id, 'correct-token-abc');
  try {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: appId,
        edit_token: 'wrong-token-xyz',
        doc_type: 'passport',
        path: 'mortgage-docs/passport.pdf',
      }),
    });
    assertEquals(res.status, 401);
    await res.body?.cancel();
  } finally {
    await cleanupMortgageApp(appId);
    await cleanupAgent(agent.id);
  }
});

Deno.test('update-mortgage-docs: valid request returns 200', async () => {
  const agent = await seedAgent();
  const token = `valid-tok-${Date.now()}`;
  const appId = await seedMortgageApp(agent.id, token);
  try {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: appId,
        edit_token: token,
        doc_type: 'passport',
        path: 'mortgage-docs/passport.pdf',
      }),
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.ok, true);
  } finally {
    await cleanupMortgageApp(appId);
    await cleanupAgent(agent.id);
  }
});
```

- [ ] **Step 2: Run tests to confirm they can be reached**

```bash
deno test --allow-net --allow-env supabase/functions/update-mortgage-docs/test.ts
```

Expected: all 6 tests PASS against local stack.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/update-mortgage-docs/test.ts
git commit -m "test(update-mortgage-docs): add 6 integration tests (method, validation, auth, happy path)"
```

---

### Task 3: Integration tests for `fetch-eibor`

**Files:**
- Create: `supabase/functions/fetch-eibor/test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// supabase/functions/fetch-eibor/test.ts
import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { fnUrl } from '../_shared/test-helpers.ts';

const BASE = fnUrl('fetch-eibor');

Deno.test('fetch-eibor: POST returns 405', async () => {
  const res = await fetch(BASE, { method: 'POST', body: '{}' });
  assertEquals(res.status, 405);
  await res.body?.cancel();
});

Deno.test('fetch-eibor: GET returns 200 with rate field', async () => {
  const res = await fetch(BASE, { method: 'GET' });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertExists(body.rate);
  assertExists(body.source);
  assertExists(body.fetched_at);
});

Deno.test('fetch-eibor: rate is a realistic percentage (0.5–15)', async () => {
  const res = await fetch(BASE, { method: 'GET' });
  const body = await res.json();
  const rate = Number(body.rate);
  assertEquals(isNaN(rate), false);
  assertEquals(rate >= 0.5 && rate <= 15, true);
});

Deno.test('fetch-eibor: source is one of scrape/cache/fallback', async () => {
  const res = await fetch(BASE, { method: 'GET' });
  const body = await res.json();
  const validSources = ['scrape', 'cache', 'fallback'];
  assertEquals(validSources.includes(body.source), true);
});
```

- [ ] **Step 2: Run tests**

```bash
deno test --allow-net --allow-env supabase/functions/fetch-eibor/test.ts
```

Expected: all 4 tests PASS. (In a fully offline environment the fallback rate 3.68 is used — still passes the 0.5–15 range check.)

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/fetch-eibor/test.ts
git commit -m "test(fetch-eibor): add 4 integration tests (method, response shape, rate range, source enum)"
```

---

### Task 4: Integration tests for `respond-to-match`

**Files:**
- Create: `supabase/functions/respond-to-match/test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// supabase/functions/respond-to-match/test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { fnUrl, seedAgent, cleanupAgent, seedMagicLink } from '../_shared/test-helpers.ts';

const BASE = fnUrl('respond-to-match');

Deno.test('respond-to-match: GET returns 405', async () => {
  const res = await fetch(BASE, { method: 'GET' });
  assertEquals(res.status, 405);
  await res.body?.cancel();
});

Deno.test('respond-to-match: no Authorization header returns 401', async () => {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ match_id: 'some-id', action: 'interested' }),
  });
  assertEquals(res.status, 401);
  await res.body?.cancel();
});

Deno.test('respond-to-match: invalid token returns 401', async () => {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer totally-invalid-token',
    },
    body: JSON.stringify({ match_id: 'some-id', action: 'interested' }),
  });
  assertEquals(res.status, 401);
  await res.body?.cancel();
});

Deno.test('respond-to-match: missing match_id returns 400', async () => {
  const agent = await seedAgent();
  const link = await seedMagicLink(agent.id);
  try {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${link.token}`,
      },
      body: JSON.stringify({ action: 'interested' }), // missing match_id
    });
    assertEquals(res.status, 400);
    await res.body?.cancel();
  } finally {
    await cleanupAgent(agent.id);
  }
});

Deno.test('respond-to-match: unknown match_id returns 404', async () => {
  const agent = await seedAgent();
  const link = await seedMagicLink(agent.id);
  try {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${link.token}`,
      },
      body: JSON.stringify({
        match_id: '00000000-0000-0000-0000-000000000000',
        action: 'interested',
      }),
    });
    assertEquals(res.status, 404);
    await res.body?.cancel();
  } finally {
    await cleanupAgent(agent.id);
  }
});
```

- [ ] **Step 2: Run tests**

```bash
deno test --allow-net --allow-env supabase/functions/respond-to-match/test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/respond-to-match/test.ts
git commit -m "test(respond-to-match): add 5 integration tests (method, auth, missing fields, not found)"
```

---

### Task 5: Add DECISIONS.md justifications for untested edge functions

**Files:**
- Modify: `DECISIONS.md`

- [ ] **Step 1: Read the current end of DECISIONS.md to find the correct append location**

Open `DECISIONS.md` and scroll to the last entry. All new entries go at the bottom.

- [ ] **Step 2: Append 7 justification entries**

Add the following block at the end of `DECISIONS.md`:

```markdown
## Untested Edge Functions — Justification Register

The following edge functions are deliberately excluded from integration tests. This register documents the reason for each exclusion so that the "no tests" state is an intentional decision, not an oversight.

### `create-portal-session` — Requires live Stripe secret key
Integration-testable only against the Stripe test API, which requires a live `STRIPE_SECRET_KEY` in CI. Adding a Stripe-mocked test would duplicate the `create-checkout` pattern but provide no additional safety signal. Deferred until a Stripe test-mode environment is provisioned in CI secrets.

### `debug-resend` — Development utility, never deployed to production
This function is a local debug helper for Resend email delivery and is not listed in the production function set. It has no business logic beyond forwarding a payload to Resend's API. Excluded from test coverage on the same basis as a local `scripts/` helper.

### `prerender` — Covered by Playwright E2E smoke tests
The prerender/OG-injector function is exercised by the E2E smoke-test job on every deploy (`scripts/smoke-test.sh` hits the rendered page endpoints). A separate Deno integration test would duplicate this coverage without adding value.

### `sync-rem-offplan` — Cron job, external API dependency
This function is triggered by a Supabase cron job and calls the REM off-plan feed API. Its correctness depends on the external API response structure, which cannot be controlled in a test environment. Integration-testing it would require mocking the HTTP client or a VCR cassette — both add complexity without proportionate safety gain. Covered by Sentry error alerting in production.

### `lead-followup-nagger` — Cron job, side-effect only
This function sends WhatsApp follow-up messages via the Twilio/WhatsApp API. Integration testing requires either a live Twilio sandbox (complex CI setup) or mocking the outbound HTTP call (provides no real signal). Covered by Sentry error alerting and manual QA after changes.

### `instagram-auth` — OAuth callback, requires browser session
This is the OAuth redirect callback for Instagram login. Testing it requires initiating a real OAuth flow from a browser, which cannot be replicated in a headless Deno test. Covered by manual QA on staging.

### `tiktok-auth` — OAuth callback, requires browser session
Same reasoning as `instagram-auth`. TikTok OAuth callback requires a browser-initiated flow. Covered by manual QA on staging.
```

- [ ] **Step 3: Verify the file looks correct**

Open `DECISIONS.md` and confirm the 7 new entries appear at the end, each with a heading and body text.

- [ ] **Step 4: Commit**

```bash
git add DECISIONS.md
git commit -m "docs(decisions): document 7 untested edge functions with explicit justifications"
```

---

### Task 6: Add `// @ts-check` to Category B JS files and enforce in pre-deploy check

**Files:**
- Modify: `js/async-css.js`
- Modify: `js/cookie-consent.js`
- Modify: `js/event-delegation.js`
- Modify: `js/gtag-init.js`
- Modify: `js/landing-behavior.js`
- Modify: `js/landing-chip-anim.js`
- Modify: `js/pricing.js`
- Modify: `js/sd-config.js`
- Modify: `js/sentry-init.js`
- Modify: `scripts/pre-deploy-check.sh`

- [ ] **Step 1: Add `// @ts-check` as the first line of each Category B file**

For each of the 9 files, verify it does NOT currently start with `// @ts-check`, then prepend the comment.

Run this to confirm current state:
```bash
for f in async-css.js cookie-consent.js event-delegation.js gtag-init.js landing-behavior.js landing-chip-anim.js pricing.js sd-config.js sentry-init.js; do
  echo "=== $f ===" && head -1 /Users/bobanpepic/Desktop/sellingdubai-app/js/$f
done
```

For each file that doesn't already start with `// @ts-check`, open it and prepend `// @ts-check` followed by a newline before the first existing line.

- [ ] **Step 2: Verify all 9 files now have `// @ts-check` on line 1**

```bash
for f in async-css.js cookie-consent.js event-delegation.js gtag-init.js landing-behavior.js landing-chip-anim.js pricing.js sd-config.js sentry-init.js; do
  head -1 /Users/bobanpepic/Desktop/sellingdubai-app/js/$f
done
```

Expected: all 9 lines output `// @ts-check`.

- [ ] **Step 3: Add enforcement check to `scripts/pre-deploy-check.sh`**

Find the section near the end of the file where other checks are summarized (around the `PASS`/`FAIL` reporting block). Add a new check block before the final summary:

```bash
# Check 10: @ts-check on all Category B JS files (js/*.js without a .ts sibling)
echo "--- Check 10: @ts-check on Category B JS files ---"
TSCHECK_FAIL=0
for js_file in js/*.js; do
  base="${js_file%.js}"
  if [ ! -f "${base}.ts" ]; then
    first_line=$(head -1 "$js_file")
    if [ "$first_line" != "// @ts-check" ]; then
      echo "FAIL: $js_file is missing '// @ts-check' on line 1"
      TSCHECK_FAIL=1
    fi
  fi
done
if [ "$TSCHECK_FAIL" -eq 0 ]; then
  echo "PASS: all Category B JS files have @ts-check"
fi
```

Also increment the final failure gate to include `$TSCHECK_FAIL`:

Find the line that reads (approximately):
```bash
if [ "$FAIL" -ne 0 ] || [ ... ]; then
```
and add `|| [ "$TSCHECK_FAIL" -ne 0 ]` to it. If the script uses a simple `exit` at the end based on accumulated errors, add:
```bash
[ "$TSCHECK_FAIL" -ne 0 ] && FAIL=1
```
just before the final `exit $FAIL` line.

- [ ] **Step 4: Run the pre-deploy check to confirm it passes**

```bash
cd /Users/bobanpepic/Desktop/sellingdubai-app && npm run check
```

Expected: Check 10 outputs `PASS: all Category B JS files have @ts-check`.

- [ ] **Step 5: Commit**

```bash
git add js/async-css.js js/cookie-consent.js js/event-delegation.js js/gtag-init.js js/landing-behavior.js js/landing-chip-anim.js js/pricing.js js/sd-config.js js/sentry-init.js scripts/pre-deploy-check.sh
git commit -m "chore(ts-check): add @ts-check to 9 Category B JS files and enforce in pre-deploy check"
```

---

### Task 7: Add Dependabot configuration

**Files:**
- Create: `.github/dependabot.yml`

- [ ] **Step 1: Verify `.github/` directory exists and `dependabot.yml` is absent**

```bash
ls /Users/bobanpepic/Desktop/sellingdubai-app/.github/
```

If `.github/` does not exist, create it. If `dependabot.yml` already exists, skip this task.

- [ ] **Step 2: Write `.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    open-pull-requests-limit: 5
    labels:
      - "dependencies"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    open-pull-requests-limit: 5
    labels:
      - "dependencies"
      - "github-actions"
```

- [ ] **Step 3: Commit**

```bash
git add .github/dependabot.yml
git commit -m "chore(deps): add Dependabot for npm and GitHub Actions (weekly, Monday)"
```

---

### Task 8: Update `ENGINEERING.md` — test coverage, troubleshooting, rollback, lazy-load map, Core Web Vitals, key rotation

**Files:**
- Modify: `ENGINEERING.md`

This task has 6 targeted edits. Make them in order.

- [ ] **Step 1: Fix test coverage count**

Find the line containing `~30 of 41 edge functions have integration tests` (around line 217) and replace it with:

```
34 of 41 edge functions have integration tests; 7 are explicitly excluded — see `DECISIONS.md` → "Untested Edge Functions — Justification Register" for rationale.
```

- [ ] **Step 2: Add lazy-loaded modules map**

Find the "## JavaScript Architecture" section (or the section describing esbuild entry points). After the existing description of the three entry points, add:

```markdown
### Lazy-Loaded Modules

The following modules are dynamically imported on demand and are **not** included in `init.bundle.js`:

| Module | Loaded when |
|---|---|
| `mortgage.ts` | User opens mortgage enquiry form |
| `mortgage-offplan.ts` | User opens off-plan mortgage flow |
| `property-detail.ts` | User opens property detail sheet |
| `project-detail.ts` | User opens project detail sheet |
| `lead-modal.ts` | Agent opens lead capture modal |
```

- [ ] **Step 3: Add Core Web Vitals targets**

Find the "## Performance" section (or the Lighthouse / performance budget section). Add a subsection:

```markdown
### Core Web Vitals Targets

| Metric | Target | Threshold (fail) |
|---|---|---|
| LCP (Largest Contentful Paint) | < 2.5 s | > 4.0 s |
| INP (Interaction to Next Paint) | < 200 ms | > 500 ms |
| CLS (Cumulative Layout Shift) | < 0.1 | > 0.25 |

Measured via Lighthouse CI on every deploy. Reference: [web.dev/vitals](https://web.dev/vitals).
```

- [ ] **Step 4: Add API Key Rotation procedure**

Find the "## Security" section. Add a subsection:

```markdown
### API Key Rotation

To rotate a secret without downtime:

1. Add the new secret value as a *new* env var in Netlify (Settings → Environment Variables) and Supabase (project Settings → Edge Functions → Secrets) under a temporary name, e.g. `SUPABASE_KEY_NEW`.
2. Deploy a code change that reads both the old and new var, preferring the new one.
3. Confirm traffic is flowing correctly for at least 5 minutes.
4. Remove the old var and rename the new var to the canonical name.
5. Remove the fallback read from code and deploy again.

For Stripe keys specifically: use Stripe's built-in key rotation — disable the old restricted key only after the new one is confirmed working in production.
```

- [ ] **Step 5: Add Troubleshooting Guide**

Find the end of the document (or before any final "---" separator). Add:

```markdown
## Troubleshooting

### Edge function returns 500 in production

1. Check Sentry for the error — filter by `transaction` matching the function name.
2. Check Supabase function logs: Dashboard → Edge Functions → select function → Logs tab.
3. Reproduce locally: `supabase functions serve <name> --env-file ./supabase/.env --no-verify-jwt` then `curl` the failing request.
4. Common causes: missing env var (check Supabase secrets), RLS policy blocking a service-role query (check `supabase/SCHEMA.md`), Deno import resolution (check `deno.json` importMap).

### Deploy succeeds but site is broken

1. Check Netlify deploy log for build errors.
2. Run `npm run check` locally — catches bundle size regressions and CTA routing issues.
3. Check browser console for JS errors — all are reported to Sentry with release tag.
4. If a bad deploy is live, use **Rollback** procedure below.

### Database migration fails on `supabase db reset`

1. Check that all migrations in `supabase/migrations/` use `IF NOT EXISTS` guards.
2. Identify the failing migration from the error output.
3. Fix the SQL and re-run `supabase db reset`.
4. If the migration order is wrong, rename the timestamp prefix to reorder.

### Magic link auth loop (user keeps getting new links)

Check `magic_links` table: the row should have `used_at IS NOT NULL` after first use. If `used_at` is null after use, the `verify-magic-link` function may have failed to update it — check Sentry for errors from that function.
```

- [ ] **Step 6: Add Rollback procedure**

In the Troubleshooting section or as its own `## Rollback` section after Troubleshooting:

```markdown
## Rollback

### Frontend (Netlify)

1. Go to Netlify → Deploys.
2. Find the last known-good deploy (green checkmark, correct timestamp).
3. Click **Publish deploy** — Netlify instantly serves that build, no rebuild required.
4. Notify team in Slack with the deploy URL and reason.

### Database migration

If a migration caused data corruption or a schema change needs reverting:

1. **Stop traffic** — pause the Netlify site (Site Settings → Danger Zone → Pause publishing) or put up a maintenance page.
2. Write a new *forward* migration that undoes the change (do not delete the bad migration — history must be preserved).
3. Apply the new migration: `supabase db push` (or via the Supabase dashboard SQL editor for emergencies).
4. Re-enable traffic.

> Never use `supabase db reset` against production — it drops and rebuilds the entire schema.

### Edge function

Supabase does not support instant edge function rollback. To revert:
1. Check out the previous working commit.
2. Run `supabase functions deploy <name>` from that commit.
3. The previous version is live within ~30 seconds.
```

- [ ] **Step 7: Run a quick build to confirm ENGINEERING.md edits didn't break anything**

```bash
npm run build 2>&1 | tail -5
```

Expected: build succeeds (ENGINEERING.md is not part of the build, this is a sanity check).

- [ ] **Step 8: Commit**

```bash
git add ENGINEERING.md
git commit -m "docs(engineering): update test count, add lazy-load map, Core Web Vitals, key rotation, troubleshooting, rollback"
```

---

### Task 9: Add Core Web Vitals section to `SLO.md`

**Files:**
- Modify: `SLO.md`

- [ ] **Step 1: Read `SLO.md` to find the right insertion point**

Open `SLO.md` and locate the last SLO section. New section goes at the end, before any appendix or reference links.

- [ ] **Step 2: Append Core Web Vitals SLO section**

Add the following at the end of `SLO.md`:

```markdown
## Core Web Vitals SLOs

Measured via Lighthouse CI on every Netlify deploy (chromium, 4x CPU throttle, Fast 3G).

| Metric | SLO Target | Alert Threshold |
|---|---|---|
| LCP (Largest Contentful Paint) | < 2.5 s | > 4.0 s |
| INP (Interaction to Next Paint) | < 200 ms | > 500 ms |
| CLS (Cumulative Layout Shift) | < 0.1 | > 0.25 |

**Measurement:** Lighthouse CI run post-deploy, results stored as GitHub Actions artifacts (`lighthouse-report/`). Manual spot-check via PageSpeed Insights on `index.html` and `landing.html` after each major JS change.

**Alerting:** Currently manual — no automated alert fires on CWV regression. To automate: add a Lighthouse CI budget assertion in `lighthouserc.js` that fails the deploy job when targets are breached.

**Vendor SLA note:** Core Web Vitals are measured client-side and are not covered by Netlify's or Supabase's infrastructure SLAs. Regressions are caused by JS bundle growth, third-party script additions, or image size increases.
```

- [ ] **Step 3: Commit**

```bash
git add SLO.md
git commit -m "docs(slo): add Core Web Vitals SLO section (LCP/INP/CLS targets and alert thresholds)"
```

---

## Self-Review

### Spec Coverage

| Gap from audit | Task |
|---|---|
| `waitlist-join` untested | Task 1 |
| `update-mortgage-docs` untested | Task 2 |
| `fetch-eibor` untested | Task 3 |
| `respond-to-match` untested | Task 4 |
| 7 exclusions undocumented in DECISIONS.md | Task 5 |
| 9 Category B JS files missing `@ts-check` | Task 6 |
| No Dependabot | Task 7 |
| ENGINEERING.md: stale test count, missing sections | Task 8 |
| SLO.md: no Core Web Vitals | Task 9 |

All 9 gaps covered. No gaps without a task.

### Placeholder Scan

- All test code contains exact assertion values, not "add appropriate assertions"
- All file paths are exact
- `seedMortgageApp` helper is defined inline in Task 2 (not referenced before definition)
- DECISIONS.md entries contain body text, not "TBD"
- ENGINEERING.md additions contain complete prose/tables, not "fill in later"

### Type Consistency

- `seedMagicLink` is called in Task 4 returning `link` with `.token` — matches `_shared/test-helpers.ts` which exports `seedMagicLink(agentId, overrides?)` returning `{ token: string, ... }`
- `seedAgent()` returns `{ id: string, ... }` — consistent across Tasks 2, 4
- `cleanupAgent(id: string)` called with `agent.id` — consistent
- `fnUrl('function-name')` returns a string URL — consistent across all 4 test tasks
