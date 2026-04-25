# CONCERNS.md — Partial Write Audit

**Scope:** `create-agent`, `capture-lead-v4`, `stripe-webhook`
**Date:** 2026-04-15
**Method:** Static analysis of edge function source code against schema

Severity scale: **CRITICAL** (data loss / user locked out / billing state corrupt) · **HIGH** (silent failure, hard to detect) · **MEDIUM** (inconsistency, recoverable) · **LOW** (documented/intentional, no action required)

---

## 1. `create-agent`

### C1 — ~~CRITICAL~~ RESOLVED: OTP consumed before agency invite is validated

**Fixed in:** `bfc5961` — invite token validated (line 94) before OTP consumed (line 110). Verified in source.

---

### C2 — ~~HIGH~~ RESOLVED: Agent invite token not marked used if `update()` silently fails

**Fixed in:** `4e53772` — `{ error: inviteError }` now destructured; returns 500 if invite cannot be marked used so the token is never left reusable. Verified in source.

---

### C3 — ~~MEDIUM~~ RESOLVED: Agent created, magic link silently not stored

**Fixed in:** verified in source — `if (tokenError)` block at lines 327–331 returns 500 with `"Registration failed. Please try again."` and flushes the log. No execution continues past a failed insert. Verified in source.

---

## 2. `capture-lead-v4`

### C4 — ~~HIGH~~ RESOLVED: `agent_notified_at` update unguarded — lead saved but 500 returned to client

**Fixed in:** `4e53772` — wrapped in its own try/catch; logs error via `log.error` but does not rethrow, so the lead save always returns 200. Verified in source.

---

### C5 — LOW (documented/intentional): Contact timeline writes fire-and-forget

**Location:** `capture-lead-v4/index.ts` lines 602–623

`contact_reminders` (5 rows) and `contact_interactions` (1 row) are inserted as fire-and-forget `.then().catch()` calls — explicitly not awaited.

**Scenario:** If either insert fails (rate limit, schema mismatch, DB overload), the errors are logged but the lead is saved and the response is `200`. The lead's contact timeline is missing.

**Why it's LOW:** This pattern is documented in `DECISIONS.md` (2026-04-12) as intentional — "fire-and-forget, never blocks response." The risk is accepted. Sentry captures the errors.

**Note for awareness:** During a DB overload scenario where `contact_reminders` is backed up, a batch of leads could arrive without any timeline entries. There is no retry/backfill mechanism. If the Contact Timeline feature becomes a core product feature (not just a convenience), this should be upgraded to a queued job.

---

## 3. `stripe-webhook`

### C6 — ~~CRITICAL~~ RESOLVED: `agents.update()` errors silently discarded

**Fixed in:** `c622b06` — all 5 handlers now destructure `{ error: updateErrN }` and throw on error, returning 500 to trigger Stripe retry. Verified in source.

---

### C7 — ~~HIGH~~ RESOLVED: No `subscription_events` audit log written

**Fixed in:** `c622b06` — all 5 handlers now insert into `subscription_events` after successful `agents.update()`. Errors are logged but non-fatal (audit log failure doesn't block billing state write). Verified in source.

---

### C8 — ~~MEDIUM~~ RESOLVED: 0-row update returns 200 — unknown agent silently accepted

**Fixed in:** verified in source — all 5 `agents.update()` calls in `stripe-webhook/index.ts` use `{ count: "exact" }` and invoke `reportToSentry(..., 'fatal', ...)` when `count === 0`. Verified in source.

---

## Summary Table

| ID | Function | Scenario | Severity | Status |
|----|----------|----------|----------|--------|
| C1 | create-agent | OTP consumed before invite validated → user locked out on retry | CRITICAL | **RESOLVED** bfc5961 |
| C2 | create-agent | Invite `used_at` silently not written → token reusable | HIGH | **RESOLVED** 4e53772 |
| C3 | create-agent | Magic link not stored → agent created with broken edit URL | MEDIUM | **RESOLVED** (verified in source) |
| C4 | capture-lead-v4 | `agent_notified_at` update throws → lead saved, 500 returned to browser | HIGH | **RESOLVED** 4e53772 |
| C5 | capture-lead-v4 | Contact timeline fire-and-forget → lead without timeline | LOW | Open (intentional) |
| C6 | stripe-webhook | `agents.update()` error discarded → Stripe gets 200, tier never written | CRITICAL | **RESOLVED** c622b06 |
| C7 | stripe-webhook | No `subscription_events` log written in any handler | HIGH | **RESOLVED** c622b06 |
| C8 | stripe-webhook | 0-row update on unknown agent returns 200 → silently dropped | MEDIUM | **RESOLVED** (verified in source) |
| C9 | properties.ts | `retryProperties` button has no handler wired in init.ts | MEDIUM | **RESOLVED** (verified in source) |

---

## 4. Frontend — `js/properties.ts`

### C9 — ~~MEDIUM~~ RESOLVED: `data-action="retryProperties"` button has no handler wired

**Fixed in:** verified in source — `js/event-delegation.js` lines 143-145 handle `case 'retryProperties': if (typeof window.retryProperties === 'function') window.retryProperties(); break;`. Verified in source.

---

### Immediate action priority

1. ~~**C6**~~ **RESOLVED** bfc5961
2. ~~**C1**~~ **RESOLVED** bfc5961
3. ~~**C4**~~ **RESOLVED** 4e53772
4. ~~**C7**~~ **RESOLVED** c622b06
5. ~~**C2**~~ **RESOLVED** 4e53772
6. ~~**C3**~~ **RESOLVED** — verified in source; magic link insert failure returns 500.
7. ~~**C8**~~ **RESOLVED** — verified in source.
8. ~~**C9**~~ **RESOLVED** — verified in source.
