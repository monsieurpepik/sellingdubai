# Coding Conventions

**Analysis Date:** 2026-03-27

## Naming Patterns

**Files:**
- Frontend JS modules: `kebab-case.js` (e.g., `lead-modal.js`, `agent-page.js`, `property-detail.js`)
- Edge functions (Deno/TypeScript): `index.ts` inside a `kebab-case/` directory under `edge-functions/`
- Test files: `index.test.ts` co-located alongside `index.ts` in each edge function directory
- HTML pages: `kebab-case.html` at root (e.g., `pricing.html`, `privacy.html`)
- CSS: `kebab-case.css` at root (e.g., `landing-input.css`, `landing-output.css`, `styles.css`)

**Functions:**
- camelCase for all exported and local functions: `getAgentSlug`, `escHtml`, `dubaiTime`, `buildEmailHtml`, `getCorsHeaders`
- Boolean helpers: prefixed with `is` or described as verbs: `skipIfRateLimited`, `handleImgError`
- Window-attached global handlers: camelCase assigned to `window.*`: `window.openLead`, `window.closeLead`, `window.submitLead`, `window.saveContact`

**Variables:**
- camelCase for local vars: `cleanEmail`, `agentRecentCount`, `waPhone`, `ipHash`
- UPPER_SNAKE_CASE for module-level constants: `ALLOWED_ORIGINS`, `FB_GRAPH_API_VERSION`, `LEAD_COOLDOWN_MS`, `MAX_LENGTHS`, `DEMO_MODE`, `CAPTURE_URL`, `LOG_EVENT_URL`
- Private/module-scoped variables prefixed with underscore: `_previousFocus`, `_lastLeadSubmit`

**Types (TypeScript edge functions):**
- Inline object type annotations for function parameters: `agent: { name: string; slug: string }`
- `Record<string, string>` for plain string maps
- `Record<string, unknown>` for generic JSON bodies in tests

**CSS class names:**
- Tailwind utility classes used inline in HTML templates
- Custom BEM-like component classes in `styles.css`: `prop-tag-just-listed`, `prop-tag-available`, `img-error`
- State modifier classes: `open`, `hidden` toggled via `classList.add/remove/toggle`

## Code Style

**Formatting:**
- No Prettier or ESLint config detected — formatting is manual/editor-enforced
- Single quotes for strings in JS: `'profile'`, `'lead-modal'`
- Double quotes for strings in TypeScript: `"Email is required."`, `"Agent not found."`
- Semicolons present in both JS and TS
- Arrow functions preferred for callbacks and inline helpers
- Template literals used for URL construction and multi-line HTML strings

**Linting:**
- No ESLint or Biome config present — no automated lint enforcement
- TypeScript strict mode not confirmed; edge functions use `!` non-null assertions extensively: `Deno.env.get("SUPABASE_URL")!`

## Import Organization

**Frontend JS (ES modules):**
```javascript
// 1. External/vendor (loaded via script tags in HTML, not imported)
// 2. Config constants
import { CAPTURE_URL } from './config.js';
// 3. Utilities
import { logEvent } from './analytics.js';
// 4. State
import { currentAgent } from './state.js';
```
- All imports are relative with explicit `.js` extension (required for browser ES modules)
- No bundler path aliases — relative paths only

**Edge functions (Deno):**
```typescript
// 1. Remote Deno std library
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
// 2. Remote npm packages via esm.sh
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
```
- All Deno imports use full URLs (no import maps detected)
- `deno.lock` at root locks remote dependency hashes

**Path Aliases:**
- None — all imports are relative paths or full URLs

## Error Handling

**Edge functions pattern — try/catch at top level:**
```typescript
Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    // ... business logic
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: cors });
  } catch (e) {
    console.error("function-name error:", e);
    return new Response(
      JSON.stringify({ error: "Internal server error." }),
      { status: 500, headers: cors }
    );
  }
});
```

**Validation errors return 400 with a human-readable `error` field:**
```typescript
return new Response(JSON.stringify({ error: "Email is required." }), { status: 400, headers: cors });
```

