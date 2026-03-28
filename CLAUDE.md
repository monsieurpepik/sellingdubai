# CLAUDE.md — SellingDubai App

Project-level instructions for Claude Code. These rules apply in every session.

## Performance Budget — Non-negotiable

These rules exist because the site has been optimized from Performance 56 → 82 (Lighthouse) through disciplined asset management. Every rule below maps to a real regression we fixed.

### JavaScript
- Every new JS feature must be lazy loaded if not needed on first paint. No exceptions. The `js/init.js` entry point uses esbuild code splitting — add dynamic `import()` for any module that isn't required before interactivity.
- `init.bundle.js` must stay under 30KB (currently ~23KB). If a change pushes it over, split the module into a new chunk.
- Before any deploy, run `npm run build` and check that no new chunks in `dist/chunks/` exceed 20KB without explicit justification documented in `DECISIONS.md`.

### Third-Party Scripts
- No new third-party scripts without explicit approval. Every script must justify its weight in `DECISIONS.md`.
- Current approved third-party scripts: Sentry (`browser.sentry-cdn.com`), Supabase JS CDN, Google Fonts, Google Analytics/GTM, Facebook Pixel.
- Any new edge function call on page load must be non-blocking — use `Promise.allSettled()`, never `await` in sequence.

### Images
- All images uploaded by agents must be served via Netlify Image CDN transform URLs: `/.netlify/images?url=<original>&w=<width>&fm=webp&q=80`
- The Supabase domain is allowlisted in `netlify.toml` under `[images] remote_images`.
- Never link directly to the raw Supabase storage URL for any image rendered in the UI.

### Fonts
- No new Google Fonts. The existing stack is Manrope + Inter (Latin subset) loaded async with `rel="preload" as="style" onload`.
- If icons are needed, extend the existing Material Symbols request with `&icon_names=` — do not add a second icon font.
- System font fallback stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.

## Pre-Deploy Checklist

Run these checks before every deploy, in order. These rules exist because each one maps to a real bug or revenue regression found in production.

### Build
- [ ] `npm run build` passes with no new errors
- [ ] `dist/init.bundle.js` is under 30KB (currently ~23KB) — check esbuild output
- [ ] No new chunks in `dist/chunks/` exceed 20KB without justification in `DECISIONS.md`
- [ ] No new third-party `<script>` tags added without approval
- [ ] Any new images use Netlify Image CDN transform URLs — no raw `supabase.co/storage` URLs in rendered UI

### CTAs and routing
- [ ] All CTAs on `index.html` and `landing.html` point to correct destinations — "Get Your Page", "Claim your profile", and referral links must go to `/join`, not `/#hero-waitlist` or any waitlist anchor

### Field name consistency
- [ ] Any field collected in `join.html` and later read in `dashboard.html` uses the same column name — the `bio` vs `tagline` mismatch broke the onboarding checklist for every signup. When in doubt, `grep` for the field name across both files before deploying.

### Lazy-load callbacks
- [ ] No lazy-load callback calls `window.<functionName>()` without first checking that the function has been replaced by the imported module — use a named function expression and guard: `if (window.fn !== namedLazy) window.fn()`

### Billing gate
- [ ] Confirm `BILLING_LIVE` flag status in `pricing.html` is intentional. It is `false` by default. Only set to `true` when Stripe price IDs are confirmed in production env vars and billing is ready to open.

### Diff review
- [ ] Run `git diff` and scan for obviously broken patterns: raw Supabase URLs, `href="#"` or waitlist anchors on primary CTAs, hardcoded field names that diverge from the DB schema, `?? "pro"` fallbacks in webhook handlers

