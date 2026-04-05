# Phase 5 — Observability & Alerting

**Goal:** When something breaks, we know in < 5 minutes with full context.

**DD question answered:** "How fast do you detect issues?"

---

## Overview

Five tasks, executed in this order:

1. Sentry releases + source map upload in CI
2. `js/errors.ts` error helper
3. Replace raw catch blocks in dashboard.ts / edit.ts / join.ts
4. Structured logging wrapper for all edge functions
5. Sentry alert rules (manual config + documentation)

Tasks 1, 2, and 4 are independent of each other and can be done in parallel.
Task 3 depends on Task 2 (needs the `reportError` helper).
Task 5 depends on Tasks 1–4 being complete (documents the full setup).

---

## Task 1: Sentry Releases + Source Map Upload in CI

**Files:**
- `.github/workflows/ci.yml`
- `scripts/build-js.js`
- `js/sentry-init.ts`
- HTML files that load `sentry-init.js`: `index.html`, `dashboard.html`, `edit.html`, `join.html`, `landing.html`, `pricing.html` (and any others — `grep -rl "sentry-init" *.html` to confirm the full list)

**Action:**

### 1a. Add sentry-cli to the deploy job

In `.github/workflows/ci.yml`, find the `deploy` job (currently ends with `Post-deploy smoke test`).

Add a step **before** `Deploy to Netlify`:

```yaml
      - name: Install sentry-cli
        run: npm install -g @sentry/cli@2

      - name: Create Sentry release + upload source maps
        env:
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
          SENTRY_ORG: ${{ secrets.SENTRY_ORG }}
          SENTRY_PROJECT: ${{ secrets.SENTRY_PROJECT }}
          SENTRY_RELEASE: ${{ github.sha }}
        run: |
          sentry-cli releases new "$SENTRY_RELEASE"
          sentry-cli releases set-commits --auto "$SENTRY_RELEASE"
          sentry-cli releases files "$SENTRY_RELEASE" upload-sourcemaps dist/ \
            --url-prefix "~/" \
            --rewrite
          sentry-cli releases finalize "$SENTRY_RELEASE"
```

Add a step **after** the source map upload (still before `Deploy to Netlify`) to remove source maps from `dist/` so they are never served publicly:

```yaml
      - name: Remove source maps from dist (not for public serving)
        run: |
          find dist -name "*.map" -delete
          echo "Removed .map files from dist/:"
          find dist -name "*.map" | wc -l
```

Add a step after `Deploy to Netlify` to associate the deployment:

```yaml
      - name: Associate Sentry release with deploy
        env:
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
          SENTRY_ORG: ${{ secrets.SENTRY_ORG }}
          SENTRY_PROJECT: ${{ secrets.SENTRY_PROJECT }}
          SENTRY_RELEASE: ${{ github.sha }}
        run: |
          sentry-cli releases deploys "$SENTRY_RELEASE" new -e production
```

### 1b. Inject release tag via window global (Option A)

`sentry-init.js` is a Category B plain script loaded via `<script src="..." defer>` — it is NOT processed by esbuild, so esbuild `define` substitution does not apply. The release SHA must reach it via a `window` global written at build time.

**Step 1: Update `scripts/build-js.js`** to write `dist/release-config.js` after the esbuild call. Add this block after the `esbuild.build(...)` chain (after `.catch(() => process.exit(1))`):

```javascript
// Write release-config.js so sentry-init.js (a plain script, not esbuild-processed)
// can read window.SENTRY_RELEASE at runtime.
const sha = process.env.SENTRY_RELEASE || process.env.COMMIT_REF || process.env.GITHUB_SHA || 'dev';
fs.writeFileSync(
  'dist/release-config.js',
  `window.SENTRY_RELEASE = ${JSON.stringify(sha)};\n`,
  'utf8'
);
console.log(`build-js: dist/release-config.js written (SENTRY_RELEASE=${sha})`);
```

Note: `SENTRY_RELEASE` is set in CI from `${{ github.sha }}`; `COMMIT_REF` is Netlify's built-in SHA variable for branch/preview deploys.

