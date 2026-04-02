# Edge Function Integration Tests — Design Spec

**Date:** 2026-04-02
**Status:** Approved
**Scope:** Integration tests for the 4 highest-consequence Supabase edge functions

---

## Goal

Add a `deno test` integration test suite that runs against the local Supabase stack, covering the billing, auth, lead capture, and webhook functions. Zero new tooling dependencies — Deno's native test runner, raw `fetch()` calls, real local DB.

## Architecture

```
supabase/functions/
├── _shared/
│   ├── utils.ts                 (existing — CORS helpers)
│   └── test-helpers.ts          (new — URL builder, seeding, cleanup)
├── verify-magic-link/
│   ├── index.ts                 (existing)
│   └── test.ts                  (new)
├── capture-lead-v4/
│   ├── index.ts                 (existing)
│   └── test.ts                  (new)
├── stripe-webhook/
│   ├── index.ts                 (existing)
│   └── test.ts                  (new)
└── create-checkout/
    ├── index.ts                 (existing)
    └── test.ts                  (new)
```

### `_shared/test-helpers.ts`

Three exports:

**`fnUrl(name: string): string`**
Builds `http://127.0.0.1:54321/functions/v1/<name>` from env. Reads `SUPABASE_URL` with fallback to `http://127.0.0.1:54321`.

**`seedAgent(overrides?: Partial<Agent>): Promise<Agent>` / `cleanupAgent(id: string): Promise<void>`**
Inserts a minimal test agent row using the service role key, returns it. `cleanupAgent` deletes it by ID. Each test that needs an agent calls these in setup/finally — no shared state between tests.

**`signStripePayload(body: string, secret: string): string`**
Generates a valid `Stripe-Signature` header (`t=<timestamp>,v1=<hmac>`) for webhook tests. Mirrors the signing logic in `stripe-webhook/index.ts` so tests can produce both valid and invalid signatures.

---

## Test Coverage

### `verify-magic-link/test.ts` (4 tests)

| Test | Assertion |
|------|-----------|
| valid token resolves to agent | `200`, `agent.id` matches seeded agent |
| missing token | `401` |
| unknown/random token | `401` |
| expired token (manipulate `magic_link_expires_at` to past) | `401` |

### `capture-lead-v4/test.ts` (4 tests)

| Test | Assertion |
|------|-----------|
| valid lead payload stores and returns 200 | `200`, lead row inserted |
| missing `name` field | `400` |
| missing `agent_id` field | `400` |
| 6th request from same IP within rate window | `429` |

### `stripe-webhook/test.ts` (4 tests)

| Test | Assertion |
|------|-----------|
| missing `Stripe-Signature` header | `400` |
| invalid HMAC signature | `400` |
| `checkout.session.completed` event | agent `tier` updated, `200` |
| `customer.subscription.deleted` event | agent `tier` downgraded to `free`, `200` |

### `create-checkout/test.ts` (4 tests)

| Test | Assertion |
|------|-----------|
| no auth token | `401` |
| agent already has active subscription | `409` |
| valid agent, free tier | returns object with `url` (Stripe checkout URL), `200` |
| invalid price ID (bad env) | `500` or meaningful error, not silent |

> **Note:** The happy path test makes a real Stripe API call. It requires `STRIPE_SECRET_KEY` set to a Stripe test key (`sk_test_...`) and `STRIPE_PRO_MONTHLY_PRICE_ID` set to a valid test price ID in `supabase/.env`. Auth failure and 409 tests do not call Stripe and run without these keys. The happy path test should be skipped (`Deno.test({ ignore: !Deno.env.get("STRIPE_SECRET_KEY") })`) if the key is absent rather than failing noisily.

**Total: 16 tests across 4 functions.**

---

## Environment

Tests read from `supabase/.env`. Required keys (all already present in `.env.example`):

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<local service role key>
STRIPE_WEBHOOK_SECRET=<test webhook secret>
```

No new env vars needed.

---

## Scripts

**`package.json` additions:**
```json
{
  "scripts": {
    "test:functions": "deno test --allow-net --allow-env --allow-read supabase/functions/*/test.ts",
    "test": "npm run test:functions"
  }
}
```

**Running locally:**
```bash
# Terminal 1: local Supabase stack
npm run dev

# Terminal 2: function server
supabase functions serve --env-file ./supabase/.env --no-verify-jwt

# Terminal 3: run tests
npm run test:functions
```

**`scripts/pre-deploy-check.sh` addition:**
Add a reminder notice (not a hard gate) when `SUPABASE_URL` is local, prompting the developer to run `npm run test:functions` before deploying.

---

## Test Structure Pattern

Every test file follows this structure — no shared state, each test owns its data:

```ts
import { fnUrl, seedAgent, cleanupAgent } from "../_shared/test-helpers.ts";

Deno.test("description of happy path", async () => {
  const agent = await seedAgent();
  try {
    const res = await fetch(fnUrl("function-name"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ /* ... */ }),
    });
    const data = await res.json();
    // assertions
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  } finally {
    await cleanupAgent(agent.id);
  }
});
```

---

## CI Path (Future)

When the CI pipeline is added (next phase), tests slot in as:
```yaml
- run: supabase start
- run: supabase functions serve --env-file ./supabase/.env --no-verify-jwt &
- run: npm run test:functions
- run: supabase stop
```

No changes to test files required — the same `npm run test:functions` command works in CI.

---

## Out of Scope

- Frontend JS unit tests (separate phase)
- E2E browser tests (separate phase)
- TypeScript migration (separate phase)
- Testing all 30+ edge functions (start with 4 highest-consequence, expand incrementally)
