# CONCERNS.md — Partial Write Audit

**Scope:** `create-agent`, `capture-lead-v4`, `stripe-webhook`
**Date:** 2026-04-15
**Method:** Static analysis of edge function source code against schema

Severity scale: **CRITICAL** (data loss / user locked out / billing state corrupt) · **HIGH** (silent failure, hard to detect) · **MEDIUM** (inconsistency, recoverable) · **LOW** (documented/intentional, no action required)

---

## 1. `create-agent`

### C1 — CRITICAL: OTP consumed before agency invite is validated

**Location:** `create-agent/index.ts` lines 89–108

**Sequence:**
1. Line 89–93: `email_verification_codes` row updated to `verified = true` ← **write committed**
2. Lines 95–108: agency invite token validated — if invalid, returns `400`

**Failure scenario:** A user with a valid OTP but an invalid (or already-used) invite token submits the form. The OTP is marked verified and can no longer be reused (the lookup at line 74 filters `verified = false`). The user is locked out: they cannot retry with the same OTP and must request a new one.

**Why it matters:** The OTP expiry window is 10 minutes. If the join form submits the invite token before the OTP is validated in order, a single failed invite check burns the OTP permanently. This is a registration funnel blocker.

**Fix direction:** Move the invite token validation (lines 95–108) to **before** the OTP `verified` update. Only consume the OTP after all precondition checks pass.

---

### C2 — HIGH: Agent invite token not marked used if `update()` silently fails

**Location:** `create-agent/index.ts` lines 218–223

```ts
// Mark invite as used now that the agent row is committed
if (agency_invite_token) {
  await supabase
    .from("agent_invites")
    .update({ used_at: new Date().toISOString() })
    .eq("token", agency_invite_token);
}
```

**Problem:** The return value of this `update()` is discarded. If the update fails (network blip, row missing), no error is thrown and the function continues to return `201 success`. The agent row is created, the invite is not consumed. The same invite token can now be used again by a second person.

**Why it matters:** Invite tokens are presumably single-use (the query at line 99 filters `.is("used_at", null)`). A silent DB failure here makes them reusable, allowing unlimited agents to join via one invite.

**Fix direction:** Check `{ error }` from the update and either throw (return 500, let the user retry) or log a Sentry alert and continue — depending on whether invite uniqueness is enforced elsewhere.

---

### C3 — MEDIUM: Agent created, magic link silently not stored

**Location:** `create-agent/index.ts` lines 311–323

```ts
const editToken = crypto.randomUUID();
const { error: tokenError } = await supabase
  .from("magic_links")
  .insert({ agent_id: agent.id, token: editToken, expires_at: ... });

if (tokenError) {
  console.error("Magic link token error");
  // ← no early return; function continues
}
```

**Problem:** If the `magic_links` insert fails, `tokenError` is logged but execution continues. The function returns `{ success: true, edit_token: editToken }` to the browser. The browser stores this token and the user is redirected to `/edit?token=<editToken>`. That token does not exist in the database. Every subsequent `verify-magic-link` call will fail → the user cannot access their dashboard.

**Why it matters:** The agent's profile exists but they have no way to log in. They must contact support or wait for a password-reset email to arrive (which also fails if the token is broken). Full onboarding lockout.

**Fix direction:** Treat magic link insert failure as fatal — return `500` and let the user retry. The agent row can be cleaned up or reused on retry (the email dedup check at lines 110–121 will prevent a duplicate).

---

## 2. `capture-lead-v4`

### C4 — HIGH: `agent_notified_at` update is awaited outside try/catch — lead saved but 500 returned to client

**Location:** `capture-lead-v4/index.ts` lines 535–538

```ts
// Update notification timestamp — must be inside try so errors are caught
await supabase
  .from("leads")
  .update({ agent_notified_at: new Date().toISOString() })
  .eq("id", lead.id);
```

**Problem:** This `await` is inside the outer `try` block but is NOT wrapped in its own try/catch. If Supabase throws on this update (network error, connection pool exhausted), the exception propagates to the catch at line 634, which returns `500 "Internal server error"`.

**State at this point:**
- `leads` row: **committed** ✓
- Email/WA/webhook notifications: **already sent** ✓
- `agent_notified_at`: not set
- Response to browser: **500**

**Why it matters:** The browser treats the 500 as a failure and may retry. On retry, the dedup check (line 339–343) returns a silent `200` — so no duplicate lead is created. But:
1. The user sees an error on a form that actually worked.
2. `agent_notified_at` is never set on this lead (broken for any query that filters on it).
3. The comment on line 534 says "must be inside try so errors are caught" — it is inside try, but unguarded.

**Fix direction:** Wrap this update in its own try/catch, log the error via Sentry, and continue to return `200`. The notification timestamp is not worth failing the entire response for.

---

### C5 — LOW (documented/intentional): Contact timeline writes fire-and-forget

**Location:** `capture-lead-v4/index.ts` lines 602–623

`contact_reminders` (5 rows) and `contact_interactions` (1 row) are inserted as fire-and-forget `.then().catch()` calls — explicitly not awaited.

**Scenario:** If either insert fails (rate limit, schema mismatch, DB overload), the errors are logged but the lead is saved and the response is `200`. The lead's contact timeline is missing.

**Why it's LOW:** This pattern is documented in `DECISIONS.md` (2026-04-12) as intentional — "fire-and-forget, never blocks response." The risk is accepted. Sentry captures the errors.

