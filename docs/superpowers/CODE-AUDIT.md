# Code Audit — SellingDubai
**Date:** 2026-04-02
**Auditor:** Claude Code (Sonnet 4.6)
**Scope:** Full codebase — JS modules, HTML pages, edge functions, configuration

---

## Critical Issues (must fix before any investor demo)

### CRITICAL-1 — Supabase anon key hardcoded in source
**File:** `js/config.js:12`
**Score:** CRITICAL

The anon key is hardcoded as a fallback string:
```js
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```
esbuild replaces the env var at build time, but if the env var is absent the fallback is committed to source and shipped in the bundle. The production project ref `pjyorgedaxevxophpfib.supabase.co` is also hardcoded. Any git history exposure or bundle inspection reveals both. Anon keys are low-privilege but the combination with the project URL enables direct PostgREST access and enumeration.

**Fix:** Remove the hardcoded fallback entirely. Fail fast at startup if `SUPABASE_ANON_KEY` is missing rather than silently using a committed credential. Gate the build pipeline on `npm run check` verifying env vars are injected.

---

### CRITICAL-2 — CSP `unsafe-inline` completely nullifies XSS protection
**File:** `netlify.toml:52`
**Score:** CRITICAL

```toml
Content-Security-Policy: "... script-src 'self' 'unsafe-inline' ..."
```
`'unsafe-inline'` renders the entire script-src directive ineffective. Any XSS injection (reflected, stored, or DOM-based) can execute arbitrary scripts regardless of CSP. Given that `agent.name`, `agent.tagline`, and project descriptions all flow through template literals, an XSS payload stored in the DB would execute without any CSP barrier.

**Fix:** Replace `'unsafe-inline'` with nonce-based or hash-based CSP. Netlify edge functions can inject a nonce per request. Audit all inline `<script>` blocks and event handlers in HTML to remove or hash them. The Sentry loader and GA4 snippet will need to be replaced with nonce-tagged versions.

---

### CRITICAL-3 — `og:image` served from raw Supabase storage URL
**File:** `js/agent-page.js:187`
**Score:** CRITICAL (violates CLAUDE.md performance rule + data exposure)

```js
document.querySelector('meta[property="og:image"]')?.setAttribute('content', agent.photo_url);
```
`agent.photo_url` is a raw `supabase.co/storage` URL. This violates the CLAUDE.md mandate: "Never link directly to the raw Supabase storage URL for any image rendered in the UI." The Supabase storage origin is also not a CDN-edge optimized URL — sharing the agent link on social produces slow, unoptimized images that may fail to load if bucket policies change.

**Fix:** Run the URL through `optimizeImg()` from `utils.js` (or a fixed 1200×630 transform) before setting the `og:image` meta tag.

---

## High Priority (fix this sprint)

### HIGH-1 — `openProjectDetail` lazy stub has no error handling
**File:** `js/init.js:122–127`
**Score:** HIGH

Every other lazy load stub uses the `lazyLoad()` helper which catches import errors and shows a user-facing toast. `openProjectDetail` is the sole exception:
```js
window.openProjectDetail = async function openProjectDetailLazy(slug) {
  const m = await import('./project-detail.js');
  window.openProjectDetail = m.openProjectDetail;
  m.openProjectDetail(slug);
};
```
A network error importing `project-detail.js` will produce an unhandled promise rejection with no user feedback. This is the heaviest lazy module (project detail view) and most likely to be affected by slow connections.

**Fix:** Wrap in `lazyLoad()` like the other stubs, or add try/catch with `showFeatureError('project-detail')`.

---

### HIGH-2 — ESC key calls bare global close functions before lazy modules load
**File:** `js/init.js:133–141`
**Score:** HIGH

The keydown handler calls `closeMortgage()`, `closePhotoViewer()`, `closeFullGallery()`, `closeDetail()`, `closeFilters()`, `closeProps()`, `closeLead()` directly. These functions are defined inside lazy modules that may not have loaded yet. If a user presses Escape before opening any lazy feature, `ReferenceError: closeMortgage is not defined` (and others) will be thrown. The handler runs against every Escape keypress — it is a guaranteed failure path.

