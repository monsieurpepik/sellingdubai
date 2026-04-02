# Luxury Off-Plan & Mortgage Refactor — Design Spec

**Date:** 2026-04-02
**Goal:** Surface the REM API enrichment data that is currently fetched but silently discarded; upgrade the off-plan card and modal to luxury-tier interactivity; refactor the mortgage calculator to support construction-linked payment schedules.

---

## Context

The `sync-rem-offplan` edge function already fetches rich detail data from the REM API for the top 30 priority projects — payment milestones, gallery images, unit types, facilities, nearby locations, brochure URL. None of this reaches the UI because the DB columns don't exist yet. This sprint closes that gap end-to-end: schema → sync → card → modal → mortgage.

---

## Approach

**Component-first, typed contracts.** The milestone payment structure is defined once as a TypeScript interface in the sync function, stored as typed JSONB, and consumed without guessing by both the off-plan modal and the mortgage calculator. State in the mortgage module is consolidated from 6 globals into one object. The off-plan modal is a new lazy-loaded ES module with internal UI state, consistent with the existing dynamic `import()` architecture.

---

## Module Graph (after)

```
js/utils.js
js/components.js   ← renderOffPlanCard (enhanced)
js/offplan-modal.js (new, lazy)
js/mortgage.js     (refactored)
edge-functions/sync-rem-offplan/index.ts (updated)
sql/014_off_plan_enrichment.sql (new migration)
```

---

## Section 1: Schema Migration

**File:** `sql/014_off_plan_enrichment.sql`

New columns added to `public.projects`:

| Column | Type | Source |
|--------|------|--------|
| `payment_plan_detail` | `JSONB` | `new_payment_plans[]` from REM detail |
| `gallery_images` | `TEXT[]` | `all_images` minus cover image |
| `floor_plan_urls` | `TEXT[]` | `images.general[]` from REM detail |
| `available_units` | `JSONB` | `typical_units[]` from REM detail |
| `facilities` | `JSONB` | `facilities[]` from REM detail |
| `nearby_locations` | `JSONB` | `nearby_locations[]` from REM detail |
| `brochure_url` | `TEXT` | first PDF in `attachments[]` |
| `images_categorized` | `JSONB` | `images` object (interior/exterior/general/other) |

**Typed milestone contract** stored in `payment_plan_detail`:
```json
[
  { "phase": "Booking",      "percentage": 10, "trigger": "on_booking",          "due_date": null },
  { "phase": "Construction", "percentage": 40, "trigger": "during_construction",  "due_date": null },
  { "phase": "Handover",     "percentage": 50, "trigger": "on_handover",          "due_date": "2026-12-01" }
]
```

**What does NOT change:**
- `payment_plan TEXT` stays as the human-readable summary pill ("60/40 Plan") on the card
- No existing columns renamed or removed
- `project_units` table unchanged (unit availability comes from `available_units` JSONB, not the units table)

GIN index added on `gallery_images` for array containment queries.

---

## Section 2: Sync Function Update

**File:** `edge-functions/sync-rem-offplan/index.ts`

**TypeScript interface additions:**

```typescript
interface RemPaymentMilestone {
  phase: string;
  percentage: number;
  trigger: string;
  due_date: string | null;
}
```

The sync function's enrichment block currently writes to `payment_plan_detail` (already the correct column name — matches the new schema). The `RemDetailData` interface gains explicit types for `new_payment_plans` replacing `unknown[]`:

```typescript
new_payment_plans?: RemPaymentMilestone[] | null;
```

**No logic changes** — the mapping code already exists. This update makes it type-safe and ensures the column names match the migration.

---

## Section 3: Off-Plan Card Enhancements

**File:** `js/components.js` — `renderOffPlanCard(p)`

Three additions. Layout and CSS class names unchanged.

### 3.1 Developer Logo
If `p.developer_logo_url` is present, replace the plain text `<div class="offplan-developer">` with a logo + name lockup:
```html
<div class="offplan-developer">
  <img class="offplan-dev-logo" src="<logo_url>" alt="<developer_name>" width="60" height="24" loading="lazy">
  <span class="offplan-dev-name"><developer_name></span>
</div>
```
If no logo URL, falls back to plain text (existing behaviour).

The two Supabase queries in `js/properties.js` that fetch off-plan projects already JOIN `developers` via `developers!projects_developer_id_fkey(name)`. Add `logo_url` to that select: `developers!projects_developer_id_fkey(name, logo_url)`. The card receives the developer as a nested object `p.developers.logo_url`.

### 3.2 Availability Indicator
Derived from `p.available_units` JSONB array. Count items where `status === 'available'` vs total length. Render below the price block:
```html
<div class="offplan-avail">
  <div class="offplan-avail-bar">
    <div class="offplan-avail-fill" style="width: <pct>%"></div>
  </div>
  <span class="offplan-avail-label"><N> units available</span>
</div>
```
If `available_units` is null (non-priority project), this block is omitted entirely.

### 3.3 Click routing
`renderOffPlanCard` currently wires `onclick="openPropertyById('${propId}')"`. Change this to `onclick="openOffPlanModal('${propId}')"` directly — off-plan cards are always off-plan projects, no routing ambiguity. The `prop-view-link` anchor inside the card body gets the same update. `openPropertyById` is unchanged.