**Step 2: Update `js/sentry-init.ts`** to read `window.SENTRY_RELEASE` instead of `__SENTRY_RELEASE__`:

```typescript
if (window.Sentry) {
  Sentry.init({
    dsn: 'https://689d6d66d9267e827b1d4129c4fe4ee8@o4511110584926208.ingest.us.sentry.io/4511110595215360',
    environment: /sellingdubai\.(ae|com)$/.test(location.hostname) ? 'production' : 'development',
    tracesSampleRate: 0.2,
    sendDefaultPii: false,
    release: (window as any).SENTRY_RELEASE || 'dev',
  });
}
```

**Step 3: Add `<script src="/dist/release-config.js">` to HTML files** that load `sentry-init.js`. Place it **immediately before** the `sentry-init.js` script tag so the global is available when Sentry initialises:

```html
<!-- Must come before sentry-init.js -->
<script src="/dist/release-config.js"></script>
<script src="/js/sentry-init.js" defer></script>
```

Run `grep -rl "sentry-init" *.html` to find every HTML file that needs this change.

### 1c. Document required secrets

Add a comment block near the top of `ci.yml` (after the `on:` block) documenting all required GitHub Actions secrets:

```yaml
# Required GitHub Actions secrets:
#   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
#   NETLIFY_AUTH_TOKEN, NETLIFY_SITE_ID
#   BILLING_LIVE
#   SENTRY_AUTH_TOKEN  — from Sentry Settings > Auth Tokens > Create Internal Token
#   SENTRY_ORG         — your Sentry org slug (e.g. "sellingdubai")
#   SENTRY_PROJECT     — your Sentry project slug (e.g. "sellingdubai-web")
```

**Verify:**

```bash
# Confirm .map files exist in dist before deletion step fires
npm run build && find dist -name "*.map" | head

# Confirm no .map files would remain after deletion
npm run build && find dist -name "*.map" -delete && find dist -name "*.map" | wc -l
# Should print: 0

# Confirm release-config.js is written by the build
npm run build && cat dist/release-config.js
# Should print: window.SENTRY_RELEASE = "dev";  (or the SHA if env var is set)

# Confirm sentry-init.ts uses window.SENTRY_RELEASE
grep "SENTRY_RELEASE" js/sentry-init.ts

# Confirm HTML files load release-config.js before sentry-init.js
grep -A1 "release-config" index.html dashboard.html

# Dry-run sentry-cli syntax (no token needed to check syntax)
npx @sentry/cli@2 releases --help
```

**Done:**
- Deploy job creates a Sentry release tagged with `$GITHUB_SHA`
- Source maps uploaded to Sentry then deleted from `dist/` before Netlify deploy
- `dist/release-config.js` written at build time; sets `window.SENTRY_RELEASE` to the SHA
- `sentry-init.ts` reads `window.SENTRY_RELEASE` — release tag present in every Sentry event
- All HTML files load `release-config.js` before `sentry-init.js`
- No `.map` files are served from the production domain
- `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` documented as required CI secrets

---

## Task 2: Error Helper — `js/errors.ts`

**Files:**
- `js/errors.ts` (new file)

**Action:**

Create `js/errors.ts` with the following content exactly:

```typescript
// js/errors.ts — Centralised error reporting for SellingDubai client JS
//
// Usage (esbuild-processed modules only — imported through init.ts):
//   import { reportError } from './errors';
//   reportError('dashboard/verifyToken', error);
//
// Usage (Category B plain IIFE scripts — dashboard.js, edit.js, join.js):
//   window.reportError('dashboard/functionName', error);
//   // Guard for the rare case init bundle hasn't executed yet:
//   if (typeof window.reportError === 'function') window.reportError(ctx, err);
//   else console.error(ctx, err);

/**
 * Log an error to console and capture it in Sentry (if loaded).
 *
 * @param context  Human-readable location string, e.g. "dashboard/sendMagicLink"
 * @param error    The caught value — may be Error, string, or unknown
 * @param extras   Optional key-value pairs added to the Sentry scope
 */
export function reportError(
  context: string,
  error: unknown,
  extras?: Record<string, unknown>
): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${context}]`, message, error);

  if (typeof window !== 'undefined' && window.Sentry) {
    window.Sentry.withScope((scope: { setTag: (k: string, v: string) => void; setExtras: (e: Record<string, unknown>) => void }) => {
      scope.setTag('context', context);
      if (extras) scope.setExtras(extras);
      window.Sentry.captureException(
        error instanceof Error ? error : new Error(message)
      );
    });
  }
}

