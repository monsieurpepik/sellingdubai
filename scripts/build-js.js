#!/usr/bin/env node
// scripts/build-js.js — bundle js/init.js with esbuild, injecting Supabase config.
//
// SUPABASE_URL and SUPABASE_ANON_KEY are read from the environment at build time
// and baked into the bundle via esbuild --define. This lets each Netlify deploy
// context point at a different Supabase project:
//
//   production     → SUPABASE_URL=https://pjyorgedaxevxophpfib.supabase.co  (set in Netlify)
//   deploy-preview → SUPABASE_URL=https://lhrtdlxqbdxrfvjeoxrt.supabase.co  (set in Netlify)
//   branch-deploy  → SUPABASE_URL=https://lhrtdlxqbdxrfvjeoxrt.supabase.co  (set in Netlify)
//
// Both env vars must be set — there are no hardcoded fallbacks. The build will
// fail fast with a clear error if either is missing.

const esbuild = require('esbuild');
const fs = require('fs');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;

if (!url) {
  console.error('build-js: SUPABASE_URL is not set — set it in your environment or .env file');
  process.exit(1);
}
if (!key) {
  console.error('build-js: SUPABASE_ANON_KEY is not set — set it in your environment or .env file');
  process.exit(1);
}

const context = process.env.CONTEXT || process.env.NODE_ENV || 'unknown';
console.log(`build-js: SUPABASE_URL=${url.slice(0, 40)}... (context: ${context})`);

fs.mkdirSync('dist', { recursive: true });

esbuild.build({
  entryPoints: ['js/init.js', 'js/agency-page.js'],
  bundle: true,
  minify: true,
  sourcemap: true,
  format: 'esm',
  splitting: true,
  outdir: 'dist',
  entryNames: '[name].bundle',
  chunkNames: 'chunks/[name]-[hash]',
  define: {
    __SUPABASE_URL__: JSON.stringify(url),
    __SUPABASE_ANON_KEY__: JSON.stringify(key),
  },
}).catch(() => process.exit(1));

// Patch js/pricing.js BILLING_LIVE flag from build-time env var.
// The source file defaults to false; Netlify sets BILLING_LIVE=true in production.
// Safe to run in-place: Netlify CI starts from a fresh clone each deploy.
// Locally, BILLING_LIVE defaults to false so this is a no-op.
const billingLive = process.env.BILLING_LIVE === 'true';
const pricingPath = 'js/pricing.js';
const pricingSource = fs.readFileSync(pricingPath, 'utf8');
// Replace whichever boolean is currently present — idempotent for repeated local builds.
const pricingPatched = pricingSource.replace(
  /var BILLING_LIVE = (true|false);/,
  `var BILLING_LIVE = ${billingLive};`
);
if (pricingPatched === pricingSource && !/var BILLING_LIVE = (true|false);/.test(pricingSource)) {
  console.error('build-js: BILLING_LIVE patch failed — declaration not found in js/pricing.js');
  process.exit(1);
}
if (pricingPatched !== pricingSource) {
  fs.writeFileSync(pricingPath, pricingPatched, 'utf8');
  console.log(`build-js: js/pricing.js BILLING_LIVE patched to ${billingLive}`);
}
