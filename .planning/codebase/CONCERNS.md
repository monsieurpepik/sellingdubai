# Codebase Concerns

**Analysis Date:** 2026-03-27

## Tech Debt

**Monolith / Module System Duplication:**
- Issue: `app.js` (2,312 lines) and the modular `js/` system coexist. `renderPropertyCard`, vCard generator, demo data, property carousel, filters, and several utilities are duplicated across both. `app.js.bak` is also committed to the repository.
- Files: `app.js`, `app.js.bak`, `js/properties.js`, `js/filters.js`, `js/gallery.js`
- Impact: Any bug fix in the modular system must be cross-checked against `app.js`. Stale code can silently diverge. Repository bloat from `.bak` file.
- Fix approach: Delete `app.js`, `app.js.bak`. Remove `<script src="app.js">` fallback comment from `index.html`. Confirm `dist/init.bundle.js` is the sole JS entry point.

**Deployment Artifact Committed to Repo Root:**
- Issue: `deploy-1774605695009-9c7fca44-7db8-42cd-b2ef-f8c3617606e2.zip` is committed at the project root.
- Files: `deploy-1774605695009-9c7fca44-7db8-42cd-b2ef-f8c3617606e2.zip`
- Impact: Inflates repository size. Leaks deployment snapshot. Creates confusion about what is canonical source.
- Fix approach: Delete the zip, add `*.zip` to `.gitignore`.

**Hardcoded Price Field Type Inconsistency:**
- Issue: `js/properties.js` treats the `price` field as a string (regex checks for `"AED"`), but `edge-functions/whatsapp-ingest/index.ts` stores `price` as a number (integer) in Supabase. The Supabase schema and JS rendering layer disagree on the type.
- Files: `js/properties.js`, `edge-functions/whatsapp-ingest/index.ts`
- Impact: Price formatting logic can silently produce wrong output or `NaN` depending on which insertion path populated the row.
- Fix approach: Decide on a canonical type (number). Update `properties.js` to always `Number(price)` before formatting. Document in schema comments.

**Mortgage Module Global State:**
- Issue: `js/mortgage.js` stores all calculator state on `window`: `window._mortTerm`, `window._mortRate`, `window._mortStep`, `window._mortData`, `window._mortRates`, `window._mortAppId`. `window._mortRates` has no TTL and is cached for the entire session.
- Files: `js/mortgage.js`
- Impact: Globals pollute the `window` namespace and can conflict with third-party scripts. Stale rates are served if a user stays on the page past rate refresh time.
- Fix approach: Migrate state to a closed module-level object exported from `mortgage.js`. Add a TTL (e.g., 30 minutes) for `_mortRates`.

**Unimplemented Tier Gating:**
- Issue: `TIER-ARCHITECTURE.md` documents a multi-tier feature system (Free/Pro/Elite), but all tier checks are currently unenforced — every agent receives every feature for free.
- Files: `TIER-ARCHITECTURE.md`
- Impact: Revenue logic is not operational. Tier-specific features cannot be sold or restricted.
- Fix approach: Implement server-side tier checks in edge functions; add client-side UI gating keyed on `agent.tier` field already present in the agents table.

**CSS Syntax Warnings:**
- Issue: `DECISIONS.md` documents stray `}` syntax warnings in the stylesheet at lines 587 and 2386.
- Files: `styles.css`
- Impact: Linters and browsers may log warnings. Unpredictable cascade behavior in some parsers.
- Fix approach: Open `styles.css`, locate and remove the stray closing braces at lines 587 and 2386.

## Known Bugs

**Service Worker Caches Monolith, Not Bundle:**
- Symptoms: After the migration to `dist/init.bundle.js`, users who previously visited the site may receive the old `app.js` monolith from the service worker cache on repeat visits, not the new modular bundle.
- Files: `sw.js`, `js/init.js`
- Trigger: Any returning visitor whose service worker installed before the modular build went live.
- Workaround: Bump `CACHE_VERSION` in `sw.js` AND update `STATIC_ASSETS` to reference `dist/init.bundle.js` instead of `app.js`.

**`capture-lead-v4` Directory vs "v5" Comment:**
- Symptoms: The edge function file at `edge-functions/capture-lead-v4/index.ts` has a comment identifying itself as "v5". Netlify deploy config, monitoring, and logs reference `capture-lead-v4`.
- Files: `edge-functions/capture-lead-v4/index.ts`
- Trigger: Every production invocation.
- Workaround: The functional impact is nil; it is a naming confusion issue. Resolve by updating the in-file comment to match the directory name.

**`openMortgage` Recursive Stub:**
- Symptoms: In `js/init.js`, `window.openMortgage` is defined as an async stub that imports `mortgage.js`, then calls `window.openMortgage()`. After the module loads, `mortgage.js` overwrites `window.openMortgage`. If `mortgage.js` fails to load, the stub calls itself recursively.
- Files: `js/init.js`
- Trigger: Network error during `mortgage.js` lazy load.
- Workaround: The `try/catch` suppresses the error, but the recursive call runs before `catch` can intercept it. Fix by setting a local flag before calling `window.openMortgage()` inside the stub to prevent recursion.