// Expose as a window global so Category B plain IIFE scripts (dashboard.js,
// edit.js, join.js) can call window.reportError() without an ES import.
// This file is bundled through init.ts by esbuild, so this assignment runs
// before any deferred plain script executes.
(window as any).reportError = reportError;
```

Notes on the implementation:
- `error instanceof Error ? error.message : String(error)` satisfies the `unknown` type constraint — never use `any`
- `window.Sentry` guard ensures this is a no-op in environments where Sentry hasn't loaded (local dev without network, unit test runners)
- The `context` tag in Sentry enables alert rules that filter by context string (e.g. `context:capture-lead-v4`)
- `window.reportError = reportError` at the bottom is what makes Task 3's plain-script pattern work

**Verify:**

```bash
# Confirm file exists and exports reportError
grep "export function reportError" js/errors.ts

# Confirm window global assignment is present
grep "window.*reportError" js/errors.ts

# TypeScript check (once Phase 4 tsconfig exists)
npx tsc --noEmit --strict js/errors.ts 2>/dev/null || echo "run tsc from project root after Phase 4"
```

**Done:**
- `js/errors.ts` exists and exports `reportError(context, error, extras?)`
- Function accepts `unknown` error type (not `any`)
- Sends to Sentry with `context` tag and optional extras
- Safe no-op when `window.Sentry` is absent
- `window.reportError` assigned so Category B IIFE scripts can call it without importing

---

## Task 3: Replace Raw Catch Blocks in dashboard.js / edit.js / join.js

**Files:**
- `js/dashboard.js` (Category B plain IIFE script — NOT esbuild-processed, no ES imports)
- `js/edit.js` (Category B plain IIFE script — NOT esbuild-processed, no ES imports)
- `js/join.js` (Category B plain IIFE script — NOT esbuild-processed, no ES imports)

**Important:** These files are loaded via `<script src="...">` without `type="module"`. They are NOT bundled by esbuild. Adding a bare ES `import` statement to them would throw a `SyntaxError` in the browser. Do NOT add `import { reportError }` to these files. Use the `window.reportError` global set by `js/errors.ts` (which runs via the init bundle before these deferred scripts execute).

**Current catch block counts (verified via `grep -c "catch"`):**
- `dashboard.js`: 17 catch blocks (lines 77, 113, 209, 299, 314, 455, 599, 789, 827, 860, 886 — plus 6 more)
- `edit.js`: 18 catch blocks
- `join.js`: 13 catch blocks (includes 3 non-critical localStorage/clipboard guards)

**Goal:** No file with > 5 catch blocks.

**Action:**

### Step 1: Replace significant catch blocks using the window global

For each `catch (e)` block that currently only logs to console or sets an error message, replace with the `window.reportError` global. Use a guard so the catch degrades gracefully if the init bundle hasn't run yet:

**Replace this pattern:**
```javascript
} catch (e) {
  console.error('some message', e);
  showError('Something went wrong');
}
```

**With this pattern:**
```javascript
} catch (e) {
  if (typeof window.reportError === 'function') window.reportError('dashboard/functionName', e);
  else console.error('[dashboard/functionName]', e);
  showError('Something went wrong');
}
```

Use a context string that identifies the file and function: `'dashboard/verifyToken'`, `'dashboard/saveProfile'`, `'edit/saveAgent'`, `'join/submitStep2'`, etc.

Do NOT add any `import` statement to these files.

### Step 2: Collapse non-critical catch blocks

Non-critical catches (localStorage, clipboard, non-blocking UI concerns) do not need `window.reportError`. Where multiple are consecutive, collapse:

```javascript
// Before (4 separate try/catch for localStorage operations):
try { data = JSON.parse(raw); } catch { data = {}; }
try { localStorage.setItem(k, v); } catch (e) { console.warn(e); }
try { data = await res.json(); } catch { data = {}; }
try { document.execCommand('copy'); resolve(); } catch (e) { reject(e); }

