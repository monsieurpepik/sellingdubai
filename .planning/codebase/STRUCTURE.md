# Codebase Structure

**Analysis Date:** 2026-03-27

## Directory Layout

```
sellingdubai-app/
├── index.html              # Agent profile SPA (primary page)
├── join.html               # Agent onboarding/registration
├── edit.html               # Agent profile editor (authenticated)
├── dashboard.html          # Lead management dashboard
├── landing.html            # Marketing landing page
├── pricing.html            # Pricing page
├── terms.html              # Terms of service
├── privacy.html            # Privacy policy
├── app.js                  # Legacy monolith (being replaced by js/ modules)
├── app.js.bak              # Backup of original monolith
├── styles.css              # Main stylesheet (source)
├── error-tracking.js       # Global error capture (inline IIFE)
├── sw.js                   # Service worker (cache-first static, network-first HTML)
├── manifest.json           # PWA manifest
├── robots.txt              # SEO crawler rules
├── sitemap.xml             # XML sitemap
├── _redirects              # Netlify redirect rules
├── netlify.toml            # Netlify build, headers, and edge function config
├── package.json            # Build scripts (esbuild, tailwind)
├── tailwind.config.js      # Tailwind configuration
├── landing-input.css       # Tailwind input for landing page
├── landing-output.css      # Generated Tailwind CSS for landing
├── deno.lock               # Deno lockfile for edge functions
├── DECISIONS.md            # Architecture decision log
├── TIER-ARCHITECTURE.md    # Premium tier design (Stripe integration plan)
├── js/                     # ES module source files
│   ├── config.js           # Supabase URL/key/client, feature flags
│   ├── state.js            # Shared mutable state with setter functions
│   ├── utils.js            # escHtml, safeUrl, getAgentSlug, handleImgError
│   ├── icons.js            # SVG icon constants
│   ├── analytics.js        # Event logging, click delegation, page view tracking
│   ├── agent-page.js       # renderAgent, showPage, injectSchemaOrg, hydrateOgMeta
│   ├── properties.js       # Property loading, rendering, carousel, filtering
│   ├── filters.js          # Filter overlay UI, filter state management
│   ├── gallery.js          # Full gallery overlay, photo navigation
│   ├── property-detail.js  # Property detail overlay rendering
│   ├── lead-modal.js       # Lead capture form, validation, submission
│   ├── mortgage.js         # Mortgage calculator (lazy-loaded)
│   ├── init.js             # App entry point: slug resolution, agent fetch, module loading
│   └── test-modules.html   # Browser smoke test for module loading
├── dist/                   # Built output (generated, committed)
│   ├── init.bundle.js      # Bundled entry point (esbuild, ESM splitting)
│   ├── init.bundle.js.map  # Source map
│   ├── app.bundle.js       # Legacy app bundle
│   ├── app.bundle.js.map   # Source map
│   ├── styles.min.css      # Minified CSS
│   └── chunks/             # Lazy-loaded code chunks (hashed filenames)
├── edge-functions/         # Supabase Edge Functions (Deno/TypeScript)
│   ├── capture-lead-v4/
│   │   ├── index.ts        # Lead capture: validate, dedup, email, FB CAPI, webhook
│   │   └── index.test.ts   # Deno integration tests (14 tests)
│   ├── send-magic-link/
│   │   ├── index.ts        # Auth: rate-limit, create token, send Resend email
│   │   └── index.test.ts   # Deno integration tests (9 tests)
│   ├── verify-magic-link/
│   │   └── index.ts        # Auth: validate token, return agent data, single-use
│   ├── update-agent/
│   │   └── index.ts        # Authenticated profile update with allowlist of fields
│   ├── whatsapp-ingest/
│   │   ├── index.ts        # WhatsApp webhook: parse → Claude AI → insert property
│   │   └── amenity-parser.ts # Amenity keyword extraction helper
│   ├── lead-followup-nagger/
│   │   └── index.ts        # Scheduled: find unresponded leads, send reminder email
│   ├── instagram-auth/
│   │   └── index.ts        # Instagram OAuth callback handler
│   └── tiktok-auth/
│       └── index.ts        # TikTok OAuth callback handler
├── netlify/
│   └── edge-functions/
│       └── og-injector.ts  # CDN edge: OG tag injection for social bots on /a/* routes
├── sql/                    # Database schema and policy files (run manually in Supabase)
│   ├── rls_policies.sql    # Row Level Security for all 7 tables
│   ├── indexes.sql         # Query performance indexes
│   ├── magic_links_table.sql # magic_links table schema
│   └── followup_nagger_column.sql # Migration: add followup_sent_at column
└── .planning/              # GSD planning documents
    └── codebase/           # Codebase analysis documents
```

## Directory Purposes

**`js/` — Frontend ES Modules:**
- Purpose: All client-side JavaScript logic, split into single-responsibility modules
- Contains: 12 modules covering config, state, rendering, data fetching, UI components
- Key files: `js/init.js` (entry), `js/state.js` (state), `js/agent-page.js` (rendering)
- Build: esbuild bundles `js/init.js` with code splitting into `dist/`

**`edge-functions/` — Supabase Edge Functions:**
- Purpose: All server-side logic — lead capture, auth, property ingest, social OAuth
- Contains: One directory per function, each with `index.ts` and optionally `index.test.ts`
- Deployed to: Supabase (not Netlify) — invoked at `${SUPABASE_URL}/functions/v1/{name}`
- Runtime: Deno with TypeScript, using `https://esm.sh/@supabase/supabase-js@2` imports

**`netlify/edge-functions/` — Netlify Edge Functions:**
- Purpose: CDN-level request interception (only OG meta injection for bots)
- Contains: `og-injector.ts` only
- Runtime: Deno at Netlify CDN edge, triggered by `netlify.toml` route config

