# Engineering Reference

## TypeScript Setup

The project uses TypeScript 6.0.2 in strict mode for all Category A (esbuild-bundled) modules.

### Type checking

```bash
npm run typecheck   # runs tsc --noEmit — fails on any type error
```

Run this before every deploy. The `pre-deploy-check.sh` script also calls it.

### Configuration

`tsconfig.json` at repo root. Key settings:

| Setting | Value | Why |
|---|---|---|
| `strict` | `true` | Enables all strict checks |
| `noUncheckedIndexedAccess` | `true` | Array/Record access returns `T \| undefined` |
| `exactOptionalPropertyTypes` | `true` | Optional props cannot be set to `undefined` explicitly |
| `moduleResolution` | `"bundler"` | Matches esbuild's module resolution |
| `noEmit` | `true` | esbuild handles transpilation — tsc is type-check only |

### File categories

**Category A — TypeScript (esbuild-bundled):** All modules under `js/` that are entry points or imported by entry points via ES `import`. These are `.ts` files, type-checked by `tsc --noEmit` and bundled by `esbuild`.

Entry points: `js/init.ts`, `js/agency-page.ts`, `js/event-delegation.ts`

**Category B — JS with @ts-check (IIFE / standalone):** Standalone scripts loaded via `<script>` tags. These remain `.js` files but have `// @ts-check` at the top and JSDoc annotations on key variables. Checked by the TypeScript language server in editors; not part of the `tsc --noEmit` pass.

Category B files: `js/dashboard.js`, `js/edit.js`, `js/join.js`, `js/agency-dashboard.js`, `js/pricing.js`, `js/landing-behavior.js`, `js/landing-chip-anim.js`, `js/cookie-consent.js`, `js/sd-config.js`, `js/gtag-init.js`, `js/sentry-init.js`, `js/async-css.js`

### Type coverage target

**>= 95% of Category A lines are type-annotated.** The remaining ~5% are necessary `as unknown as T` double-casts for Supabase `Json` columns (facilities, nearby_locations) and partial select results that are narrower than the full generated Row type.

### Common patterns

**Supabase Json columns to typed arrays:**
```typescript
const facilities: Facility[] = Array.isArray(row.facilities) && row.facilities.length
  ? row.facilities as unknown as Facility[] : [];
```

**Columns not in generated DB types (e.g. land_area):**
```typescript
const ext = result as Property & { land_area?: number | null };
```

**Partial select result cast:**
```typescript
const agent = data as unknown as Agent;
```

**noUncheckedIndexedAccess fallbacks:**
```typescript
const icon = ICONS[key] ?? '';
const first = arr[0] ?? defaultValue;
```

**Timer types:**
```typescript
let timer: ReturnType<typeof setTimeout> | null = null;
```

**Lazy module refs:**
```typescript
let _mod: Promise<unknown> | null = null;
```

---

## Observability

### Sentry

- **SDK:** Loaded from CDN (`browser.sentry-cdn.com`) in `js/sentry-init.ts`
- **DSN:** `https://689d6d66d9267e827b1d4129c4fe4ee8@o4511110584926208.ingest.us.sentry.io/4511110595215360`
- **Releases:** Tagged with git SHA on every production deploy via `sentry-cli` in CI
- **Source maps:** Uploaded to Sentry, then deleted from `dist/` before Netlify deploy
- **Release config:** `dist/release-config.js` written at build time; sets `window.SENTRY_RELEASE` before `sentry-init.js` loads
- **Error helper:** `js/errors.ts` → `reportError(context, error, extras?)` used in esbuild-processed modules; exposed as `window.reportError` for plain IIFE scripts (dashboard.js, edit.js, join.js)

### Sentry Alert Rules

| Alert | Trigger | Channel |
|-------|---------|---------|
| capture-lead-v4 error rate | > 1% in 5 min window | Slack `#engineering` |
| stripe-webhook signature failure | Any occurrence | Slack `#engineering` + Email |
| send-magic-link rate limit | > 10/hour | Slack `#engineering` |
| JS error rate spike | > 3× 7-day baseline | Slack `#engineering` |

Configure in: **Sentry → [project] → Alerts**

Filter tags used by alert rules:
- `tags[context]` — set by `reportError(context, ...)` in `js/errors.ts`
- `tags[event]` — set by structured edge function logs (`signature_failure`, `rate_limit_exceeded`)

### Required CI Secrets

Add these in **GitHub → Repository → Settings → Secrets → Actions**:

| Secret | Where to get it |
|--------|----------------|
| `SENTRY_AUTH_TOKEN` | Sentry → Settings → Auth Tokens → Create Internal Token (scope: `project:releases`) |
| `SENTRY_ORG` | Sentry → Settings → General → Organization Slug |
| `SENTRY_PROJECT` | Sentry → Settings → Projects → [your project] → Slug |

### Edge Function Structured Logging

Every HTTP-handler edge function (39 of 41) emits JSON-structured logs via `_shared/logger.ts`.

Excluded from logging (Supabase scheduler invocation — `request_id` is not meaningful):
- `sync-rem-offplan`
- `lead-followup-nagger`

Log format:
```json
{
  "function": "capture-lead-v4",
  "request_id": "a1b2c3d4-e5f6-...",
  "event": "lead_captured",
  "agent_id": "uuid-here",
  "status": 200,
  "duration_ms": 342,
  "timestamp": "2026-04-03T12:00:00.000Z"
}
```

Logs are visible in **Supabase Dashboard → Edge Functions → Logs**.
Filter by `event` or `request_id` for incident tracing.

Special events:
- `signature_failure` — stripe-webhook: Stripe signature verification failed (potential replay attack)
- `rate_limit_exceeded` — send-magic-link, send-otp, respond-to-match, submit-mortgage: rate limit hit
- `auth_failed` — auth token invalid or expired
- `bad_request` — malformed or missing request body fields

---

### Rotating the Supabase anon key

The public anon key appears in two places — update both simultaneously:

1. `js/sd-config.js` — `window.SD_CONFIG.SUPABASE_ANON_KEY`
2. `js/config.ts` — `export const SUPABASE_ANON_KEY`

The anon key is safe to expose (it is a public read-only key scoped by RLS policies).
