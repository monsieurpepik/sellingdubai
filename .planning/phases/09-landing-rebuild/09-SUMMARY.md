---
phase: 09
plan: 09
subsystem: landing
tags: [landing, wizard, conversion, html, vanilla-js]
dependency_graph:
  requires: []
  provides: [landing-wizard-js, landing-hero-rebuild, wizard-modal, facts-row]
  affects: [landing.html, js/landing-wizard.js]
tech_stack:
  added: []
  patterns: [vanilla-iife, standalone-wizard, inline-css, data-attribute-triggers]
key_files:
  created:
    - js/landing-wizard.js
  modified:
    - landing.html
decisions:
  - Wizard implemented as standalone IIFE — no build step, no imports, reads window.__SD_SUPABASE_URL__
  - BRN auto-uppercased on input (UX improvement beyond plan spec)
  - Success step shows review messaging rather than immediate activation
  - Navigation login link uses CSS class instead of inline onmouseover handlers (a11y improvement)
metrics:
  duration_minutes: 0
  completed_date: "2026-04-08"
  tasks_completed: 4
  files_changed: 2
---

# Phase 09 Plan 09: Landing Page Rebuild Summary

**One-liner:** Minimal claim-page landing with 3-step DLD wizard modal replacing all below-fold selling content — logo + headline + CTA opens wizard, below-fold is 3-facts row + footer only.

## What Was Built

### Task 1: `js/landing-wizard.js` (IIFE wizard)

Created `/Users/bobanpepic/Desktop/sellingdubai-app/js/landing-wizard.js` — a standalone IIFE with:
- `// @ts-check` on line 1
- Opens on any `[data-open-wizard]` click
- Step 1: name (min 2 chars) + email (regex validated) + WhatsApp (optional)
- Step 2: DLD BRN (required, auto-uppercased on input)
- Step 3: Success screen
- Progress dots update on each step
- Close on backdrop click, × button, or Escape key
- POST to `window.__SD_SUPABASE_URL__ + /functions/v1/waitlist-join`
- Error handling: validation errors shown inline; network errors restore submit button

Key commits:
- `6791352` feat: add landing-wizard.js — 3-step claim-profile modal
- `a85bc51` fix: tighten wizard guard, move BRN focus to form1 handler
- `013e24f` fix: add null guards for optional wizard elements
- `9a547c8` fix: apply unsafe Biome fixes in landing-wizard.js

### Task 2: `landing.html` — head meta + inline CSS

- Title updated to "The Operating System for Dubai Real Estate Agents"
- OG/Twitter meta updated to match
- Dubai-skyline preload link removed (no longer above fold)
- Hero, facts-row, and wizard CSS added to inline `<style>` block
- Kept phone-frame CSS (inert — no longer used in HTML but harmless)

Key commit: `4e4baed` feat: update landing.html head meta + add wizard/above-fold CSS

### Task 3: `landing.html` — nav + hero + wizard modal HTML

- Old multi-link nav replaced with single "Agent Login" link
- Old multi-paragraph hero replaced with:
  - `.hero-brand` — "SellingDubai" wordmark
  - `.hero-headline` — "The Operating System for Dubai Real Estate Agents"
  - `.hero-subline` — "DLD-verified. Your leads. Your brand. Free."
  - `[data-open-wizard]` CTA button — "Claim Your Profile →"
  - `#agent-count-live` span (fed by landing-behavior.js)
- Wizard modal HTML inserted after hero section with all 3 steps + progress dots

Key commit: `a8055f1` feat: replace landing.html nav + hero with minimal above-fold + wizard modal HTML

### Task 4: `landing.html` — below-fold + script tag

- All below-fold selling sections removed (Product Preview, Features, How It Works, FAQ)
- 3-facts row added: 100% Free, DLD badge, 0% commission
- Sticky mobile CTA updated from `<a href="/join">` to `<button data-open-wizard>`
- `<script src="/js/landing-wizard.js" defer></script>` added after existing scripts
- Pre-deploy check passes (no FAIL items — CTA check #5 passes cleanly)

Key commit: `894690f` feat: landing.html — replace below-fold with 3-facts row, wizard sticky CTA

## Build Verification

`npm run build` passes. Bundle sizes:
- `dist/init.bundle.js`: 8.2KB (budget: 30KB) — PASS
- All chunks introduced by this plan: 0 (wizard is a non-bundled IIFE)
- Pre-existing chunk warnings: `agent-page` (~29KB), `mortgage` (~20KB), `project-detail` (~22KB) — pre-existing, documented in DECISIONS.md

Pre-deploy check: 0 FAILs, 3 WARNs (all pre-existing).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Navigation login link used inline onmouseover/onmouseout handlers**
- **Found during:** Task 3
- **Issue:** Plan spec used `onmouseover="this.style.color='#0a0a0a'"` — violates CSP no-unsafe-inline policy enforced in CLAUDE.md
- **Fix:** Replaced with `.landing-nav-login` CSS class with `:hover` rule in inline style block
- **Files modified:** landing.html (nav + style block)
- **Commit:** `4e4baed`

**2. [Rule 2 - Enhancement] BRN auto-uppercase on input**
- **Found during:** Task 1
- **Issue:** DLD BRN numbers are always uppercase; not auto-correcting creates UX friction
- **Fix:** Added `input` event listener that uppercases BRN field value while preserving cursor position
- **Files modified:** js/landing-wizard.js
- **Commit:** `6791352`

## Known Stubs

None. The wizard POSTs to the real `waitlist-join` edge function. Agent count is fetched by the existing `landing-behavior.js`.

## Threat Flags

None. No new network endpoints or auth paths introduced. `landing-wizard.js` calls only the pre-existing `waitlist-join` edge function.

## Self-Check: PASSED

- [x] `/Users/bobanpepic/Desktop/sellingdubai-app/js/landing-wizard.js` — EXISTS
- [x] `/Users/bobanpepic/Desktop/sellingdubai-app/landing.html` — EXISTS, contains hero + wizard modal + facts row
- [x] `hero-above-fold`, `wizard-overlay`, `wizard-step-1`, `wizard-step-3` — verified in landing.html
- [x] `agent-count-live` span — present (1 match)
- [x] `landing-wizard.js` script tag — present in landing.html
- [x] `npm run build` — passes, init.bundle.js 8.2KB (< 30KB)
- [x] Pre-deploy check — 0 FAILs
- [x] Commits exist: `6791352`, `4e4baed`, `a8055f1`, `894690f`
