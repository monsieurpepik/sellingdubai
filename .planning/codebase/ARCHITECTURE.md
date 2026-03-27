# Architecture

**Analysis Date:** 2026-03-27

## Pattern Overview

**Overall:** Serverless Static Site + Edge Function Backend (JAMstack)

**Key Characteristics:**
- Single-page HTML files served statically from Netlify CDN
- Business logic runs in Supabase Edge Functions (Deno/TypeScript) invoked directly from the browser
- Frontend state managed via a shared ES module (`js/state.js`) with explicit setter functions — no reactive framework
- No server-rendered pages (except bot OG-injection via Netlify Edge Function)
- Supabase provides the database (PostgreSQL), file storage, and anon/service-role API access

## Layers

**Static Presentation Layer:**
- Purpose: HTML shells that bootstrap the frontend application
- Location: root directory (`./*.html`)
- Contains: `index.html` (agent profiles), `join.html` (agent signup), `edit.html` (profile editor), `dashboard.html`, `landing.html`, `pricing.html`, `terms.html`, `privacy.html`
- Depends on: `js/init.js` (bundled as `dist/init.bundle.js`), `styles.css` / `dist/styles.min.css`
- Used by: browsers directly

**Frontend Module Layer:**
- Purpose: ES modules handling all UI rendering, data fetching, and user interactions
- Location: `js/`
- Contains: 12 distinct modules — `config.js`, `state.js`, `utils.js`, `icons.js`, `analytics.js`, `properties.js`, `filters.js`, `gallery.js`, `property-detail.js`, `mortgage.js`, `lead-modal.js`, `agent-page.js`, `init.js`
- Depends on: Supabase JS SDK (CDN), `js/config.js` for URL/client
- Used by: HTML entry points via bundled `dist/init.bundle.js`

**Shared State Layer:**
- Purpose: Single source of truth for mutable frontend state
- Location: `js/state.js`
- Contains: `currentAgent`, `allProperties`, `currentFilters` — exported as `let` with setter functions
- Depends on: nothing
- Used by: `agent-page.js`, `analytics.js`, `properties.js`, `filters.js`, `lead-modal.js`, `mortgage.js`

**Edge Function Layer (Supabase-hosted):**
- Purpose: Server-side business logic — lead capture, auth, property ingest, analytics
- Location: `edge-functions/`
- Contains: `capture-lead-v4/`, `send-magic-link/`, `verify-magic-link/`, `update-agent/`, `whatsapp-ingest/`, `lead-followup-nagger/`, `instagram-auth/`, `tiktok-auth/`
- Depends on: Supabase service_role key (Deno env), Resend API, Facebook CAPI, Claude AI (whatsapp-ingest), WhatsApp Business API
- Used by: frontend JS (`fetch` calls), WhatsApp webhook, scheduled cron triggers

**Netlify Edge Function Layer:**
- Purpose: SSR OG meta injection for social bots; runs at CDN edge before HTML is served
- Location: `netlify/edge-functions/og-injector.ts`
- Contains: Bot detection, Supabase agent lookup, HTML rewrite with agent-specific og:tags
- Depends on: Supabase anon key
- Used by: Netlify CDN for all `/a/*` routes (configured in `netlify.toml`)

**Database Layer (Supabase/PostgreSQL):**
- Purpose: Persistent storage with RLS enforcing access control per table
- Location: `sql/` (schema and policy files)
- Tables: `agents`, `properties`, `leads`, `magic_links`, `events`/`page_events`, `mortgage_rates`, `mortgage_applications`
- RLS: anon role reads only verified agents/active properties; all writes go through service_role edge functions
- Key files: `sql/rls_policies.sql`, `sql/magic_links_table.sql`, `sql/indexes.sql`

## Data Flow

**Agent Profile Page Load:**

1. Browser requests `/a/{slug}` — Netlify edge function (`og-injector.ts`) intercepts
2. If request is a social bot: fetches agent from Supabase, rewrites HTML og:tags, returns enriched HTML
3. If not a bot: passes through to static `index.html`
4. `index.html` loads `dist/init.bundle.js`
5. `js/init.js` extracts slug from URL path (`/a/{slug}` or `?agent={slug}`)
6. Fetches agent row from Supabase `agents` table (anon key, only verified agents visible via RLS)
7. Calls `renderAgent(agent)` — sets state, renders DOM
8. Side-effect modules load in parallel: `gallery.js`, `property-detail.js`, `lead-modal.js`, `filters.js`
9. `mortgage.js` lazy-loaded only on first "Get Pre-Approved" click

**Lead Capture Flow:**

1. User submits lead form → `lead-modal.js` POSTs to `capture-lead-v4` Supabase Edge Function
2. Edge function validates payload, checks 24h dedup window, inserts into `leads` table (service_role)
3. Sends Resend email notification to agent with WhatsApp/Call/Email deep links
4. If agent has `facebook_pixel_id` + `facebook_capi_token` (pro tier): fires Facebook CAPI `Lead` event
5. If agent has `webhook_url` (pro tier): fire-and-forget CRM webhook
6. `lead-followup-nagger` edge function runs on schedule: finds unresponded leads > 30 min, sends reminder email

