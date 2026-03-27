# Testing Patterns

**Analysis Date:** 2026-03-27

## Test Framework

**Runner:**
- Deno's built-in test runner (`deno test`)
- Config: no `deno.json` test config — run command specified in the test file header comment

**Assertion Library:**
- `https://deno.land/std@0.224.0/assert/mod.ts` — `assertEquals`, `assertExists`
- Locked via `deno.lock` at project root

**Run Commands:**
```bash
# Run a specific edge function's tests
deno test edge-functions/send-magic-link/index.test.ts --allow-env --allow-net

deno test edge-functions/capture-lead-v4/index.test.ts --allow-env --allow-net
```

**Note:** No frontend JS tests exist. Testing covers only Deno edge functions.

## Test File Organization

**Location:**
- Co-located alongside implementation: `edge-functions/{function-name}/index.test.ts` paired with `edge-functions/{function-name}/index.ts`

**Naming:**
- `index.test.ts` — always `index.test.ts`, no variation

**Tested edge functions:**
```
edge-functions/
├── capture-lead-v4/
│   ├── index.ts
│   └── index.test.ts    ← 315 lines
├── send-magic-link/
│   ├── index.ts
│   └── index.test.ts    ← 150 lines
├── verify-magic-link/
│   └── index.ts         (no tests)
├── update-agent/
│   └── index.ts         (no tests)
├── instagram-auth/
│   └── index.ts         (no tests)
├── tiktok-auth/
│   └── index.ts         (no tests)
├── lead-followup-nagger/
│   └── index.ts         (no tests)
└── whatsapp-ingest/
    └── index.ts         (no tests)
```

## Test Structure

**Suite Organization:**
Tests are grouped with comment banners, not `describe` blocks. Each test is a standalone `Deno.test()` call:

```typescript
// ============================================================
// HAPPY PATH
// ============================================================

Deno.test("function-name: scenario description", async () => {
  // arrange
  const result = await postLead({ ... });
  // assert
  assertEquals(result.status, 200);
  assertEquals(result.data.success, true);
  assertExists(result.data.lead_id);
});
```

**Test name format:** `"function-name: scenario description in plain English"`

**Grouping sections used in tests:**
- `HAPPY PATH` — valid inputs that should succeed
- `MISSING / INVALID FIELDS` — validation failures returning 400
- `HONEYPOT` — bot detection silent success
- `DUPLICATE DETECTION` — dedup logic returning same lead_id
- `RATE LIMITING` — 429 / silent success behavior
- `OPTIONS (CORS preflight)` — CORS header presence
- `MALFORMED REQUEST` — unparseable JSON returning 500

## Mocking

**Framework:** None — no mocking library used.

**Approach:** Tests make real HTTP requests to the live Supabase-hosted edge function endpoints. There is no in-process unit testing or dependency injection.

```typescript
// All tests use actual fetch() against the real endpoint
const SUPABASE_URL = Deno.env.get("TEST_SUPABASE_URL") || "https://pjyorgedaxevxophpfib.supabase.co";
const ENDPOINT = `${SUPABASE_URL}/functions/v1/capture-lead`;

async function postLead(body: Record<string, unknown>) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": ORIGIN },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}
```

**What to Mock:** Nothing — tests rely on the deployed function and live database.

**What NOT to Mock:** Everything is real — Supabase DB, rate limit state, email sending (gated by `RESEND_API_KEY` env var).

## Fixtures and Factories

**Test Data:**
```typescript
// Unique phone/email generated per test run using Date.now()
const uniquePhone = `+97150${Date.now().toString().slice(-7)}`;
const uniqueEmail = `testlead+${Date.now()}@example.com`;

// Helper function pattern for building requests
async function postMagicLink(body: Record<string, unknown>) {
  const res = await fetch(ENDPOINT, { ... });
  return { status: res.status, data: await res.json() };
}

// Helper for graceful rate-limit skip
function skipIfRateLimited(result: { status: number }): boolean {
  if (result.status === 429) {
    console.log("  ⚠ Skipped — IP rate-limited (10/hr).");
    return true;
  }
  return false;
}
```

**Location:** Inline within test files — no separate fixtures directory.

**Real test dependencies:**
- `TEST_SUPABASE_URL` env var — falls back to production URL
- `TEST_AGENT_EMAIL` env var — tests that need a real registered agent skip if unset
- `TEST_AGENT_SLUG` env var — defaults to `"boban-pepic"` (real agent in DB)

## Coverage

**Requirements:** None enforced — no coverage thresholds or CI gates.

**View Coverage:**
```bash
# Not configured
```

## Test Types

**Unit Tests:** Not present. No isolated function tests.

**Integration Tests:** All tests are integration/E2E against the live deployed Supabase edge function with a real database.

**E2E Tests:** No separate E2E suite (Playwright, Cypress, etc.) — not used.

## Common Patterns

**Skipping tests conditionally:**
```typescript
Deno.test("send-magic-link: valid email returns success", async () => {
  if (!TEST_AGENT_EMAIL) {
    console.log("  ⚠ Skipped — set TEST_AGENT_EMAIL env var to run");
    return;
  }
  // ...
});
```

**Skipping slow/destructive tests with `ignore: true`:**
```typescript
Deno.test({
  name: "capture-lead: rate limit after 10 requests from same IP returns 429",
  ignore: true,   // Remove to run manually — creates real leads
  async fn() {
    // ...
  },
});
```

**Rate limit guard helper (used in tests that create real DB rows):**
```typescript
const result = await postLead({ ... });
if (skipIfRateLimited(result)) return;
assertEquals(result.status, 200);
```

**Deduplication test pattern — verify same lead_id returned on second submission:**
```typescript
const first = await postLead({ agent_slug: TEST_AGENT_SLUG, name: "Dedup Test", phone: uniquePhone });
assertEquals(first.status, 200);
const firstId = first.data.lead_id;

const second = await postLead({ agent_slug: TEST_AGENT_SLUG, name: "Dedup Test Again", phone: uniquePhone });
assertEquals(second.status, 200);
assertEquals(second.data.lead_id, firstId);  // Must match original
```

**CORS preflight test pattern:**
```typescript
Deno.test("function-name: OPTIONS returns CORS headers", async () => {
  const res = await fetch(ENDPOINT, {
    method: "OPTIONS",
    headers: { "Origin": ORIGIN },
  });
  assertEquals(res.ok, true);
  const allowOrigin = res.headers.get("access-control-allow-origin");
  assertExists(allowOrigin);
  await res.body?.cancel();  // Must drain body to avoid resource leak
});
```

**Async error testing:**
```typescript
Deno.test("function-name: invalid JSON returns 500", async () => {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": ORIGIN },
    body: "not json",  // Deliberately malformed
  });
  assertEquals(res.status, 500);
  const data = await res.json();
  assertEquals(data.error, "Internal server error.");
});
```

## Important Testing Notes

- Tests run against live Supabase (production instance or TEST_SUPABASE_URL override). Running tests creates real DB rows.
- Rate limits are real — running tests too rapidly will cause 429 responses that skip subsequent tests. Wait 1 hour between full test runs from the same IP.
- No test isolation — tests share a live database. Test uniqueness is ensured by using `Date.now()` in phone numbers and emails.
- Frontend JS (`js/*.js`) has zero test coverage.
- Edge functions without tests: `verify-magic-link`, `update-agent`, `instagram-auth`, `tiktok-auth`, `lead-followup-nagger`, `whatsapp-ingest`.

---

*Testing analysis: 2026-03-27*