**Fix:** Guard each call with `typeof closeMortgage === 'function' && closeMortgage()` or define stub no-ops on `window` in `init.js` similar to the existing `closeDetail` stub at line 11.

---

### HIGH-3 — Double verify-magic-link round trip on every page load with a token
**Files:** `js/init.js:194`, `js/agent-page.js:407`
**Score:** HIGH

When `localStorage.sd_edit_token` is present, `init.js` calls `verify-magic-link` to check if the viewer is the owner of a pending profile. Then `showEditButtonIfOwner()` in `agent-page.js` makes a second independent call to `verify-magic-link` for the same token. This is two full edge function cold-start round trips for every page view by an authenticated agent. At 200–500ms per call this adds up to 400–1000ms of avoidable latency on every agent page view while logged in.

**Fix:** Share the verification result. Resolve token verification once in `init.js`, pass the result (or the agent object) to `renderAgent()` / `showEditButtonIfOwner()` so the second call is eliminated.

---

### HIGH-4 — `capture-lead-v4` rate limiting happens after DB lookup
**File:** `edge-functions/capture-lead-v4/index.ts:234–244` (IP rate check), `~249` (agent lookup)
**Score:** HIGH

The IP-based rate limit check runs AFTER creating the Supabase client and fetching the agent row from the DB. A flood of requests from a single IP will query the `agents` table on every request before being blocked. The rate limit check should be the very first operation after CORS and method validation.

**Fix:** Move the IP rate limit check to immediately after the CORS/method validation block, before any Supabase queries.

---

### HIGH-5 — `capture-lead-v4` CORS origins list diverges from `_shared/utils.ts`
**File:** `edge-functions/capture-lead-v4/index.ts` (local ALLOWED_ORIGINS)
**Score:** HIGH

`_shared/utils.ts` defines the canonical CORS origin list including `agents.sellingdubai.ae`. Individual edge functions maintain local copies of this list that may not stay in sync. If `agents.sellingdubai.ae` is added to `_shared/utils.ts` but not to a function's local copy, CORS preflight will fail for that subdomain.

**Fix:** All edge functions should import and use the CORS list from `_shared/utils.ts` rather than maintaining local copies. This is especially important for `capture-lead-v4`.

---

### HIGH-6 — `update-agent` edge function missing localhost CORS bypass
**File:** `edge-functions/update-agent/index.ts`
**Score:** HIGH

`send-magic-link` includes an `IS_LOCAL_DEV` check allowing `http://localhost:*` origins during development. `update-agent` does not. This means agent profile editing cannot be tested locally without CORS errors, pushing developers to test against production — violating the CLAUDE.md requirement to never test edge functions against production.

**Fix:** Add the same `IS_LOCAL_DEV` / localhost CORS bypass pattern used in `send-magic-link`.

---

### HIGH-7 — `loadRemOffplanProjects` dead code in `agent-page.js`
**File:** `js/agent-page.js:501`
**Score:** HIGH (code quality / bundle size risk)

`loadRemOffplanProjects()` is defined alongside a local `NETLIFY_IMG_REM` constant at line 498 but is never called and never exported. The function duplicates logic from `utils.js`'s `optimizeImg`. It adds to the `init.bundle.js` size and could confuse future contributors about what the intended data flow is.

**Fix:** Delete `loadRemOffplanProjects` and `NETLIFY_IMG_REM` from `agent-page.js`. If REM project loading is needed in future, import from the correct module.

---

### HIGH-8 — Hardcoded `boban-pepic` slug in production properties code
**File:** `js/properties.js:378`
**Score:** HIGH

```js
if (agent.slug === 'boban-pepic') { /* priority load showcase */ }
```
This is test/showcase code committed to the production bundle. Every agent page load evaluates this conditional. Beyond being messy, it means one specific agent slug receives different data loading behavior in production — a subtle bug risk if the showcase logic diverges from normal loading.