**`sql/` — Database Migrations:**
- Purpose: SQL files for manual execution in Supabase SQL editor — not auto-applied
- Contains: RLS policies, table schemas, indexes, migrations
- Note: No migration runner — applied manually; safe to re-run (uses `IF NOT EXISTS`)

**`dist/` — Build Output:**
- Purpose: Production-ready bundled assets served by Netlify
- Generated: Yes — by `npm run build`
- Committed: Yes — Netlify serves directly from root, no build-time generation on deploy
- Cache strategy: `dist/chunks/*` has 1-year immutable cache; `dist/*.js` and `dist/*.css` use long cache

## Key File Locations

**Entry Points:**
- `js/init.js`: Frontend application bootstrap — slug resolution, agent fetch, module loading
- `index.html`: Agent profile page shell — loads `dist/init.bundle.js`
- `join.html`: Agent registration page
- `edit.html`: Agent profile editor (requires magic link auth)

**Configuration:**
- `js/config.js`: Supabase URL, anon key, feature flags (`DEMO_MODE`), endpoint URLs
- `netlify.toml`: Build command, security headers, cache headers, edge function routing
- `tailwind.config.js`: Tailwind CSS configuration
- `package.json`: Build scripts (esbuild + tailwind)

**Core Logic:**
- `js/state.js`: Shared mutable state (`currentAgent`, `allProperties`, `currentFilters`)
- `js/agent-page.js`: Agent rendering, schema.org injection, OG meta hydration
- `js/properties.js`: Property loading from Supabase, card rendering, carousel
- `edge-functions/capture-lead-v4/index.ts`: Lead capture with email + FB CAPI + CRM webhook
- `netlify/edge-functions/og-injector.ts`: Bot detection and OG tag SSR

**Testing:**
- `edge-functions/capture-lead-v4/index.test.ts`: Deno integration tests
- `edge-functions/send-magic-link/index.test.ts`: Deno integration tests
- `js/test-modules.html`: Browser smoke test for ES module loading

**Styles:**
- `styles.css`: Main source CSS with 45+ CSS custom properties (design tokens)
- `dist/styles.min.css`: Minified build output
- `landing-input.css` / `landing-output.css`: Tailwind CSS for landing page only

**Database:**
- `sql/rls_policies.sql`: All Row Level Security policies for 7 tables
- `sql/indexes.sql`: Performance indexes for common query patterns
- `sql/magic_links_table.sql`: `magic_links` table DDL

## Naming Conventions

**Files:**
- kebab-case for all HTML pages: `join.html`, `agent-page.js`, `lead-modal.js`
- kebab-case for edge function directories: `capture-lead-v4/`, `send-magic-link/`
- All edge functions named `index.ts` within their directory
- Test files: `index.test.ts` co-located with `index.ts`

**Directories:**
- kebab-case: `edge-functions/`, `lead-followup-nagger/`
- All lowercase

**JavaScript:**
- camelCase for functions and variables: `renderAgent`, `currentAgent`, `loadModules`
- UPPER_SNAKE_CASE for constants: `SUPABASE_URL`, `DEMO_MODE`, `ALLOWED_ORIGINS`
- Named exports from modules; globals attached to `window` for HTML inline handlers

**CSS:**
- BEM-inspired class names: `prop-tag-just-listed`, `lead-modal`, `btn-lead`
- CSS custom properties with semantic names: `--color-brand-blue`, `--radius-card`, `--duration-base`

**Database:**
- snake_case for all table and column names: `agent_id`, `verification_status`, `facebook_pixel_id`
- Policy names as descriptive strings: `"anon_read_verified_agents"`, `"no_anon_access_leads"`

## Where to Add New Code

**New Frontend Feature:**
- UI module: Create `js/{feature-name}.js` as an ES module
- Register in `js/init.js` `loadModules()` array (parallel load with error boundary)
- For lazy-loaded (large) modules: use the `import()` pattern like `mortgage.js`
- Tests: none currently for frontend modules (only edge functions have tests)

**New Edge Function:**
- Create directory: `edge-functions/{function-name}/`
- Implementation: `edge-functions/{function-name}/index.ts`
- Follow pattern: CORS header setup → validate input → Supabase service_role client → logic → respond
- Tests: `edge-functions/{function-name}/index.test.ts` (Deno test runner)

**New HTML Page:**
- Add `{page-name}.html` at root
- Add to reserved slugs list in `netlify/edge-functions/og-injector.ts`
- Add security headers and cache rules to `netlify.toml` if needed

**New Database Table:**
- Schema: `sql/{table_name}_table.sql`
- RLS: add to `sql/rls_policies.sql`
- Indexes: add to `sql/indexes.sql`
- Run manually in Supabase SQL editor

**Shared Utilities:**
- Frontend helpers: `js/utils.js`
- SVG icons: `js/icons.js`
- Shared state: `js/state.js` (add state variable + setter function)

## Special Directories

**`.netlify/`:**
- Purpose: Netlify CLI cache and build artifacts
- Generated: Yes
- Committed: No (gitignored)

**`dist/`:**
- Purpose: esbuild output (bundled JS + minified CSS)
- Generated: Yes by `npm run build`
- Committed: Yes — Netlify serves directly from repo root

**`sql/`:**
- Purpose: Database management — schema, RLS, indexes
- Generated: No — hand-authored
- Committed: Yes — version-controlled DDL and policy files

**`.planning/`:**
- Purpose: GSD planning documents — architecture analysis, phases, tickets
- Generated: By GSD tooling
- Committed: Yes

---

*Structure analysis: 2026-03-27*