## Security Considerations

**Supabase Anon Key Hardcoded in Source:**
- Risk: `SUPABASE_URL` and `SUPABASE_ANON_KEY` are committed as string literals in two files. While the anon key is designed to be public, hardcoding it makes rotation painful and risks accidental commit of a service_role key using the same pattern.
- Files: `js/config.js` (line 1-2), `app.js` (line 13)
- Current mitigation: The anon key is intentionally public per Supabase design; RLS enforces data access.
- Recommendations: Move to `netlify.toml` environment injection and reference via `window.__SUPABASE_URL__` injected at build time. Eliminates the pattern that could be replicated for sensitive keys.

**`whatsapp-ingest` Wildcard CORS:**
- Risk: `edge-functions/whatsapp-ingest/index.ts` sets `"Access-Control-Allow-Origin": "*"`. Every other edge function uses strict origin allowlisting.
- Files: `edge-functions/whatsapp-ingest/index.ts`
- Current mitigation: The endpoint requires a valid webhook signature (`X-Hub-Signature-256`), which limits direct abuse.
- Recommendations: Restrict `Access-Control-Allow-Origin` to the WhatsApp webhook source IP range or at minimum to `https://sellingdubai-agents.netlify.app` / `https://agents.sellingdubai.ae`. Remove wildcard.

**`lead-followup-nagger` Open If Env Var Missing:**
- Risk: `edge-functions/lead-followup-nagger/index.ts` contains `const isAuthorized = !cronSecret || ...`. If the `CRON_SECRET` environment variable is not set, the authorization check evaluates to `true` for ALL requests — the endpoint is fully public.
- Files: `edge-functions/lead-followup-nagger/index.ts`
- Current mitigation: None if env var is missing.
- Recommendations: Invert the guard: if `cronSecret` is falsy (not configured), reject the request. Never allow "misconfigured = open".

**`mortgage_applications` RLS: Any Anon User Can Update Any Row:**
- Risk: `sql/rls_policies.sql` creates an anon UPDATE policy with `USING (true) WITH CHECK (true)` on `mortgage_applications`. Any unauthenticated visitor can PATCH any mortgage application row, including overwriting document upload paths for other applicants.
- Files: `sql/rls_policies.sql` (lines 215-222)
- Current mitigation: A comment in the file acknowledges this: "IMPORTANT: The client currently PATCHes via REST API with anon key. Ideally this should go through an edge function."
- Recommendations: Route all mortgage application updates through a dedicated edge function that validates the applicant owns the row (e.g., checks a session token or application secret returned at INSERT time). Remove anon UPDATE policy.

**Instagram OAuth CSRF: Server Does Not Validate `state`:**
- Risk: `edge-functions/instagram-auth/index.ts` generates a CSRF `state` parameter and returns it to the client but never stores it server-side. Validation is entirely client-side, which means a sophisticated CSRF attack bypassing client-side checks is not caught by the server.
- Files: `edge-functions/instagram-auth/index.ts`
- Current mitigation: Client-side `state` check exists.
- Recommendations: Store `state` in a short-lived Supabase row or signed JWT and verify server-side on the callback.

**`send-magic-link` Rate Limit is Global, Not Per-Email:**
- Risk: The global rate limit (30 magic links per 15 minutes across all emails) means an attacker can exhaust the quota for all agents by sending 30 requests for throwaway email addresses.
- Files: `edge-functions/send-magic-link/index.ts` (lines 66-77)
- Current mitigation: Per-email rate limit also exists (5 per 15 minutes).
- Recommendations: Make the primary rate limit per-email and raise or remove the global cap, or use separate counters with distinct thresholds.

**WhatsApp Ingest Agent Lookup: Partial Phone Match:**
- Risk: Agent lookup uses last-9-digit suffix matching: `.ilike.%${cleanPhone.slice(-9)}`. Two agents whose phone numbers share the same last 9 digits would both match — properties could be assigned to the wrong agent.
- Files: `edge-functions/whatsapp-ingest/index.ts`
- Current mitigation: The query takes the first result; the probability is low with real phone numbers.
- Recommendations: Require exact full-number match. If no exact match, reject rather than fall back to partial match.

## Performance Bottlenecks

**Property List Hard-Capped at 20:**
- Problem: `js/properties.js` `loadProperties()` calls `.limit(20)` with no pagination. Agents with more than 20 active listings silently show only the first 20.
- Files: `js/properties.js`
- Cause: No infinite scroll, load-more button, or pagination cursor implemented.
- Improvement path: Add a "Load more" button with `.range(offset, offset+19)` cursor-based pagination, or implement infinite scroll on the property list container.

**`window._mortRates` Has No TTL:**
- Problem: Mortgage rates fetched from Supabase are cached in `window._mortRates` for the entire browser session with no expiry.
- Files: `js/mortgage.js`
- Cause: No timestamp stored alongside the cached rates.
- Improvement path: Store `{ rates, fetchedAt }` and re-fetch if `Date.now() - fetchedAt > 30 * 60 * 1000`.