**Security-sensitive errors use silent 200 (anti-enumeration pattern):**
```typescript
// Unregistered email, rate-limited, duplicate — all return identical 200
return new Response(
  JSON.stringify({ success: true, message: "If this email is registered, you'll receive a magic link." }),
  { status: 200, headers: cors }
);
```

**Fire-and-forget side effects use nested try/catch with no rethrow:**
```typescript
try {
  await fetch("https://api.resend.com/emails", { ... });
} catch (e) {
  console.error("Email notification failed:", e);
  // Don't fail the request
}
```

**Frontend JS — inline error display:**
```javascript
try {
  const res = await fetch(CAPTURE_URL, { ... });
  const data = await res.json();
  if (!res.ok) {
    errEl.textContent = data.error || 'Something went wrong. Please try again.';
    errEl.classList.add('show');
    return;
  }
} catch (e) {
  errEl.textContent = e.name === 'AbortError'
    ? 'Request timed out. Please check your connection and try again.'
    : 'Connection error. Please try again.';
  errEl.classList.add('show');
}
```

**Module load failures are isolated:**
```javascript
// In js/init.js — each module loaded independently so one failure doesn't kill the app
try { await load(); }
catch (e) { console.error(`[${name}] failed to load:`, e); }
```

## Logging

**Framework:** `console.error` / `console.warn` — no structured logging library

**Patterns:**
- Edge functions: `console.error("function-name error:", e)` for top-level catch; `console.error("Descriptive label:", detail)` for specific failures
- Frontend init: `console.error('[module-name]', e)` using bracket-prefixed module label
- `console.warn` for non-critical skips: `console.warn("Email skipped — no RESEND_API_KEY...")`
- Error tracking hook via `window.__sdTrackError` called for critical frontend failures: `window.__sdTrackError('Agent init failed: ' + e.message, { slug, stack })`

## Comments

**When to Comment:**
- Section dividers use ASCII box banners: `// ==========================================` or `// ===========================================`
- File-level block comment explains purpose, API contract, and run command
- Inline comments explain security reasoning: `// Don't reveal if email exists or not — prevents email enumeration`
- Inline comments for non-obvious logic: `// Hash the IP for privacy (don't store raw IPs)`

**JSDoc/TSDoc:** Not used — no `@param` or `@returns` annotations

## Function Design

**Size:** Functions are generally single-responsibility, 10–50 lines. `buildEmailHtml` in `capture-lead-v4/index.ts` (77 lines) is the largest pure function.

**Parameters:**
- Prefer destructuring in edge functions: `const { email } = await req.json()`
- Typed object parameters in TypeScript: `agent: { name: string; slug: string }`

**Return Values:**
- Edge functions always return `new Response(JSON.stringify({...}), { status, headers: cors })`
- Success shape: `{ success: true, ...data }` or `{ success: true, message: "..." }`
- Error shape: `{ error: "Human-readable sentence ending in period." }`

## Module Design

**Frontend Exports:** Named exports for utilities and rendering functions; side effects (event listeners, global window assignments) happen at module load time.

**Edge function exports:** None — each `index.ts` is a self-contained `Deno.serve()` handler.

**State management:** Centralized mutable state in `js/state.js` with explicit setter functions (`setCurrentAgent`, `setAllProperties`, `setCurrentFilters`, `resetCurrentFilters`). Consumers import state values directly and call setters.

**Barrel files:** Not used.

## Security Conventions

**HTML escaping:** `escHtml()` utility defined in both `js/utils.js` and duplicated in each edge function that builds email HTML — all user-supplied data is escaped before interpolation.

**URL sanitization:** `safeUrl()` in `js/utils.js` blocks `javascript:`, `data:`, and `vbscript:` protocols.

**Tracking ID sanitization:** `safeTrackingId()` in `js/utils.js` — allows only alphanumeric, hyphens, underscores.

**Honeypot fields:** Client (`js/lead-modal.js`) and server (`edge-functions/capture-lead-v4/index.ts`) both check for `website` / `company_url` hidden fields filled by bots.

**CORS:** All edge functions use `getCorsHeaders()` with an allowlist of origins; unknown origins fall back to the first allowed origin (not wildcard).

**AbortController timeouts:** All outbound fetch calls in edge functions and frontend use `AbortController` with a 5–10 second timeout.

---

*Convention analysis: 2026-03-27*
