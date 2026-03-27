# Technology Stack

**Analysis Date:** 2026-03-27

## Languages

**Primary:**
- JavaScript (ES Modules) — Frontend app logic (`js/`, `app.js`, `sw.js`, `error-tracking.js`)
- TypeScript — All Supabase edge functions (`edge-functions/*/index.ts`)

**Secondary:**
- CSS — Styles via Tailwind (`landing-input.css`, `styles.css`, compiled to `dist/`)
- SQL — Database schema and RLS policies (`sql/`)
- HTML — Static page templates (`index.html`, `dashboard.html`, `edit.html`, `join.html`, etc.)

## Runtime

**Environment:**
- Browser — Frontend runs as a vanilla JS SPA (no framework)
- Deno — Edge functions run on Supabase's Deno runtime (Deno.serve pattern used throughout)
- Netlify Edge Runtime — `netlify/edge-functions/og-injector.ts` runs on Netlify's edge

**Package Manager:**
- npm
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- None — Vanilla JavaScript SPA. No React, Vue, or Angular.
- Supabase JS SDK `@supabase/supabase-js@2.49.4` — loaded via CDN (`cdn.jsdelivr.net`) for browser; loaded via `https://esm.sh/` in Deno edge functions

**CSS:**
- Tailwind CSS `^3.4.17` — utility-first CSS framework
- `@tailwindcss/forms ^0.5.9` — form element styling plugin
- `@tailwindcss/container-queries ^0.1.1` — container query support

**Build/Dev:**
- esbuild `^0.27.4` — bundles `js/init.js` with code splitting, generates `dist/`
- Custom fonts: Manrope (headlines), Inter (body) — loaded from Google Fonts

## Key Dependencies

**Critical:**
- `@supabase/supabase-js@2.49.4` — database, auth, storage, and edge function invocation
  - CDN: `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.min.js`
  - Deno: `https://esm.sh/@supabase/supabase-js@2`
- Deno std `0.224.0` — standard library for edge function tests (`deno.lock`)

**Infrastructure:**
- Netlify — deployment platform; `netlify.toml` defines build command, edge functions, and all HTTP security headers
- Supabase — backend-as-a-service: PostgreSQL database, file storage (`agent-images` bucket), edge functions runtime

## Configuration

**Environment:**
- `.env.example` documents all required environment variables (see INTEGRATIONS.md)
- Edge functions read secrets via `Deno.env.get()`
- No `.env` file committed; secrets managed in Supabase dashboard

**Build:**
- `tailwind.config.js` — custom theme: brand colors, Manrope/Inter fonts, card border-radius
- `netlify.toml` — build command (`npm install && npm run build`), publish dir (`.`), edge function bindings, security headers, cache-control rules
- `package.json` — three build scripts: `build:css` (Tailwind), `build:js` (esbuild), `build:styles` (esbuild CSS minification)

## Platform Requirements

**Development:**
- Node.js (for npm/esbuild/Tailwind build tools)
- Deno (for running/testing edge functions locally via `deno.lock`)

**Production:**
- Netlify — static hosting + edge functions (`netlify/edge-functions/`)
- Supabase — database, storage, and serverless edge functions (`edge-functions/`)

## PWA Support

- `manifest.json` — PWA manifest (standalone display mode, black theme)
- `sw.js` — Service worker with cache-first strategy for static assets, network-first for API calls (cache version: `sd-v21`)

---

*Stack analysis: 2026-03-27*