## Fragile Areas

**Service Worker Cache Manifest:**
- Files: `sw.js`
- Why fragile: `STATIC_ASSETS` is a hardcoded array. Adding or renaming a hashed bundle requires manually updating `sw.js`. Currently references `app.js` (monolith) instead of `dist/init.bundle.js` (active bundle). Forgetting to update causes users to receive stale assets indefinitely.
- Safe modification: Update `STATIC_ASSETS` array AND bump `CACHE_VERSION` constant in the same commit whenever bundles change. Consider build-time injection of the asset manifest.
- Test coverage: No automated test verifies cache manifest correctness.

**WhatsApp Ingest Hardcoded Domain:**
- Files: `edge-functions/whatsapp-ingest/index.ts`
- Why fragile: Agent profile URLs are constructed as `https://sellingdubai-agents.netlify.app/a/${agent.slug}` — the old Netlify subdomain, not the production domain `agents.sellingdubai.ae`. Any message that includes the auto-generated URL sends users to the wrong domain.
- Safe modification: Replace the hardcoded domain with an environment variable `AGENT_BASE_URL` and set it in Netlify environment config.
- Test coverage: No test validates the constructed URL.

**Global State in `state.js` Without Reactivity:**
- Files: `js/state.js`, `js/properties.js`, `js/filters.js`, `js/gallery.js`
- Why fragile: Shared mutable state (`currentAgent`, `allProperties`, `currentFilters`) is exported as module-level `let` variables with setter functions. Any module can read stale state between async operations. No subscriber notification when state changes.
- Safe modification: Always call the setter, never mutate the exported variable directly. Read state at call time, not at import time.
- Test coverage: No unit tests for state transitions.

## Scaling Limits

**Single Supabase Project for All Tiers:**
- Current capacity: One Supabase project serves all agents on all tiers.
- Limit: Supabase free/pro connection pool and row limits apply uniformly. High-volume agents on an "Elite" tier will share bandwidth with free-tier agents.
- Scaling path: Introduce read replicas or per-region Supabase projects when agent count grows significantly.

**Edge Function Cold Starts:**
- Current capacity: Netlify edge functions run on Deno; cold start adds ~200-400ms on first invocation.
- Limit: `capture-lead-v4` and `whatsapp-ingest` are the highest-traffic functions. During traffic spikes, cold starts accumulate.
- Scaling path: Netlify edge functions are stateless and scale horizontally automatically, but consider keeping-alive patterns or moving to background tasks for non-latency-sensitive work.

## Dependencies at Risk

**No `package-lock.json`:**
- Risk: `package.json` exists but no lockfile was found. `esbuild`, `tailwindcss`, `@tailwindcss/forms`, and `@tailwindcss/container-queries` version resolution is non-deterministic across installs.
- Impact: Build reproducibility. A semver-compatible breaking change in any dep could silently break the build on next CI run.
- Migration plan: Run `npm install` once to generate `package-lock.json` and commit it.

## Missing Critical Features

**No Per-Email Rate Limit on `verify-magic-link`:**
- Problem: `verify-magic-link` has no rate limit on verification attempts. An attacker who intercepts a token URL has 15 minutes to brute-force a 6-character alphanumeric token (if tokens are short) or spam retries without lockout.
- Blocks: Secure magic link flow depends on this.

**No Agent-Owned Row Verification for Mortgage Application Updates:**
- Problem: There is no mechanism to verify that the user updating a mortgage application row is the same person who created it (see RLS concern above). There is no application secret, session token, or ownership proof in the current schema.
- Blocks: Secure mortgage application document upload.

## Test Coverage Gaps

**Edge Functions: `verify-magic-link`, `update-agent`, `whatsapp-ingest` Untested:**
- What's not tested: Token expiry, token reuse behavior, agent field update validation, WhatsApp signature verification, property parsing edge cases.
- Files: `edge-functions/verify-magic-link/index.ts`, `edge-functions/update-agent/index.ts`, `edge-functions/whatsapp-ingest/index.ts`
- Risk: Regressions in auth and data ingestion paths go undetected.
- Priority: High — these are security-critical and data-ingestion paths.

**JS Modules: No Automated Unit Tests:**
- What's not tested: `js/properties.js` card rendering, `js/filters.js` filter logic, `js/mortgage.js` calculation accuracy, `js/state.js` setter/getter consistency.
- Files: `js/` (all modules except `js/test-modules.html` smoke test)
- Risk: Rendering bugs, filter edge cases, and mortgage math errors can ship silently.
- Priority: Medium — `test-modules.html` is a manual smoke test only.

**Service Worker Behavior Not Tested:**
- What's not tested: Cache hit/miss behavior, version bump triggers stale asset eviction, offline fallback correctness.
- Files: `sw.js`
- Risk: Cache staleness bugs (already one present: `app.js` in manifest) go unnoticed.
- Priority: High — already has a known active bug.

---

*Concerns audit: 2026-03-27*
