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

## 2026-03-30 — REM Off-Plan: Gallery + Floor Plans via Detail Endpoint

### Decision

Update `sync-rem-offplan` (Supabase Edge Function) to call the REM detail endpoint for each project and store two new fields on `public.projects`:

- `gallery_images JSONB` — array of image URLs from the project detail response
- `floor_plan_urls TEXT[]` — array of floor plan image URLs

### Why

The current sync only hits the REM list endpoint, which returns summary data (cover image only). The detail endpoint returns the full image gallery and floor plans per project. Without fetching the detail endpoint per project, `project-detail.js` can only show one hero image. Storing these in the DB (rather than fetching at runtime) keeps the detail page fast and avoids CORS issues with the REM API from the browser.

### Schema change required

```sql
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS gallery_images JSONB,
  ADD COLUMN IF NOT EXISTS floor_plan_urls TEXT[];
```

Apply in Supabase SQL editor before deploying the updated Edge Function.

### What this unlocks

- `project-detail.js` can render a scrollable image gallery from `gallery_images`
- Floor plans can be shown as a separate section below the description
- No changes needed to the Supabase query in `project-detail.js` — just add the two columns to the SELECT
