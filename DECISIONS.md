# Architecture Decisions Log

## 2026-03-27 — Modular JS Extraction + Performance + Design System

### What we did

**JS Modularization**
- Extracted monolithic `app.js` (2,313 lines) into 12 ES modules in `js/`
- `config.js`, `state.js`, `utils.js`, `icons.js`, `analytics.js`, `properties.js`, `filters.js`, `gallery.js`, `property-detail.js`, `mortgage.js`, `lead-modal.js`, `agent-page.js`, `init.js`
- Shared mutable state (`currentAgent`, `allProperties`, `currentFilters`) lives in `state.js` with setter functions
- Original `app.js` preserved as `app.js.bak`, commented out in index.html as fallback

**Build Pipeline**
- Added esbuild with ESM code splitting: `init.bundle.js` (22.7KB) + lazy-loaded chunks
- Mortgage calculator (16.2KB) only loads on first "Get Pre-Approved" click
- CSS minification via esbuild: `styles.css` → `dist/styles.min.css`
- Netlify build runs `npm run build` automatically (CSS + JS + styles)
- Hashed chunk filenames with 1-year immutable cache headers

**Performance**
- Initial JS: 124KB → 22.7KB (82% reduction)
- Error boundaries: each module loads in try/catch, one failure doesn't kill the app
- Property card images: Netlify Image CDN (WebP, 800px max, q80)
- Explicit `width`/`height` on all images (fixes CLS)
- Supabase CDN script preloaded
- Lighthouse: Performance 77, Accessibility 100, Best Practices 100, SEO 100

**Security**
- Hardened CSP: `frame-ancestors 'none'`, `form-action 'self'`, `upgrade-insecure-requests`
- HSTS: 2 years with `preload`
- COOP/CORP headers added
- Permissions-Policy expanded to 11 APIs
- X-XSS-Protection set to `0` (per OWASP — deprecated header)
- RLS policies written for all 7 Supabase tables
- Database indexes written for all query patterns

**Design System**
- 548 hardcoded CSS values migrated to custom properties
- Colors (111), border-radius (86), font-size (148), durations (203)
- `:root` defines 45+ tokens across 5 categories

**Premium UI**
- `prefers-reduced-motion` global rule
- Carousel dots: glass pill with elongated active indicator (Airbnb pattern)
- Price typography: stacked "AED" label above bold number
- Photo viewer: opacity crossfade between photos (no hard cuts)
- Range slider: 2px track, 20px thumb, brand-blue glow on drag
- Mortgage steps: circular numbered indicators with connecting lines

**Testing**
- Deno integration tests for `capture-lead-v4` (14 tests) and `send-magic-link` (9 tests)
- Covers: happy path, validation, rate limiting, dedup, honeypot, CORS, enumeration prevention
- JS module smoke test at `js/test-modules.html`

## 2026-03-29 — Security Hardening Round 2

### Intentional non-obvious choices

**pricing.html has `<meta name="robots" content="noindex, nofollow">`**
This is intentional. Billing is not yet live (BILLING_LIVE=false). We do not want the pricing page indexed before Stripe is configured and tested in production. Remove the noindex tag and flip BILLING_LIVE to true when billing opens.

**landing.html CTAs point to `#waitlist` anchor**
Intentional through 2026-04-05 (billing launch date). Once billing opens, update all CTAs on landing.html from `#waitlist` to `/join` and remove the waitlist section.

### What's next

- Migrate remaining hardcoded colors (non-exact matches) to design tokens
- Self-host Google Fonts for performance (eliminates render-blocking request)
- Add `srcset` to agent avatar for responsive images
- Write Deno tests for remaining edge functions (verify-magic-link, update-agent, whatsapp-ingest)
- Consider dark/light theme toggle using the token system
- Fix the stray `}` CSS syntax warnings (lines 587, 2386)

## 2026-03-30 — REM Off-Plan: Enrich Sync with Detail API

### Decision

Update `sync-rem-offplan` (Supabase Edge Function) to call the REM detail endpoint for each project after the main list sync:

```
POST https://my.remapp.ae/api/public/websites_project_detail
```

Store four new fields on `public.projects`:

- `gallery_images TEXT[]` — array of image URLs from the detail response
- `floor_plan_urls TEXT[]` — floor plan images
- `payment_plan_detail JSONB` — full payment plan breakdown (booking %, construction instalments %, handover %)
- `available_units JSONB` — unit types with availability, sizes, prices

### Why

The current sync only hits the REM list endpoint, which returns summary data (cover image only). The detail endpoint returns the full gallery, floor plans, structured payment plan, and unit availability per project. Without this enrichment, `project-detail.js` is limited to one hero image and no unit data. Storing at sync time (not at request time) keeps the detail page fast and avoids browser CORS issues with the REM API.

### Schema change required

Run in Supabase SQL editor before deploying the updated Edge Function:

```sql
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS gallery_images  TEXT[],
  ADD COLUMN IF NOT EXISTS floor_plan_urls TEXT[],
  ADD COLUMN IF NOT EXISTS payment_plan_detail JSONB,
  ADD COLUMN IF NOT EXISTS available_units JSONB;
```

### What this unlocks in project-detail.js

- Full photo gallery with swipe (from `gallery_images`)
- Floor plan viewer (from `floor_plan_urls`)
- Payment plan breakdown cards — booking %, construction instalments %, handover % (replaces "Contact agent" fallback)
- Available units table — beds, size, price, availability status (from `available_units`)
