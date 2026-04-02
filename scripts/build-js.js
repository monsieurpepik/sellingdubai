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
// If neither env var is set (local dev, CI without secrets) the prod values are
// used as a fallback — the same values already hardcoded in js/config.js.

const esbuild = require('esbuild');
const fs = require('fs');

const PROD_URL = 'https://pjyorgedaxevxophpfib.supabase.co';
const PROD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqeW9yZ2VkYXhldnhvcGhwZmliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMjU2MzYsImV4cCI6MjA4OTgwMTYzNn0.IhIpAxk--Y0ZKufK51-CPuhw-NafyLPvhH31iqzpgrU';

const url = process.env.SUPABASE_URL || PROD_URL;
const key = process.env.SUPABASE_ANON_KEY || PROD_KEY;

const context = process.env.CONTEXT || process.env.NODE_ENV || 'unknown';
console.log(`build-js: SUPABASE_URL=${url.slice(0, 40)}... (context: ${context})`);

fs.mkdirSync('dist', { recursive: true });

esbuild.build({
  entryPoints: ['js/init.js'],
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

// Patch pricing.html BILLING_LIVE flag from build-time env var.
// pricing.html is served directly from root (publish = ".") and is not
// processed by esbuild, so we do a string replacement here instead.
// Safe to run in-place: Netlify CI starts from a fresh clone each deploy.
// Locally, BILLING_LIVE defaults to false so this is a no-op.
const billingLive = process.env.BILLING_LIVE === 'true';
const pricingPath = 'pricing.html';
const pricingHtml = fs.readFileSync(pricingPath, 'utf8');
const pricingPatched = pricingHtml.replace(
  'const BILLING_LIVE = false;',
  `const BILLING_LIVE = ${billingLive};`
);
if (pricingPatched === pricingHtml && billingLive) {
  console.error('build-js: BILLING_LIVE patch failed — target string not found in pricing.html');
  process.exit(1);
}
// Only write + log when a change was actually made (billingLive=false is a no-op).
// Running locally with BILLING_LIVE=true modifies pricing.html in-place;
// reset with: git checkout pricing.html
if (pricingPatched !== pricingHtml) {
  fs.writeFileSync(pricingPath, pricingPatched, 'utf8');
  console.log(`build-js: pricing.html BILLING_LIVE patched to ${billingLive}`);
}