**Agent Authentication Flow:**

1. Agent enters email on `/edit.html` → frontend POSTs to `send-magic-link` edge function
2. Edge function rate-limits (3 per 15 min), creates token in `magic_links` table, sends Resend email
3. Agent clicks link → `verify-magic-link` edge function validates token (15-min expiry, single-use)
4. Returns full agent data — frontend stores token in memory for session
5. Profile edits POST to `update-agent` edge function with `{ token, updates }` — token re-verified on every update

**WhatsApp Property Ingest:**

1. Agent sends photo + caption to WhatsApp Business number
2. `whatsapp-ingest` edge function receives webhook
3. Parses caption (price, beds, type, area), extracts amenities via keyword map
4. Calls Claude AI API to generate professional property description
5. Inserts property into `properties` table (service_role)
6. Replies to agent with Instagram + TikTok caption templates

**State Management:**
- No reactive framework — shared state in `js/state.js` (`currentAgent`, `allProperties`, `currentFilters`)
- Modules import state directly; `setCurrentAgent()`, `setAllProperties()`, `setCurrentFilters()` are the only mutation points
- UI updates triggered imperatively (render function calls, DOM manipulation)

## Key Abstractions

**Edge Function Pattern:**
- Purpose: All edge functions follow the same structure — CORS handling, input validation, Supabase service_role client init, business logic, Resend email
- Examples: `edge-functions/capture-lead-v4/index.ts`, `edge-functions/send-magic-link/index.ts`
- Pattern: `Deno.serve(async (req) => { cors check → validate → supabase op → external API → respond })`

**Agent Slug Routing:**
- Purpose: Resolve agent from URL — supports `/a/{slug}`, `/{slug}`, and `?agent={slug}` formats
- Examples: `js/utils.js` → `getAgentSlug()`
- Pattern: URL path parsing with fallback to query parameter

**Feature Tier Gating:**
- Purpose: Gate pro features (Calendly, FB CAPI, CRM webhook) on agent's `tier` column
- Examples: `edge-functions/capture-lead-v4/index.ts`, `js/agent-page.js`
- Pattern: `if (agent.facebook_pixel_id && agent.tier !== 'free') { ... }`

**Error Boundary Loading:**
- Purpose: Prevent one failing module from killing the entire page
- Examples: `js/init.js` → `loadModules()`
- Pattern: each dynamic import wrapped in `try/catch`, failures logged but not propagated

## Entry Points

**Agent Profile (`index.html`):**
- Location: `/index.html` + `dist/init.bundle.js`
- Triggers: Browser navigation to any agent URL pattern
- Responsibilities: Resolves slug, fetches agent, renders profile, loads feature modules

**Agent Editor (`edit.html`):**
- Location: `/edit.html`
- Triggers: Agent navigates to their edit URL
- Responsibilities: Magic link auth flow, profile editing, image uploads to Supabase Storage

**Join/Onboarding (`join.html`):**
- Location: `/join.html`
- Triggers: New agent signup
- Responsibilities: Agent registration form, DLD number verification

**Dashboard (`dashboard.html`):**
- Location: `/dashboard.html`
- Triggers: Agent/admin navigates to dashboard
- Responsibilities: Lead management, analytics display

**OG Injector (Netlify Edge):**
- Location: `netlify/edge-functions/og-injector.ts`
- Triggers: Any `/a/*` request intercepted at CDN edge
- Responsibilities: Bot detection, Supabase fetch, HTML og:tag rewrite for social sharing

## Error Handling

**Strategy:** Defensive loading with graceful degradation; critical path must never fail silently

**Patterns:**
- Module load failures caught per-module in `init.js` — page continues with reduced functionality
- 10-second timeout guard on agent fetch — shows error state if Supabase is unresponsive
- Non-critical enhancements (schema.org, OG meta, analytics, owner check) each wrapped in individual try/catch in `init.js`
- `error-tracking.js` captures unhandled errors and promise rejections; buffers up to 10 per page load; optional Sentry DSN integration
- Edge functions return structured `{ error: "..." }` JSON with appropriate HTTP status codes
- Frontend checks `navigator.onLine` and shows offline banner; service worker provides cache-first fallback for static assets

## Cross-Cutting Concerns

**Logging:** Custom analytics via `js/analytics.js` → POSTs to `log-event` Supabase Edge Function. Click tracking via event delegation on `[data-track]` attributes. Error tracking via `error-tracking.js` with optional Sentry integration.

**Validation:** Input sanitization in `js/utils.js` (`escHtml`, `escAttr`, `safeUrl`, `safeTrackingId`). Edge functions validate all POST body fields and return 400 on malformed input. Honeypot field on lead form for bot detection.

**Authentication:** Magic link auth only — no passwords. Token stored in memory per session (not localStorage). All writes to sensitive tables go through edge functions using Supabase `service_role` key. Anon key used client-side for read-only public data only.

---

*Architecture analysis: 2026-03-27*