**Fix:** Remove the hardcoded slug check. If priority loading is needed, implement it via a DB flag (e.g., `agents.is_showcase = true`) rather than a hardcoded slug.

---

### HIGH-9 — `update-agent` missing input length limits
**File:** `edge-functions/update-agent/index.ts`
**Score:** HIGH

`capture-lead-v4` validates and truncates input lengths (name ≤ 100, message ≤ 2000, etc.). `update-agent` has no equivalent server-side length constraints on text fields like `tagline`, `agency_name`, `custom_link_1_label`. A client bypassing the frontend can send arbitrarily large strings that will be written directly to the DB.

**Fix:** Add input length validation matching the UI field limits before the Supabase update call. Reject requests where any field exceeds reasonable maximums.

---

## Medium Priority (fix next sprint)

### MED-1 — `renderAgent()` function is 285 lines — far too large
**File:** `js/agent-page.js:79–364`
**Score:** MEDIUM

The `renderAgent()` function handles avatar, trust bar, DLD stats, agency badge, JSON-LD, all CTA buttons, tracking script injection, social icons, and sticky CTA. At 285 lines it cannot be unit-tested, is difficult to review in PRs, and mixes concerns (DOM rendering, analytics, SEO) in a single function. Any bug anywhere in the render pipeline causes the full function to fail.

**Fix:** Extract into focused sub-functions: `renderProfileHeader()`, `renderTrustBar()`, `renderCtaButtons()`, `renderSocialLinks()`. `renderAgent()` should orchestrate, not implement.

---

### MED-2 — Double JSON-LD schema insertion path
**File:** `js/agent-page.js:197–215` (inline) and `js/agent-page.js:430–446` (`injectSchemaOrg`)
**Score:** MEDIUM

JSON-LD schema markup is both written inline within `renderAgent()` AND written again via the exported `injectSchemaOrg()` function called from `init.js`. If both execute (the normal code path), the page will have two `<script type="application/ld+json">` blocks for the same agent entity, with potentially inconsistent data. Google Search Console treats duplicate schema as an error.

**Fix:** Pick one canonical path. Recommend using `injectSchemaOrg()` only (called from `init.js` after render), and removing the inline schema write from `renderAgent()`.

---

### MED-3 — `safeUrl` does not prefix bare domains/paths with `https://`
**File:** `js/utils.js:19`
**Score:** MEDIUM

The comment reads "Bare domain or path — prefix with https" but the code returns `trimmed` with no prefix added. This means a stored value like `instagram.com/username` passed through `safeUrl()` will produce an `href` that navigates to a same-origin relative path `/instagram.com/username` rather than `https://instagram.com/username`. This silently breaks external links.

**Fix:** Implement the intended logic: if `trimmed` doesn't start with `http://` or `https://` and doesn't start with `/`, `/a/`, etc., prefix with `https://`.

---

### MED-4 — Google Maps iframe injected on every property open without consent
**File:** `js/property-detail.js:138`
**Score:** MEDIUM

A Google Maps embed iframe is injected each time a property detail panel opens. This loads third-party tracking content (Google cookies) without any user consent mechanism, which is problematic under GDPR/PECR if any EU users access the site. The Maps iframe also adds ~50KB+ to the network payload for each property open.

**Fix:** Lazy-load the Maps iframe on explicit user interaction (a "Show Map" button). Show a static map image or placeholder by default.

---

### MED-5 — `window._currentProperty`, `window._currentDetailImages`, `window._costData` global pollution
**File:** `js/property-detail.js:54,75,229`
**Score:** MEDIUM

Cross-module state is passed via `window._*` globals rather than the established `state.js` module. This creates hidden dependencies: `mortgage.js` reads `window._currentProperty` (line 49), `gallery.js` reads `window._currentDetailImages`, and `project-detail.js` sets `window._lbImgs`, `window._lbIdx`, `window._lbScale`. The `state.js` module already exists for this purpose with proper setters.

**Fix:** Route all cross-module state through `state.js` exports. Replace `window._currentProperty` etc. with named exports and imports via the state module.