// After — keep as-is (these are already minimal one-liners)
// They count toward the 5-block limit but are acceptable non-critical guards
```

### Step 3: Target counts

After this task:
- `dashboard.js`: ≤ 5 catch blocks (from 17 — collapse or reportError-ify 12+ blocks)
- `edit.js`: ≤ 5 catch blocks (from 18)
- `join.js`: ≤ 5 catch blocks (from 13 — 3 are non-critical one-liners, keep them; convert the 7+ significant ones to `window.reportError`)

Strategy for staying under 5: The top-level IIFE `try/catch` wrapper counts as 1. Per-operation critical catches get `window.reportError`. Non-critical clipboard/localStorage one-liners: consolidate or accept 1-2.

### Step 4: Verify counts

```bash
grep -c "catch" js/dashboard.js
grep -c "catch" js/edit.js
grep -c "catch" js/join.js
# All three must print 5 or less
```

**Verify:**

```bash
# Primary check — all three files at or under 5 catch blocks
for f in js/dashboard.js js/edit.js js/join.js; do
  count=$(grep -c "catch" "$f")
  echo "$f: $count catch blocks"
  [ "$count" -le 5 ] && echo "  PASS" || echo "  FAIL — still over 5"
done

# Confirm window.reportError pattern used (no bare ES import)
grep "window.reportError" js/dashboard.js js/edit.js js/join.js | head -5

# Confirm no ES import statement was accidentally added
! grep -n "^import " js/dashboard.js js/edit.js js/join.js && echo "No ES imports: OK"

# Build still passes
npm run build
```

**Done:**
- All three files have ≤ 5 catch blocks
- All significant catch blocks call `window.reportError(context, error)` with a descriptive context string and a `console.error` fallback guard
- No ES `import` statement added to any of the three files
- `npm run build` still passes

---

## Task 4: Structured Logging in Edge Functions

**Files:**
- `supabase/functions/_shared/logger.ts` (new file — shared logging utility)
- All 41 edge functions in `supabase/functions/` (update each `index.ts`)

**Excluded from logging:**
- `sync-rem-offplan` — invoked by Supabase scheduler, not external callers; `request_id` is not meaningful for scheduled jobs
- `lead-followup-nagger` — invoked by Supabase scheduler, not external callers; `request_id` is not meaningful for scheduled jobs

**Action:**

### Step 1: Create the shared logger

Create `supabase/functions/_shared/logger.ts`:

```typescript
// _shared/logger.ts — Structured request logging for SellingDubai edge functions
//
// Usage:
//   import { createLogger, Logger } from '../_shared/logger.ts';
//
//   Deno.serve(async (req: Request) => {
//     const log = createLogger('function-name', req);
//     const start = Date.now();
//
//     try {
//       // ... handler logic ...
//       log({ event: 'success', status: 200, agent_id: agentId });
//       return new Response(...);
//     } catch (err) {
//       log({ event: 'error', status: 500, error: String(err) });
//       return new Response(..., { status: 500 });
//     } finally {
//       log.flush(Date.now() - start);
//     }
//   });

export interface LogPayload {
  event: string;
  agent_id?: string;
  status?: number;
  error?: string;
  [key: string]: unknown;
}

export interface LogEntry extends LogPayload {
  function: string;
  request_id: string;
  duration_ms?: number;
  timestamp: string;
}

/** Typed Logger interface — avoids assigning properties to a bare function. */
export interface Logger {
  (payload: LogPayload): void;
  flush: (durationMs: number) => void;
  requestId: string;
}