---

## Section 4: Off-Plan Detail Modal

**File:** `js/offplan-modal.js` (new, lazy-loaded via dynamic `import()`)

This module is NOT a pure template function. It manages internal UI state and registers a single global entry point.

### State
```js
let _opState = {
  project: null,
  currentSlide: 0,
  activeMilestone: 0,
};
```

### Entry Point
```js
window.openOffPlanModal = async function(projectId) { ... }
```
Fetches the full project row (including joined developer) from Supabase, populates `_opState.project`, renders the modal, appends to `<body>`.

### Modal Structure (top to bottom)

| Section | Data source | Notes |
|---------|-------------|-------|
| Close button | — | `×`, keyboard-accessible |
| Hero gallery | `gallery_images[]` | Swipeable carousel, same pattern as `prop-carousel` |
| Developer badge | `developer_logo_url`, `developer_name` | Logo + name, full-width strip |
| Price & specs | `min_price`, `max_price`, `beds`, `property_types[]`, `min_area_sqft`–`max_area_sqft` | |
| Payment milestone tracker | `payment_plan_detail[]` | Horizontal step indicator; active step highlighted; each step shows phase label, %, trigger, due date |
| Unit types grid | `available_units[]` | Cards: bedroom type, size range, price range, status badge |
| Facilities | `facilities[]` | Icon + name grid (SVG icons mapped by facility name) |
| Nearby locations | `nearby_locations[]` | Distance chips |
| Footer CTAs | `brochure_url`, mortgage trigger | "Download Brochure" → `target="_blank"` link; "Calculate Mortgage" → calls `initMortModal({mode:'offplan', project:{...}})` |

### Loading
Dynamic import triggered on first `openOffPlanModal` call. The bridge is registered in `js/init.js` alongside the existing `openPropertyById` lazy loader:
```js
// js/init.js
window.openOffPlanModal = async function openOffPlanModalLazy(id) {
  const { openOffPlanModal } = await import('./offplan-modal.js');
  window.openOffPlanModal = openOffPlanModal;  // replace bridge on first load
  if (window.openOffPlanModal !== openOffPlanModalLazy) window.openOffPlanModal(id);
};
```

---

## Section 5: Mortgage Refactor

**File:** `js/mortgage.js`

### 5.1 State Consolidation
Replace 6 module-level globals with one object:

```js
let _mortState = {
  mode: 'standard',   // 'standard' | 'offplan'
  step: 1,
  term: 25,
  rate: 3.99,
  data: null,
  rates: [],
  appId: null,
  editToken: null,
  project: null,      // populated in offplan mode only
};
```

All internal functions read/write `_mortState` instead of the individual globals. `window._mortData`, `window._mortRates`, etc. are removed.

### 5.2 Entry Point
```js
window.initMortModal = function(opts = {}) {
  _mortState = { ..._mortStateDefaults, ...opts };
  _renderMortStep();
};
```

Called with no args for standalone. Called from off-plan modal with:
```js
initMortModal({
  mode: 'offplan',
  project: {
    name: p.name,
    minPrice: p.min_price,
    milestones: p.payment_plan_detail,
    completionDate: p.completion_date,
  }
});
```

### 5.3 Off-Plan Mode — Step 1 Replacement
Standard Step 1 shows eligibility income/property inputs. In off-plan mode, Step 1 is replaced with a **milestone cost breakdown**:

| Line item | Formula |
|-----------|---------|
| Booking payment | `milestone[0].percentage / 100 × price` |
| Construction payments | sum of intermediate milestones |
| Handover balance | final milestone |
| DLD fee | `0.04 × price` |
| Agent commission | `0.02 × price` (toggleable checkbox) |
| **Total cash required** | booking + DLD + agent commission |
| **Loan amount** | handover balance (or full price minus booking, agent preference) |

Steps 2–4 (compare rates → details → pre-qualified) continue after Step 1 unchanged.

### 5.4 Amortization Bar (Step 4 addition)
Added to the pre-qualified result screen. A single horizontal CSS bar showing principal vs total interest, plus two summary numbers. No third-party library. Rendered inline:
```html
<div class="mort-amort-bar">
  <div class="mort-amort-principal" style="width:<pct>%"></div>
  <div class="mort-amort-interest"  style="width:<pct>%"></div>
</div>
<div class="mort-amort-labels">
  <span>Principal: AED <X></span>
  <span>Total interest: AED <Y></span>
</div>
```

### 5.5 What Doesn't Change
- Bank card rendering and hardcoded bank abbreviations
- Supabase application submission (Steps 3–4)
- Edit/resume flow (`_mortAppId`, `_mortEditToken` — renamed to fields in `_mortState`)
- All existing CSS classes
- Standard mode behaviour is identical to today

---

## What Does NOT Change

- No HTML file changes
- No new third-party scripts
- No new `<script>` tags in any HTML file
- `init.bundle.js` unaffected (new module is lazy-loaded)
- Regular property cards and modal unchanged
- Agency dashboard unchanged
- All existing carousel, heart, and touch handlers in `properties.js` unchanged

---

## Bundle Impact

`offplan-modal.js` loads on first off-plan card click — not on page load. The existing performance budget is unaffected. The mortgage refactor is an in-place rewrite of `mortgage.js` with no size increase expected.