---

### MED-6 — `openLeadForProperty` in `lead-modal.js` calls `closeProps()` as a bare global
**File:** `js/lead-modal.js:191`
**Score:** MEDIUM

`closeProps()` is defined in `filters.js`, which is lazy-loaded. `lead-modal.js` can be opened independently of `filters.js` — if `filters.js` hasn't loaded, `closeProps()` will throw `ReferenceError`. This is the same class of bug as HIGH-2 but in a more specific call site.

**Fix:** Guard with `typeof closeProps === 'function' && closeProps()` or define a no-op stub on `window.closeProps` in `init.js`.

---

### MED-7 — `analytics.js` ignores passed `agentId` parameter
**File:** `js/analytics.js:35`
**Score:** MEDIUM

`trackPageView(agentId)` accepts an `agentId` parameter but passes `{}` to `logEvent()` — the `agentId` argument is silently dropped. The `logEvent` function uses `currentAgent` from the state module instead. This is a confusing API (callers believe they're passing the agent ID) and a latent bug if the state module ever hasn't been populated when `trackPageView` is called.

**Fix:** Either use the parameter inside `logEvent` (remove the ambiguity) or rename `trackPageView()` to not accept parameters, documenting that it reads from state.

---

### MED-8 — Sentry DSN exposed in `index.html`
**File:** `index.html:44`
**Score:** MEDIUM

The Sentry DSN `https://689d6d66...@o4511110584926208.ingest.us.sentry.io/4511110595215360` is hardcoded in the HTML. Sentry DSNs are client-side by design (they must be in the browser), but they allow anyone to send arbitrary error events to your Sentry project, polluting error dashboards and potentially consuming quota. Sentry recommends rate limiting or allowlisting inbound events by origin on the Sentry project settings.

**Fix:** Configure Sentry project to reject events from non-sellingdubai.ae origins. This is a Sentry dashboard setting, not a code change.

---

### MED-9 — `gallery.js` uses raw URL without `escAttr()`
**File:** `js/gallery.js:11`
**Score:** MEDIUM

Image `src` attributes are set from `window._currentDetailImages` without passing through `escAttr()`. While the values originate from the DB (lower XSS risk than user-submitted text), the practice is inconsistent with how other URL attributes are handled and creates a false sense that escaping is "optional" in image contexts.

**Fix:** Apply `escAttr()` consistently to all attribute values, including `src` from DB-sourced URLs.

---

### MED-10 — `verify-magic-link` returns both `bio` and `tagline` fields
**File:** `edge-functions/verify-magic-link/index.ts:101`
**Score:** MEDIUM

`DASHBOARD_FIELDS` returns both `bio` and `tagline`. The CLAUDE.md explicitly warns: "the `bio` vs `tagline` mismatch broke the onboarding checklist for every signup." Returning both from the API without clearly deprecating one creates ongoing confusion about the canonical field name. The `join.html` and `dashboard.html` both use `tagline`, suggesting `bio` is a legacy column.

**Fix:** If `bio` is being migrated to `tagline`, remove `bio` from `DASHBOARD_FIELDS`. If `bio` is still needed in the DB schema, document which is canonical in a DB comment/migration and stop returning the other from the API.

---

## Low Priority / Tech Debt

### LOW-1 — `analytics.js` uses unnecessary 300ms setTimeout for page view tracking
**File:** `js/analytics.js:35`
**Score:** LOW

`trackPageView` wraps the `logEvent` call in `setTimeout(() => ..., 300)`. The comment implies it's waiting for the agent state to settle, but `trackPageView` is called after `renderAgent()` completes — the state is already set. The delay adds 300ms of unnecessary latency to every page view event.

**Fix:** Remove the `setTimeout` wrapper. If a timing dependency genuinely exists, document it.

---

### LOW-2 — `capture-lead-v4` uses `select('*')` for agent lookup
**File:** `edge-functions/capture-lead-v4/index.ts:249`
**Score:** LOW

`select('*')` fetches all agent columns when only specific fields (e.g., `id`, `name`, `email`, `whatsapp`) are needed for the lead notification logic. This wastes network bytes on the Supabase edge and marginally increases response time.

**Fix:** Replace `select('*')` with `select('id,name,email,whatsapp,agency_name')` or the minimum fields needed.

---

### LOW-3 — `propertiesCache` singleton won't reset between agent renders
**File:** `js/properties.js` (module level)
**Score:** LOW

`propertiesCache` and `propertiesLoaded` are module-level singletons. If the app were ever extended to render multiple agent profiles without a full page reload (SPA-style), the cache from the first agent would bleed into the second. Currently not a bug given the single-agent-per-page design, but worth noting as a constraint.

**Fix:** Document the single-render constraint in a comment, or restructure as a factory if multi-agent rendering is ever planned.

---

### LOW-4 — `analytics.js` 300ms delay and missing agentId (duplicate of MED-7)
(See MED-7 above — consolidated)

---

### LOW-5 — `Cross-Origin-Resource-Policy: same-origin` may break third-party image loads
**File:** `netlify.toml`
**Score:** LOW

The `Cross-Origin-Resource-Policy: same-origin` header prevents the Netlify CDN from serving images to cross-origin requests. If any third-party service (WhatsApp link previews, social crawlers) attempts to directly fetch agent images from the Netlify CDN URL, CORP will block the load. Most crawlers bypass this by not sending CORP-aware requests, but it's worth verifying with OG image previews.

**Fix:** Test WhatsApp/Telegram/LinkedIn link preview rendering. If previews fail, change CORP to `cross-origin` for the image CDN path only using a more specific header rule in `netlify.toml`.

---

### LOW-6 — Share button title uses unescaped string in `navigator.share` call
**File:** `js/property-detail.js:234`
**Score:** LOW

The share button's `onclick` uses `escAttr(p.title||'')` for the HTML attribute context, but the `navigator.share({ title: ... })` call within the JS string receives an unescaped value. `navigator.share` is a JS API (not HTML), so HTML escaping is incorrect there — but the raw value should be sanitized for any potential embedded quotes or special characters that could affect the template literal string boundary.

**Fix:** Use a closure-based event listener instead of an inline onclick template literal. Store the property title in a `data-` attribute and read it in the listener.

---

### LOW-7 — `token.used_at` marked but not revoked in `verify-magic-link`
**File:** `edge-functions/verify-magic-link/index.ts`
**Score:** LOW

Magic link tokens are marked with `used_at` timestamp on first use but remain valid for the full 15-minute window. If a token is intercepted post-first-use, it can still be used to verify identity until expiry. This is by design (re-verification during the session window), but the threat model should be documented. Token revocation on first use would be more secure.

**Fix (optional):** Document the decision in `DECISIONS.md`. If stricter security is desired, revoke the token on first use and issue a session cookie instead.

---

## Security Summary

| Finding | Severity | Status |
|---------|----------|--------|
| Anon key committed as fallback string | CRITICAL | Needs fix |
| CSP `unsafe-inline` nullifies XSS protection | CRITICAL | Needs fix |
| `og:image` raw Supabase URL | CRITICAL | Needs fix |
| Rate limiting after DB lookup in `capture-lead-v4` | HIGH | Needs fix |
| CORS origin list divergence | HIGH | Needs fix |
| `update-agent` missing input length validation | HIGH | Needs fix |
| `verify-magic-link` token not revoked on first use | LOW | Document decision |
| Sentry DSN exposed (expected, needs origin filter) | MEDIUM | Sentry config change |
| Google Maps iframe without user consent (GDPR risk) | MEDIUM | Needs fix |

**Positive security posture:**
- Stripe webhook HMAC-SHA256 with constant-time comparison — correctly implemented
- Magic byte validation on image uploads — solid
- SSRF protection (`isBlockedSsrfUrl()`) covers RFC1918, link-local, CGN, IPv6 loopback
- `sanitizeHtml()` in `project-detail.js` uses DOM `<template>` — safe approach
- Facebook CAPI hashes PII with SHA-256 before sending
- Honeypot field + client-side 30s cooldown + server-side 10/hr IP rate limit on leads
- Email enumeration protection in `send-magic-link` (always returns success)

---

## Architecture Assessment

### Strengths
- **Lazy loading discipline is well-applied** across gallery, property-detail, lead-modal, filters, mortgage — all use the named function guard pattern correctly. `openProjectDetail` is the sole exception (see HIGH-1).
- **`state.js` module** provides a clean shared state layer. The problem is that `window._*` globals are used alongside it inconsistently (see MED-5).
- **`_shared/utils.ts`** centralizes SSRF protection, magic byte validation, and CORS origins. The architecture is sound; the execution has drift (see HIGH-5).
- **esbuild code splitting** with explicit chunk size limits in CLAUDE.md is a pragmatic approach to bundle discipline.
- **Edge function design** is generally solid — service_role key is server-side only, no secrets in the client bundle beyond the anon key.

### Weaknesses
- **No module boundary enforcement.** Lazy modules communicate through `window._*` globals rather than `state.js`, creating hidden dependencies that break across lazy load timing (see MED-5).
- **`renderAgent()` is a god function** (285 lines, see MED-1). This is the highest-complexity function in the codebase and handles too many concerns.
- **CORS origin management is decentralized.** Each edge function maintains its own local copy of the allowlist instead of importing from `_shared/utils.ts` (see HIGH-5).
- **`lazyLoad()` helper is inconsistently applied** — one of six lazy stubs bypasses it (see HIGH-1).
- **Two verification round trips** for the same token on every page load with an `sd_edit_token` present (see HIGH-3). This is an architectural oversight — the result of `init.js` verification should flow forward rather than triggering a duplicate call.

### Bundle Size Risk
- `init.bundle.js` at ~23KB is within the 30KB limit (7KB headroom).
- Dead code in `agent-page.js` (`loadRemOffplanProjects`, `NETLIFY_IMG_REM`) slightly inflates the init bundle — removal recovers a small amount of headroom.
- The hardcoded slug check in `properties.js` and double JSON-LD path in `agent-page.js` are also in the init bundle.

---

## Performance Assessment

### Critical Path Issues
- **Double `verify-magic-link` calls** (HIGH-3): Adds 400–1000ms latency for every authenticated page load. This is a first-paint blocker for agents managing their profiles.
- **Google Maps iframe on property open** (MED-4): Loads 50KB+ of Maps JS and third-party cookies on each property card click. Should be user-initiated.

### Positive Performance Implementations
- `analytics.js` 300ms setTimeout (LOW-1) is a minor unnecessary delay but not a critical path issue.
- `select('*')` in `capture-lead-v4` (LOW-2) is a minor network waste, not on the render critical path.
- Netlify Image CDN transform is correctly used throughout most of the UI — the `og:image` violation (CRITICAL-3) is the main exception.
- Lazy loading pattern correctly defers all heavy modules (gallery, filters, mortgage, project detail) until first interaction.
- Google Fonts loaded async with `rel="preload" as="style" onload` — correct.

### Inline Script Audit
- Sentry loader: inline `<script>` — acceptable, required for early error capture.
- GA4 snippet: inline — acceptable per CLAUDE.md approval list.
- `'unsafe-inline'` in CSP means inline scripts are not blocked regardless — this must be fixed (CRITICAL-2) before inline scripts become a meaningful security concern to enumerate.

### Recommendations by Priority
1. Fix CRITICAL-2 (CSP) + CRITICAL-1 (anon key) before any public-facing investor demo
2. Fix HIGH-3 (double verify round trip) for agent UX — this is the most tangible perceived performance issue
3. Fix MED-4 (Maps iframe) before GDPR becomes a legal concern
4. LOW-1 (analytics setTimeout) and LOW-2 (select *) are cleanup items for a quiet sprint

---

*Audit generated from source read on 2026-04-02. Re-audit recommended after any significant refactor of `agent-page.js` or edge function CORS handling.*