**Note for awareness:** During a DB overload scenario where `contact_reminders` is backed up, a batch of leads could arrive without any timeline entries. There is no retry/backfill mechanism. If the Contact Timeline feature becomes a core product feature (not just a convenience), this should be upgraded to a queued job.

---

## 3. `stripe-webhook`

### C6 — CRITICAL: `agents.update()` errors are silently discarded — Stripe receives 200 even when billing state was not written

**Location:** `stripe-webhook/index.ts` — all five event handlers

Every handler follows this pattern:
```ts
await supabase.from("agents").update({ tier: ..., stripe_subscription_status: ... }).eq("id", agentId);
console.log(`...: agent ${agentId} → ${resolved.tier}`);
break;
```

The `update()` return value is never destructured for `{ error }`. If the update fails:
- No exception is thrown (Supabase JS v2 returns `{ error }`, does not throw by default)
- `console.log` runs and announces success
- The switch falls through to the outer `return new Response(JSON.stringify({ received: true }), { status: 200 })`
- Stripe receives `200` and marks the event as delivered
- **Stripe will never retry this event**

**Affected events:** `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`

**Why it matters:** An agent pays, Stripe fires `checkout.session.completed`, the Supabase update silently fails, Stripe gets `200`, and the agent's tier remains `free`. There is no automatic recovery path. The billing state is now permanently out of sync with Stripe unless manually corrected.

**Fix direction:** Destructure `{ error }` from every `supabase.from("agents").update(...)` call. If `error` is truthy, `throw new Error(...)`. This causes the outer catch to return `500`, which tells Stripe to retry with exponential backoff.

---

### C7 — HIGH: No `subscription_events` audit log written in any handler

**Location:** `stripe-webhook/index.ts` — all handlers; `subscription_events` table exists per `SCHEMA.md`

The schema has a `subscription_events` table explicitly for Stripe billing event history. None of the five webhook handlers write to it. Every billing state change is applied directly to `agents.*` with no record of:
- What event triggered the change
- What the previous tier/status was
- When each transition occurred

**Why it matters:**
1. **Debugging:** If an agent disputes a charge or a tier change, there is no audit trail to reconstruct the timeline.
2. **Idempotency:** Without a log of processed event IDs, replaying a webhook or re-delivering from the Stripe Dashboard could double-apply changes (though the `agents.update()` is idempotent for the same values).
3. **Analytics:** Cannot report on upgrade/downgrade/churn without this table.

**Fix direction:** In each handler, after the successful `agents.update()`, insert a row into `subscription_events` with `agent_id`, `stripe_event_id`, `event_type`, `previous_tier`, `new_tier`, `stripe_subscription_id`, and `created_at`. Use `event.id` (the Stripe event ID) as a unique key to ensure idempotency on retry.

---

### C8 — MEDIUM: 0-row update returns 200 — unknown agent silently accepted

**Location:** `stripe-webhook/index.ts` — all handlers

After `resolveAgentId` returns a non-null `agentId`, the code proceeds to:
```ts
await supabase.from("agents").update({ ... }).eq("id", agentId);
```

If `agentId` came from `metadata.agent_id` in the Stripe session (not a DB lookup), it could be any UUID — including one that doesn't exist in the `agents` table. Supabase will execute the UPDATE, match 0 rows, return `{ count: 0, error: null }`, and the function returns `200` to Stripe.

**Scenario:** An agent's row was deleted from the DB after a Stripe subscription was created (e.g., test agent cleanup, admin deletion). Stripe still has their `customer_id`. Any subsequent billing events for that customer are silently dropped.

**Fix direction:** After each `supabase.from("agents").update(...)`, check that `count > 0` (using `{ count: "exact" }` option or inspecting the response). If `count === 0`, log a critical Sentry alert and optionally return `500` to trigger Stripe retry (though retry won't fix a genuinely deleted agent — alerting is more useful here).

---

## Summary Table

| ID | Function | Scenario | Severity | Stripe retries? |
|----|----------|----------|----------|-----------------|
| C1 | create-agent | OTP consumed before invite validated → user locked out on retry | CRITICAL | N/A |
| C2 | create-agent | Invite `used_at` silently not written → token reusable | HIGH | N/A |
| C3 | create-agent | Magic link not stored → agent created with broken edit URL | MEDIUM | N/A |
| C4 | capture-lead-v4 | `agent_notified_at` update throws → lead saved, 500 returned to browser | HIGH | N/A |
| C5 | capture-lead-v4 | Contact timeline fire-and-forget → lead without timeline | LOW | N/A |
| C6 | stripe-webhook | `agents.update()` error discarded → Stripe gets 200, tier never written | CRITICAL | **No** |
| C7 | stripe-webhook | No `subscription_events` log written in any handler | HIGH | N/A |
| C8 | stripe-webhook | 0-row update on unknown agent returns 200 → silently dropped | MEDIUM | **No** |

### Immediate action priority

1. **C6** — Fix before billing goes live. Silent billing state corruption with no retry path.
2. **C1** — Fix before agency invite flow is used in production. OTP lockout on valid retry.
3. **C4** — Fix before high-traffic launch. Misleading 500 on successful lead capture.
4. **C7** — Fix alongside C6. Needed for billing audit trail.
5. **C3** — Fix before onboarding scales. Magic link failures are currently very rare but catastrophic for the affected user.
6. **C2** — Fix before agency invite flow ships at scale.
7. **C8** — Monitor/alert; fix after C6 is resolved.