export function createLogger(functionName: string, req: Request): Logger {
  // Honour X-Request-Id if caller provides one (useful for tracing)
  const incomingId = req.headers.get('x-request-id');
  const request_id = incomingId ?? crypto.randomUUID();

  const entries: LogEntry[] = [];

  const logger: Logger = Object.assign(
    function log(payload: LogPayload): void {
      const entry: LogEntry = {
        ...payload,
        function: functionName,
        request_id,
        timestamp: new Date().toISOString(),
      };
      entries.push(entry);
      console.log(JSON.stringify(entry));
    },
    {
      flush(durationMs: number): void {
        if (entries.length > 0) {
          const last = entries[entries.length - 1];
          // Only emit the final summary line if it doesn't duplicate the last log
          if (last.duration_ms === undefined) {
            console.log(JSON.stringify({
              ...last,
              duration_ms: durationMs,
            }));
          }
        }
      },
      requestId: request_id,
    }
  );

  return logger;
}
```

Note on the `Logger` interface: Using `Object.assign` to attach `flush` and `requestId` to the callable function produces a value that satisfies the typed `Logger` interface and passes `deno check` without any property-assignment-on-function TypeScript warnings.

### Step 2: Add structured logging to each edge function

For each `index.ts` in the 39 HTTP-handler edge functions, make the following minimal additions:

1. Import the logger at the top:
   ```typescript
   import { createLogger } from '../_shared/logger.ts';
   ```

2. Inside `Deno.serve(async (req: Request) => {`, immediately after the opening:
   ```typescript
   const log = createLogger('function-name', req);
   const _start = Date.now();
   ```
   Use the actual function directory name as `'function-name'` (e.g. `'capture-lead-v4'`, `'stripe-webhook'`).

3. Before each `return new Response(...)`, add a log call:
   ```typescript
   // Success path:
   log({ event: 'success', agent_id: agentId ?? undefined, status: 200 });

   // Error path:
   log({ event: 'error', status: 500, error: String(err) });

   // Auth failure:
   log({ event: 'auth_failed', status: 401 });

   // Signature failure (stripe-webhook):
   log({ event: 'signature_failure', status: 401 });
   ```

4. Wrap the outer try/catch in a `finally` block (or add `finally` if there is no existing `try`):
   ```typescript
   } finally {
     log.flush(Date.now() - _start);
   }
   ```

   For functions without an outer try/catch, add:
   ```typescript
   // At the very end of Deno.serve, after all returns:
   // Note: log.flush() is called in each code path above via log({...})
   ```

**Special cases:**
- `stripe-webhook`: Log `{ event: 'signature_failure', status: 401 }` where `verifyStripeSignature` returns false
- `send-magic-link`: Log `{ event: 'rate_limit_exceeded', status: 429 }` on rate-limit hit
- `capture-lead-v4`: Log `{ event: 'lead_captured', agent_id, status: 200 }` on success

**Log format example (what Supabase logs will show):**
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

**Verify:**

```bash
# Logger file exists
ls supabase/functions/_shared/logger.ts

# All non-cron functions import the logger
for fn in capture-lead-v4 stripe-webhook send-magic-link verify-broker create-agent manage-properties; do
  grep -l "createLogger" supabase/functions/$fn/index.ts && echo "$fn: OK"
done

# Spot check: capture-lead-v4 has request_id in output
grep "createLogger\|log({" supabase/functions/capture-lead-v4/index.ts | head -5

# Type check logger (Deno)
cd supabase/functions && deno check _shared/logger.ts
```

**Done:**
- `_shared/logger.ts` exports `createLogger(functionName, req)` returning a typed `Logger`
- `Logger` interface defined — no bare function property assignment warnings from `deno check`
- Every HTTP-handler edge function (39 of 41) emits at least one structured log line per request
- Log format always includes: `function`, `request_id`, `event`, `status`, `timestamp`
- `duration_ms` included in the final log line per request
- `agent_id` included where available (auth-gated functions)
- `sync-rem-offplan` and `lead-followup-nagger` explicitly excluded (Supabase scheduler invocation — `request_id` is not meaningful)

---

## Task 5: Sentry Alert Rules — Config + Documentation

**Files:**
- `docs/ENGINEERING.md` (update Observability section)

Note: Sentry alert rules are configured in the Sentry UI (not in code). This task documents the exact configuration to apply and confirms it is applied.

**Action:**

### Step 1: Apply alert rules in Sentry UI

Navigate to: **Sentry → [your project] → Alerts → Create Alert → Issues** for issues-based alerts, or **Metric Alerts** for rate-based.

Apply these four alert rules:

---

**Alert 1: capture-lead-v4 error rate > 1%**

- Type: Metric Alert — Error Rate
- Name: `capture-lead-v4 error rate spike`
- Filter: `transaction:/functions/v1/capture-lead-v4` OR tag `context:capture-lead-v4`
- Condition: error rate > 1% over 5-minute window
- Threshold: `critical` at 1%, `warning` at 0.5%
- Action: Notify Slack `#engineering` channel
- Resolve threshold: error rate < 0.5% for 5 minutes

Alternative (simpler if metric alerts unavailable on free plan):
- Type: Issue Alert
- Condition: An issue is seen more than 3 times in 5 minutes
- Filter: `tags[context] = capture-lead-v4`
- Action: Notify Slack `#engineering`

---

**Alert 2: stripe-webhook signature failure — immediate**

- Type: Issue Alert
- Name: `stripe-webhook signature failure`
- Condition: An issue is first seen OR seen more than 1 time in 1 minute
- Filter: `tags[event] = signature_failure` (set by the structured logger in Task 4)
  - Fallback filter if tag not available: message contains `signature`
- Action: Notify Slack `#engineering` + Email owner
- No resolve threshold (each occurrence is critical)

---

**Alert 3: send-magic-link rate limit abuse**

- Type: Issue Alert
- Name: `send-magic-link rate limit spike`
- Condition: An issue is seen more than 10 times in 60 minutes
- Filter: `tags[event] = rate_limit_exceeded`
- Action: Notify Slack `#engineering`
- Note: This detects potential credential-stuffing or abuse of the magic link endpoint

---

**Alert 4: JS error rate spike > 3x 7-day baseline**

- Type: Metric Alert — Error Rate (Crash Free Rate alert)
- Name: `JS error rate 3x spike`
- Dataset: Errors
- Condition: error count > 3x the 7-day rolling average
  - Sentry calls this "Anomaly Detection" — enable if on Business plan
  - On free/team plan: set static threshold based on current baseline (check Issues → Trends to get current hourly rate, multiply by 3)
- Action: Notify Slack `#engineering`

---

### Step 2: Install Sentry Slack integration

Navigate to: **Sentry → Settings → Integrations → Slack → Add to Slack**

Follow the OAuth flow to connect the `#engineering` channel. Once connected, Slack will appear as an action option in all alert rules above.

### Step 3: Update ENGINEERING.md

In `docs/ENGINEERING.md`, find or create the **Observability** section and add:

```markdown
## Observability

### Sentry

- **SDK:** Loaded from CDN (`browser.sentry-cdn.com`) in `js/sentry-init.ts`
- **DSN:** `https://689d6d66d9267e827b1d4129c4fe4ee8@o4511110584926208.ingest.us.sentry.io/4511110595215360`
- **Releases:** Tagged with git SHA on every production deploy via `sentry-cli` in CI
- **Source maps:** Uploaded to Sentry, then deleted from `dist/` before Netlify deploy
- **Release config:** `dist/release-config.js` written at build time; sets `window.SENTRY_RELEASE` before `sentry-init.js` loads
- **Error helper:** `js/errors.ts` → `reportError(context, error, extras?)` used in esbuild-processed modules; exposed as `window.reportError` for plain IIFE scripts

### Sentry Alert Rules

| Alert | Trigger | Channel |
|-------|---------|---------|
| capture-lead-v4 error rate | > 1% in 5 min window | Slack `#engineering` |
| stripe-webhook signature failure | Any occurrence | Slack `#engineering` + Email |
| send-magic-link rate limit | > 10/hour | Slack `#engineering` |
| JS error rate spike | > 3x 7-day baseline | Slack `#engineering` |

### Edge Function Structured Logging

Every edge function emits JSON-structured logs to Supabase log drain:

```json
{
  "function": "capture-lead-v4",
  "request_id": "uuid",
  "event": "lead_captured",
  "agent_id": "uuid",
  "status": 200,
  "duration_ms": 342,
  "timestamp": "2026-04-03T12:00:00.000Z"
}
```

Logs are visible in Supabase Dashboard → Edge Functions → Logs.
Filter by `event` or `request_id` for incident tracing.
```

Also take a screenshot of the Sentry dashboard showing the four alert rules active and save it to `docs/sentry-alerts-screenshot.png`. Reference it in ENGINEERING.md:

```markdown
### Alert Configuration Screenshot

![Sentry Alerts](./sentry-alerts-screenshot.png)
```

**Verify:**

```bash
# ENGINEERING.md has Observability section
grep -n "## Observability\|Sentry Alert Rules\|Structured Logging" docs/ENGINEERING.md

# Screenshot exists
ls docs/sentry-alerts-screenshot.png

# Four alert names documented
grep -c "capture-lead-v4\|stripe-webhook signature\|rate limit spike\|JS error rate" docs/ENGINEERING.md
# Should print: 4
```

**Done:**
- All 4 Sentry alert rules created and active in Sentry UI
- Slack `#engineering` receives test notification from each alert rule
- Alert configuration documented in `docs/ENGINEERING.md` with screenshot
- ENGINEERING.md Observability section covers: SDK, releases, source maps, release-config.js, error helper, alert table, log format

---

## Phase 5 Completion Checks

Run these after all tasks are complete:

```bash
# 1. Source maps deleted from dist
npm run build
find dist -name "*.map" | wc -l
# Expected: 0 (maps exist before deletion step, 0 after)

# 2. release-config.js written by build
cat dist/release-config.js
# Expected: window.SENTRY_RELEASE = "dev";

# 3. Catch block counts
for f in js/dashboard.js js/edit.js js/join.js; do
  count=$(grep -c "catch" "$f" 2>/dev/null || echo "file not found")
  echo "$f: $count"
done
# Each must be ≤ 5

# 4. window.reportError pattern used — no ES imports in plain scripts
grep "window.reportError" js/dashboard.js js/edit.js js/join.js | head -5
! grep -n "^import " js/dashboard.js js/edit.js js/join.js && echo "No ES imports: OK"

# 5. errors.ts exposes window global
grep "window.*reportError" js/errors.ts

# 6. Logger in _shared
ls supabase/functions/_shared/logger.ts

# 7. deno check passes on logger
(cd supabase/functions && deno check _shared/logger.ts)

# 8. Structured logging wired in critical functions
for fn in capture-lead-v4 stripe-webhook send-magic-link; do
  grep -l "createLogger" supabase/functions/$fn/index.ts && echo "$fn: OK" || echo "$fn: MISSING"
done

# 9. ENGINEERING.md Observability section exists
grep "## Observability" docs/ENGINEERING.md

# 10. Full build passes
npm run build
```

---

## Secrets to Add (human action required before first deploy)

Add these in **GitHub → Repository → Settings → Secrets → Actions**:

| Secret | Where to get it |
|--------|----------------|
| `SENTRY_AUTH_TOKEN` | Sentry → Settings → Auth Tokens → Create Internal Token (scope: `project:releases`) |
| `SENTRY_ORG` | Sentry → Settings → General → Organization Slug |
| `SENTRY_PROJECT` | Sentry → Settings → Projects → [your project] → Slug |

Also add `SENTRY_AUTH_TOKEN` and `SENTRY_ORG` / `SENTRY_PROJECT` to **Netlify → Site → Environment Variables** if any Netlify build plugin needs them (not required for this plan — CI handles sentry-cli).
