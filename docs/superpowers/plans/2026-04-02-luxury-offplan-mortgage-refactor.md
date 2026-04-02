# Luxury Off-Plan & Mortgage Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface REM API enrichment data in the UI by adding schema columns, wiring developer logos and availability bars on the REM project carousel, and refactoring the mortgage calculator to support off-plan milestone-based payment schedules.

**Architecture:** Schema-first — migration creates the 8 enrichment columns on `projects`; sync function gets typed; `renderRemProjectCard` in `properties.js` picks up logo_url + available_units from the enriched query; `project-detail.js` (already fully implements the off-plan detail modal) gains a "Calculate Mortgage" CTA; `mortgage.js` is refactored with a `_mortState` object and a new `initMortModal(opts)` entry point that supports an off-plan mode with milestone cost breakdown and amortization bar.

**Tech Stack:** Supabase Postgres (JSONB), TypeScript (edge function), vanilla JS ES modules, CSS, esbuild (no test runner — verification is build + manual smoke)

**Critical context:** `js/project-detail.js` (412 lines) already implements the full off-plan detail modal and already queries all 8 enrichment columns. No new modal file is needed. The off-plan card carousel (`renderRemProjectCard`) is in `js/properties.js`, NOT in `js/components.js` — `renderOffPlanCard` in `components.js` is for manually-entered agent properties (properties table) and is unchanged in this sprint.

---

### Task 1: Schema Migration

**Files:**
- Create: `sql/014_off_plan_enrichment.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- sql/014_off_plan_enrichment.sql
-- Adds enrichment columns to projects table.
-- All columns are nullable so existing rows are unaffected.
-- The sync function already writes to payment_plan_detail (matches this column name).

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS payment_plan_detail  JSONB    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gallery_images       TEXT[]   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS floor_plan_urls      TEXT[]   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS available_units      JSONB    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS facilities           JSONB    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS nearby_locations     JSONB    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS brochure_url         TEXT     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS images_categorized   JSONB    DEFAULT NULL;

-- GIN index for array containment queries on gallery_images
CREATE INDEX IF NOT EXISTS idx_projects_gallery_images
  ON public.projects USING GIN (gallery_images);

COMMENT ON COLUMN public.projects.payment_plan_detail IS
  'Typed milestone array: [{phase, percentage, trigger, due_date}]. Populated by sync-rem-offplan for top-30 priority projects.';
COMMENT ON COLUMN public.projects.available_units IS
  'REM typical_units array: unit specs available for sale. Populated for priority projects.';
```

- [ ] **Step 2: Apply migration locally**

```bash
supabase db reset   # applies all migrations in order
```

Or apply just this file if you have an active local instance:
```bash
supabase db push --local
```

Expected: no errors, "Applied 1 migration" (or "migration already applied" is also fine if run twice).

- [ ] **Step 3: Verify columns exist**

Run in Supabase Studio (`http://127.0.0.1:54323`) or via CLI:
```bash
supabase db execute --local "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'projects' AND column_name IN ('payment_plan_detail','gallery_images','floor_plan_urls','available_units','facilities','nearby_locations','brochure_url','images_categorized') ORDER BY column_name;"
```

Expected: 8 rows returned.

- [ ] **Step 4: Commit**

```bash
git add sql/014_off_plan_enrichment.sql
git commit -m "feat: add enrichment columns to projects table (payment_plan_detail, gallery_images, available_units, etc.)"
```

---

### Task 2: Sync Function Typing

**Files:**
- Modify: `edge-functions/sync-rem-offplan/index.ts` (lines 64–78, `RemDetailData` interface)

- [ ] **Step 1: Read current interface**

Open `edge-functions/sync-rem-offplan/index.ts` and locate the `RemDetailData` interface (lines 64–78). Current state:

```typescript
interface RemDetailData {
  all_images?: string[] | null;
  images?: {
    interior?: string[] | null;
    exterior?: string[] | null;
    general?:  string[] | null;
    other?:    string[] | null;
  } | null;
  new_payment_plans?: unknown[] | null;  // ← needs typing
  typical_units?: unknown[] | null;
  description?: string | null;
  facilities?: { id: number; name: string; description?: string | null; image?: string | null }[] | null;
  nearby_locations?: { id: number; name: string; distance?: string | null }[] | null;
  attachments?: { attachment_title?: string; attachment_url?: string; file_type?: string }[] | null;
}
```

- [ ] **Step 2: Add `RemPaymentMilestone` interface and update `RemDetailData`**

Insert the new interface immediately before `RemDetailData`, then update the `new_payment_plans` field:

```typescript
interface RemPaymentMilestone {
  phase: string;
  percentage: number;
  trigger: string;
  due_date: string | null;
}

interface RemDetailData {
  all_images?: string[] | null;
  images?: {
    interior?: string[] | null;
    exterior?: string[] | null;
    general?:  string[] | null;
    other?:    string[] | null;
  } | null;
  new_payment_plans?: RemPaymentMilestone[] | null;  // typed
  typical_units?: unknown[] | null;
  description?: string | null;
  facilities?: { id: number; name: string; description?: string | null; image?: string | null }[] | null;
  nearby_locations?: { id: number; name: string; distance?: string | null }[] | null;
  attachments?: { attachment_title?: string; attachment_url?: string; file_type?: string }[] | null;
}
```

- [ ] **Step 3: Verify the `paymentPlanDetail` mapping compiles**

The mapping code (around line 265–278) currently does:
```typescript
const paymentPlanDetail = Array.isArray(detail?.new_payment_plans) && detail!.new_payment_plans!.length > 0
  ? detail!.new_payment_plans!.map((plan: any) => ({
      phase:      String((plan as any).name    ?? (plan as any).phase   ?? 'Phase'),
      percentage: Number((plan as any).percent ?? (plan as any).percentage ?? 0),
      trigger:    String((plan as any).trigger ?? 'on_booking'),
      due_date:   (plan as any).due_date ?? null,
    }))
  : null;
```

With the new type, `plan` is already `RemPaymentMilestone` — remove the `(plan as any)` casts. Update to:

```typescript
const paymentPlanDetail = Array.isArray(detail?.new_payment_plans) && detail!.new_payment_plans!.length > 0
  ? detail!.new_payment_plans!.map((plan) => ({
      phase:      String(plan.phase      ?? 'Phase'),
      percentage: Number(plan.percentage ?? 0),
      trigger:    String(plan.trigger    ?? 'on_booking'),
      due_date:   plan.due_date          ?? null,
    }))
  : null;
```

- [ ] **Step 4: Type-check**

```bash
cd edge-functions/sync-rem-offplan
deno check index.ts
```

Expected: no type errors.

If `deno` isn't available locally, skip and verify during next sync run. The TypeScript change is safe — it only narrows types.

- [ ] **Step 5: Commit**

```bash
git add edge-functions/sync-rem-offplan/index.ts
git commit -m "feat: type RemPaymentMilestone in sync-rem-offplan, remove any casts on payment plan mapping"
```

---

### Task 3: Developer Logo + Availability Bar in renderRemProjectCard

**Files:**
- Modify: `js/properties.js` — `loadRemProjects` (both Supabase queries) + `renderRemProjectCard`

- [ ] **Step 1: Add `logo_url` and `available_units` to both project queries**

In `loadRemProjects` (around line 343), there are two queries. Update both selects:

**Query 1 — boban-pepic showcase** (around line 360):
```js
// Before:
.select('id, slug, name, cover_image_url, min_price, completion_date, status, district_name, area, location, developers!projects_developer_id_fkey(name)')

// After:
.select('id, slug, name, cover_image_url, min_price, completion_date, status, district_name, area, location, available_units, developers!projects_developer_id_fkey(name, logo_url)')
```

**Query 2 — agent_projects junction** (around line 374):
```js
// Before:
.select('projects(id, slug, name, cover_image_url, min_price, completion_date, status, district_name, area, location, developers!projects_developer_id_fkey(name))')

// After:
.select('projects(id, slug, name, cover_image_url, min_price, completion_date, status, district_name, area, location, available_units, developers!projects_developer_id_fkey(name, logo_url))')
```

- [ ] **Step 2: Update `renderRemProjectCard` to show developer logo**

Locate `renderRemProjectCard(p, devName)` (line 292). The developer block currently renders:
```js
${devName ? `<div class="offplan-developer">${escHtml(devName)}</div>` : ''}
```

Replace with logo-or-text pattern (reads `p.developers?.logo_url` directly — the query already returns it as a nested object):
```js
const devLogoUrl = p.developers?.logo_url || null;
const devNameSafe = devName ? escHtml(devName) : '';
const devHtml = devNameSafe
  ? devLogoUrl
    ? `<div class="offplan-developer">
        <img class="offplan-dev-logo" src="${escAttr(optimizeImg(devLogoUrl, 60))}" alt="${devNameSafe}" width="60" height="24" loading="lazy" onerror="this.style.display='none'">
        <span class="offplan-dev-name">${devNameSafe}</span>
       </div>`
    : `<div class="offplan-developer">${devNameSafe}</div>`
  : '';
```

Then in the returned HTML, replace the old developer line:
```js
// Before:
${devName ? `<div class="offplan-developer">${escHtml(devName)}</div>` : ''}

// After:
${devHtml}
```

- [ ] **Step 3: Add availability bar after priceHtml**

Still inside `renderRemProjectCard`, add the availability bar calculation after `priceHtml` is built (around line 303–309), before `const location = ...`:

```js
let availHtml = '';
if (Array.isArray(p.available_units) && p.available_units.length > 0) {
  const total = p.available_units.length;
  const available = p.available_units.filter(u => !u.status || u.status === 'available').length;
  const pct = Math.max(10, Math.round((available / total) * 100));
  availHtml = `<div class="offplan-avail">
    <div class="offplan-avail-bar">
      <div class="offplan-avail-fill" style="width:${pct}%"></div>
    </div>
    <span class="offplan-avail-label">${available} unit${available !== 1 ? 's' : ''} available</span>
  </div>`;
}
```

In the returned HTML template, insert `${availHtml}` after `${priceHtml}`:
```js
// Before (return block, offplan-body):
${priceHtml}
${metaHtml}

// After:
${priceHtml}
${availHtml}
${metaHtml}
```

- [ ] **Step 4: Build and visually verify**

```bash
npm run build 2>&1 | tail -20
```

Expected: build passes, no new chunks > 20KB.

Open the local dev server, navigate to an agent profile with REM projects. Developer logos should appear on cards that have `logo_url` set. Availability bar appears for priority-enriched projects.

- [ ] **Step 5: Commit**

```bash
git add js/properties.js
git commit -m "feat: show developer logo and availability bar on REM off-plan project cards"
```

---

### Task 4: Mortgage CTA in project-detail.js + init.js Bridge

**Files:**
- Modify: `js/project-detail.js` — add module var, `_openProjectMortgage`, mortgage button in sticky footer
- Modify: `js/init.js` — add `initMortModal` lazy bridge

- [ ] **Step 1: Add module-level `_detailProject` variable**

At the top of `js/project-detail.js`, after the imports, add:
```js
let _detailProject = null;
```

- [ ] **Step 2: Store project reference and register global**

Inside `openProjectDetail`, after `const dev = project.developers || {};` (around line 171), add:
```js
_detailProject = project;
window._openProjectMortgage = function() {
  if (!_detailProject) return;
  if (typeof window.initMortModal === 'function') {
    window.initMortModal({
      mode: 'offplan',
      project: {
        name:           _detailProject.name,
        minPrice:       _detailProject.min_price,
        milestones:     _detailProject.payment_plan_detail,
        completionDate: _detailProject.completion_date,
      },
    });
  }
};
```

- [ ] **Step 3: Add Mortgage button to sticky footer**

Locate the sticky footer block (around line 395–398):
```js
<div style="display:flex;gap:8px;padding:12px 16px calc(12px + env(safe-area-inset-bottom));position:sticky;bottom:0;background:#000;border-top:1px solid rgba(255,255,255,0.06);">
  <button data-name="${escAttr(project.name)}" onclick="openLead(this.dataset.name)" style="flex:1;padding:14px;background:#1127D2;border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;">Enquire</button>
  ${currentAgent?.whatsapp ? `<a href="https://wa.me/..."...>WhatsApp</a>` : ''}
</div>
```

Add the Mortgage button between Enquire and WhatsApp:
```js
<div style="display:flex;gap:8px;padding:12px 16px calc(12px + env(safe-area-inset-bottom));position:sticky;bottom:0;background:#000;border-top:1px solid rgba(255,255,255,0.06);">
  <button data-name="${escAttr(project.name)}" onclick="openLead(this.dataset.name)" style="flex:1;padding:14px;background:#1127D2;border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;">Enquire</button>
  <button onclick="_openProjectMortgage()" style="flex:1;padding:14px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:12px;color:rgba(255,255,255,0.85);font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;">Mortgage</button>
  ${currentAgent?.whatsapp ? `<a href="https://wa.me/${encodeURIComponent(currentAgent.whatsapp.replace(/[^0-9]/g,''))}?text=${encodeURIComponent('Hi, I\'m interested in ' + project.name + ' — can you tell me more?')}" target="_blank" rel="noopener noreferrer" style="flex:1;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(37,211,102,0.12);border:1px solid rgba(37,211,102,0.3);border-radius:12px;color:#25d366;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;text-decoration:none;">WhatsApp</a>` : ''}
</div>
```

- [ ] **Step 4: Add `initMortModal` lazy bridge in init.js**

In `js/init.js`, after the `openMortgage` lazy loader block (around line 107), add:

```js
// initMortModal — off-plan mode entry point; shares same lazy load as openMortgage
window.initMortModal = async function initMortModalLazy(opts) {
  try {
    await import('./mortgage.js');
    // mortgage.js registers window.initMortModal as a side-effect.
    if (window.initMortModal !== initMortModalLazy) window.initMortModal(opts);
  } catch (e) {
    console.error('[mortgage] failed to load:', e);
    showFeatureError('Mortgage calculator');
  }
};
```

- [ ] **Step 5: Build**

```bash
npm run build 2>&1 | tail -20
```

Expected: passes, `init.bundle.js` under 30KB.

- [ ] **Step 6: Commit**

```bash
git add js/project-detail.js js/init.js
git commit -m "feat: add Calculate Mortgage CTA to off-plan project detail modal"
```

---

### Task 5: Mortgage State Consolidation + initMortModal Entry Point

**Files:**
- Modify: `js/mortgage.js` — replace 8 window globals with `_mortState`, add `window.initMortModal`

- [ ] **Step 1: Replace globals with `_mortState` object**

At the top of `js/mortgage.js`, replace lines 9–16:
```js
// REMOVE these:
window._mortTerm = 25;
window._mortRate = 3.99;
window._mortStep = 1;
window._mortData = { employment: 'salaried', residency: 'uae_resident' };
window._mortRates = [];
window._mortAppId = null;
window._mortEditToken = null;
window._eiborRate = null;
```

With:
```js
const _mortStateDefaults = {
  mode:      'standard',   // 'standard' | 'offplan'
  step:      1,
  term:      25,
  rate:      3.99,
  appId:     null,
  editToken: null,
  project:   null,         // { name, minPrice, milestones, completionDate } — offplan only
  data: {
    employment: 'salaried',
    residency:  'uae_resident',
  },
  rates:     [],
};

let _mortState = { ..._mortStateDefaults, data: { ..._mortStateDefaults.data } };

// _eiborRate stays separate — it's cached external data, not per-session state
let _eiborRate = null;
```

- [ ] **Step 2: Update all internal reads/writes**

Do a find-and-replace pass throughout `mortgage.js`:

| Old | New |
|-----|-----|
| `window._mortTerm` | `_mortState.term` |
| `window._mortRate` | `_mortState.rate` |
| `window._mortStep` | `_mortState.step` |
| `window._mortData` | `_mortState.data` |
| `window._mortRates` | `_mortState.rates` |
| `window._mortAppId` | `_mortState.appId` |
| `window._mortEditToken` | `_mortState.editToken` |
| `window._eiborRate` | `_eiborRate` |

Specific locations to update (not exhaustive — grep to confirm):
- `openMortgage()`: `mortGoStep(1)` unchanged; `loadMortgageRates()` checks `_mortState.rates.length`; auto-fill reads `_mortState.data.residency`
- `mortGoStep(step)`: sets `_mortState.step = step`; reads `_mortState.data.residency` in step-2 LTV logic
- `setMortField(btn, field, value)`: writes `_mortState.data[field] = value`
- `setMortTerm(btn, years)`: sets `_mortState.term = years`
- `loadMortgageRates()`: guard is `if (_mortState.rates.length > 0) return`; on success sets `_mortState.rates = await res.json()`
- `loadEiborRate()`: sets `_eiborRate = { rate, spread }`; updates `if (_mortState.rate === 3.99) _mortState.rate = ...`
- `filterRatesForProfile(rates)`: reads `_mortState.data.income`, `_mortState.data.residency`, `_mortState.data.employment`, `_mortState.term`
- `renderBankCards()`: reads `_mortState.rates`, `_mortState.term`, `_mortState.data`
- `calcMortgage()`: reads `_mortState.rate`, `_mortState.term`; writes `_mortState.rate` at end of `renderBankCards`
- `mortCheckEligibility()`: reads/writes `_mortState.data.*`
- `mortCaptureAndProceed()`: reads `_mortState.data.*`; end: `_mortState.data.leadName`, `_mortState.data.leadPhone`
- `mortSubmitApplication()`: reads `_mortState.*`; writes `_mortState.appId`, `_mortState.editToken`
- `mortDocUploaded()`: reads `_mortState.appId`, `_mortState.editToken`
- `selectBankRate(card, rate, bankName)`: sets `_mortState.rate = rate`, `_mortState.data.selectedBank = bankName`

Also update the `mortSubmitApplication` payload (around line 447–456) to use `_mortState.*` instead of `window._mort*`. The `window._currentProperty` reference stays as-is (it's set externally by properties.js, not mortgage state).

- [ ] **Step 3: Update `window.openMortgage` to reset state on open**

In `openMortgage()`, replace the existing state initialization with:
```js
window.openMortgage = function() {
  const modal = document.getElementById('mortgage-modal');
  if (!modal) return;
  // Reset to standard mode on direct open
  _mortState = { ..._mortStateDefaults, data: { ..._mortStateDefaults.data } };
  _mortRatesLoadFailed = false;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  mortGoStep(1);
  loadMortgageRates();
  loadEiborRate();
  const leadCapture = document.getElementById('mort-lead-capture');
  if (leadCapture) leadCapture.style.display = 'none';
  const checkBtn = document.getElementById('mort-check-btn');
  if (checkBtn) checkBtn.style.display = '';
  const eligResult = document.getElementById('mort-elig-result');
  if (eligResult) eligResult.style.display = 'none';
  // Auto-fill property value from current property
  if (window._currentProperty) {
    const p = window._currentProperty;
    const priceNum = parseFloat(String(p.price || '').replace(/[^0-9.]/g, ''));
    if (priceNum > 0) {
      const valInput = document.getElementById('mort-value');
      if (valInput) valInput.value = Math.round(priceNum).toLocaleString('en-US');
      const dpSlider = document.getElementById('mort-dp-slider');
      if (dpSlider) {
        const minDp = _mortState.data.residency === 'uae_national' ? 15 : (_mortState.data.residency === 'non_resident' ? 50 : 20);
        dpSlider.min = minDp;
        dpSlider.value = minDp;
        const dpPctEl = document.getElementById('mort-dp-pct');
        if (dpPctEl) dpPctEl.textContent = minDp + '%';
        const minLabel = dpSlider.parentElement?.querySelector('span');
        if (minLabel) minLabel.textContent = minDp + '%';
      }
    }
  }
  logEvent('mortgage_calc_open', { property: window._currentProperty?.title || null });
};
```

- [ ] **Step 4: Add `window.initMortModal` entry point**

Add after `window.openMortgage`:
```js
window.initMortModal = function(opts = {}) {
  const modal = document.getElementById('mortgage-modal');
  if (!modal) return;
  // Merge opts over defaults; deep-clone data to avoid mutation
  _mortState = {
    ..._mortStateDefaults,
    data: { ..._mortStateDefaults.data },
    ...opts,
  };
  _mortRatesLoadFailed = false;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  mortGoStep(1);
  loadMortgageRates();
  loadEiborRate();
  const leadCapture = document.getElementById('mort-lead-capture');
  if (leadCapture) leadCapture.style.display = 'none';
  const checkBtn = document.getElementById('mort-check-btn');
  if (checkBtn) checkBtn.style.display = '';
  const eligResult = document.getElementById('mort-elig-result');
  if (eligResult) eligResult.style.display = 'none';
  logEvent('mortgage_calc_open', { mode: _mortState.mode, project: _mortState.project?.name || null });
};
```

- [ ] **Step 5: Store calculated values in state (needed for amortization bar)**

In `calcMortgage()` (around line 322–332), after computing `totalInterest`, store values:
```js
// After: const totalInterest = (monthlyPayment * numPayments) - loanAmt;
_mortState.data.loanAmt        = loanAmt;
_mortState.data.monthlyPayment = monthlyPayment;
_mortState.data.totalInterest  = totalInterest;
```

- [ ] **Step 6: Build and verify standard mode still works**

```bash
npm run build 2>&1 | tail -20
```

Open the site, click the mortgage button on a regular property card. Run through all 4 steps. Verify:
- Step 1: eligibility form works
- Step 2: bank cards load
- Step 3: submit works
- Step 4: pre-qualified screen appears

- [ ] **Step 7: Commit**

```bash
git add js/mortgage.js
git commit -m "refactor: consolidate mortgage globals into _mortState object, add initMortModal entry point"
```

---

### Task 6: Mortgage Off-Plan Mode — Step 1 Replacement

**Files:**
- Modify: `js/mortgage.js` — modify `mortGoStep` to inject milestone breakdown in off-plan mode

- [ ] **Step 1: Add `renderMortOffPlanStep1()` helper function**

Add this function before `window.mortGoStep`:
```js
function renderMortOffPlanStep1() {
  const step1 = document.getElementById('mort-step-1');
  if (!step1 || !_mortState.project) return;

  const proj    = _mortState.project;
  const price   = proj.minPrice || 0;
  const miles   = Array.isArray(proj.milestones) ? proj.milestones : [];
  const fmtPct  = (pct) => `${pct}%`;
  const fmtAmt  = (n)   => 'AED ' + Math.round(n).toLocaleString();

  // Derive milestone buckets
  const booking      = miles.find(m => m.trigger === 'on_booking')          || miles[0];
  const handover     = miles.find(m => m.trigger === 'on_handover')         || miles[miles.length - 1];
  const construction = miles.filter(m => m !== booking && m !== handover);

  const bookingPct   = booking?.percentage   || 0;
  const handoverPct  = handover?.percentage  || 0;
  const constPct     = construction.reduce((sum, m) => sum + (m.percentage || 0), 0);

  const bookingAmt    = price * bookingPct / 100;
  const constAmt      = price * constPct   / 100;
  const handoverAmt   = price * handoverPct / 100;
  const dldFee        = price * 0.04;
  const agentComm     = price * 0.02;
  const totalCash     = bookingAmt + dldFee + agentComm;
  const loanAmount    = handoverAmt;

  const includeAgent  = true; // toggleable below
  const completionStr = proj.completionDate
    ? (() => { const d = new Date(proj.completionDate); return `Q${Math.ceil((d.getMonth()+1)/3)} ${d.getFullYear()}`; })()
    : 'TBC';

  const milestoneRows = [
    { label: `Booking (${fmtPct(bookingPct)})`,      amount: bookingAmt  },
    { label: `Construction (${fmtPct(constPct)})`,   amount: constAmt    },
    { label: `Handover (${fmtPct(handoverPct)})`,    amount: handoverAmt },
    { label: 'DLD Fee (4%)',                          amount: dldFee      },
  ];

  const rowsHtml = milestoneRows.map(r =>
    `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
      <span style="font-size:12px;color:rgba(255,255,255,0.5);">${escHtml(r.label)}</span>
      <span style="font-size:12px;color:#fff;font-weight:600;">${fmtAmt(r.amount)}</span>
    </div>`
  ).join('');

  step1.innerHTML = `
    <div style="margin-bottom:16px;">
      <div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">${escHtml(proj.name)} · Completion ${escHtml(completionStr)}</div>
      <div style="font-size:10px;font-weight:600;color:rgba(77,101,255,0.7);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Payment Breakdown</div>
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;">
        ${rowsHtml}
        <div style="display:flex;justify-content:space-between;padding:6px 0;margin-top:4px;">
          <label style="font-size:12px;color:rgba(255,255,255,0.5);display:flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="checkbox" id="mort-op-agent-check" checked
              onchange="_mortOpToggleAgent(this.checked)"
              style="accent-color:#4d65ff;width:14px;height:14px;">
            Agent commission (2%)
          </label>
          <span id="mort-op-agent-amt" style="font-size:12px;color:#fff;font-weight:600;">${fmtAmt(agentComm)}</span>
        </div>
      </div>
    </div>

    <div style="background:rgba(17,39,210,0.08);border:1px solid rgba(17,39,210,0.18);border-radius:10px;padding:12px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
        <span style="font-size:12px;color:rgba(255,255,255,0.45);">Total cash required at booking</span>
        <span id="mort-op-cash" style="font-size:12px;color:#fff;font-weight:700;">${fmtAmt(totalCash)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="font-size:12px;color:rgba(255,255,255,0.45);">Mortgage loan amount (at handover)</span>
        <span style="font-size:12px;color:#fff;font-weight:700;">${fmtAmt(loanAmount)}</span>
      </div>
    </div>

    <button class="modal-btn" onclick="mortOpProceed()"
      style="width:100%;padding:14px;background:#1127D2;border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;">
      Calculate Mortgage Payments
    </button>`;

  // Store for toggling and for step 2 pre-fill
  _mortState.data._opBookingAmt  = bookingAmt;
  _mortState.data._opDldFee      = dldFee;
  _mortState.data._opAgentComm   = agentComm;
  _mortState.data._opLoanAmount  = loanAmount;
  _mortState.data._opTotalCash   = totalCash;
  _mortState.data._opIncludeAgent = true;
}
```

- [ ] **Step 2: Add agent commission toggle handler and proceed handler**

Add these two small globals:
```js
window._mortOpToggleAgent = function(checked) {
  _mortState.data._opIncludeAgent = checked;
  const agentAmtEl = document.getElementById('mort-op-agent-amt');
  const cashEl     = document.getElementById('mort-op-cash');
  const agentComm  = _mortState.data._opAgentComm || 0;
  const base       = (_mortState.data._opBookingAmt || 0) + (_mortState.data._opDldFee || 0);
  const newCash    = checked ? base + agentComm : base;
  _mortState.data._opTotalCash = newCash;
  if (agentAmtEl) agentAmtEl.textContent = checked ? 'AED ' + Math.round(agentComm).toLocaleString() : 'AED 0';
  if (cashEl)     cashEl.textContent     = 'AED ' + Math.round(newCash).toLocaleString();
};

window.mortOpProceed = function() {
  // Pre-fill the property value in step 2 with the loan amount
  const valInput = document.getElementById('mort-value');
  if (valInput && _mortState.data._opLoanAmount) {
    valInput.value = Math.round(_mortState.data._opLoanAmount).toLocaleString('en-US');
  }
  mortGoStep(2);
};
```

- [ ] **Step 3: Call `renderMortOffPlanStep1` from `mortGoStep`**

In `mortGoStep(step)`, after `const el = document.getElementById('mort-step-' + step);` and `if (el) el.style.display = 'block';`, add:

```js
// Off-plan mode: replace step 1 content with milestone breakdown
if (step === 1 && _mortState.mode === 'offplan') {
  renderMortOffPlanStep1();
}
```

Also update the step titles array to include an off-plan mode override:
```js
const titles = _mortState.mode === 'offplan'
  ? ['Payment Breakdown', 'Compare Rates', 'Your Details', 'You\'re Pre-Qualified']
  : ['Check Your Eligibility', 'Compare Rates', 'Your Details', 'You\'re Pre-Qualified'];
```

- [ ] **Step 4: Manually test off-plan mode**

Open a REM project detail modal (via `openProjectDetail`), click the "Mortgage" button. Verify:
- Modal opens with "Payment Breakdown" title
- Step 1 shows the milestone rows, DLD fee, agent commission checkbox, total cash, loan amount
- "Calculate Mortgage Payments" button takes you to Step 2 (bank comparison) with loan amount pre-filled
- Unchecking agent commission updates the total cash in real time

- [ ] **Step 5: Commit**

```bash
git add js/mortgage.js
git commit -m "feat: off-plan mode step 1 — milestone cost breakdown with DLD fee and agent commission toggle"
```

---

### Task 7: Amortization Bar on Step 4

**Files:**
- Modify: `js/mortgage.js` — add amortization bar HTML in `injectMortgageSuccessCta`

- [ ] **Step 1: Add amortization bar HTML to `injectMortgageSuccessCta`**

In `injectMortgageSuccessCta(payload)` (around line 481), after the broker reassurance block (`html += \`<div ...WhatsApp...\``), add:

```js
// Amortization bar — only if we have calculated values stored in _mortState.data
const loanAmt    = _mortState.data.loanAmt        || 0;
const totalInt   = _mortState.data.totalInterest   || 0;
const totalPaid  = loanAmt + totalInt;
if (totalPaid > 0) {
  const principalPct = Math.round((loanAmt   / totalPaid) * 100);
  const interestPct  = 100 - principalPct;
  html += `<div style="margin-bottom:16px;">
    <div style="font-size:10px;color:rgba(255,255,255,0.35);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Loan Cost Breakdown</div>
    <div class="mort-amort-bar" style="display:flex;height:10px;border-radius:5px;overflow:hidden;margin-bottom:8px;">
      <div class="mort-amort-principal" style="width:${principalPct}%;background:#1127D2;"></div>
      <div class="mort-amort-interest"  style="width:${interestPct}%;background:rgba(255,80,80,0.5);"></div>
    </div>
    <div class="mort-amort-labels" style="display:flex;justify-content:space-between;">
      <span style="font-size:11px;color:rgba(255,255,255,0.45);">Principal: <strong style="color:#fff;">${fmtAEDMort(loanAmt)}</strong></span>
      <span style="font-size:11px;color:rgba(255,255,255,0.45);">Total interest: <strong style="color:rgba(255,120,120,0.85);">${fmtAEDMort(totalInt)}</strong></span>
    </div>
  </div>`;
}
```

- [ ] **Step 2: Verify**

Run through the full mortgage flow (standard mode) to step 4. After submitting, the pre-qualified screen should show:
- Pre-qualification summary card
- Broker reassurance strip
- Loan cost breakdown bar (principal blue, interest red-tinted)
- Two labels: Principal and Total interest

If `calcMortgage()` was called during step 2 (bank card selection), `_mortState.data.loanAmt` will be populated. If the user never entered a property value, `totalPaid === 0` and the bar is omitted.

- [ ] **Step 3: Commit**

```bash
git add js/mortgage.js
git commit -m "feat: add principal/interest amortization bar to mortgage step 4 pre-qualified screen"
```

---

### Task 8: CSS Additions

**Files:**
- Modify: `css/properties.css` — add off-plan availability bar styles
- Modify: `css/mortgage.css` — add amortization bar styles (optional — the bar uses inline styles; CSS classes provide override points)

- [ ] **Step 1: Add availability bar CSS to `css/properties.css`**

Append to the end of `css/properties.css`:
```css
/* Off-plan card availability bar */
.offplan-avail {
  margin-top: 8px;
}

.offplan-avail-bar {
  height: 4px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 4px;
}

.offplan-avail-fill {
  height: 100%;
  background: linear-gradient(90deg, #1127D2, #4d65ff);
  border-radius: 2px;
  transition: width 0.4s ease;
}

.offplan-avail-label {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
  font-weight: 500;
}

/* Developer logo lockup on off-plan cards */
.offplan-dev-logo {
  height: 24px;
  width: auto;
  max-width: 60px;
  object-fit: contain;
  filter: brightness(0) invert(1) opacity(0.7);
  vertical-align: middle;
}

.offplan-dev-name {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
  font-weight: 500;
  margin-left: 6px;
  vertical-align: middle;
}
```

- [ ] **Step 2: Add amortization bar CSS to `css/mortgage.css`**

Append to the end of `css/mortgage.css`:
```css
/* Mortgage amortization bar */
.mort-amort-bar {
  display: flex;
  height: 10px;
  border-radius: 5px;
  overflow: hidden;
}

.mort-amort-principal {
  background: #1127D2;
}

.mort-amort-interest {
  background: rgba(255, 80, 80, 0.5);
}

.mort-amort-labels {
  display: flex;
  justify-content: space-between;
}
```

- [ ] **Step 3: Build**

```bash
npm run build 2>&1 | tail -20
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add css/properties.css css/mortgage.css
git commit -m "feat: add CSS for off-plan availability bar, developer logo lockup, and mortgage amortization bar"
```

---

### Task 9: Build Verification + Pre-Deploy Check

**Files:**
- None modified — verification only

- [ ] **Step 1: Full build check**

```bash
npm run build
```

Expected output — check all three:
1. No build errors
2. `dist/init.bundle.js` ≤ 30KB
3. No new chunks in `dist/chunks/` exceeding 20KB

```bash
ls -la dist/init.bundle.js
ls -la dist/chunks/
```

- [ ] **Step 2: Run pre-deploy check script**

```bash
npm run check
```

Fix any failures before proceeding.

- [ ] **Step 3: Manual smoke test — off-plan flow**

1. Open agent profile page
2. Scroll to REM projects section
3. Verify: developer logo appears on cards with `logo_url`; availability bar visible on priority-enriched projects
4. Click a project card → detail modal opens
5. Verify: hero gallery, developer badge, payment plan breakdown, units, facilities, nearby locations all render
6. Click "Mortgage" button in sticky footer
7. Verify: mortgage modal opens in off-plan mode — shows "Payment Breakdown" step 1
8. Proceed through to step 4, verify amortization bar appears

- [ ] **Step 4: Manual smoke test — standard mortgage flow**

1. Click mortgage button on a regular property card (standard mode)
2. Run through all 4 steps
3. Verify behavior is identical to before the refactor

- [ ] **Step 5: Final commit (if any last tweaks)**

```bash
git add -p  # stage any final fixes
git commit -m "fix: final adjustments from smoke test"
```

---

## Spec Coverage Verification

| Spec Section | Implemented In |
|---|---|
| §1 Schema migration — 8 enrichment columns | Task 1 |
| §2 Sync — `RemPaymentMilestone` interface, typed `new_payment_plans` | Task 2 |
| §3.1 Developer logo on off-plan card | Task 3 (`renderRemProjectCard`) |
| §3.2 Availability indicator | Task 3 (`renderRemProjectCard`) |
| §3.3 Click routing | Already correct — `renderRemProjectCard` calls `openProjectDetail` |
| §4 Off-plan detail modal | Already implemented by `project-detail.js` — no new file needed |
| §4 Mortgage CTA from modal | Task 4 |
| §5.1 State consolidation | Task 5 |
| §5.2 `initMortModal` entry point | Task 5 |
| §5.3 Off-plan mode Step 1 | Task 6 |
| §5.4 Amortization bar | Task 7 |
| CSS for new components | Task 8 |

**Deviation from spec §4:** The spec proposed a new `offplan-modal.js` file. Discovery during plan research found `js/project-detail.js` (412 lines) already implements this feature completely — gallery, developer badge, payment plan breakdown, units, facilities, nearby locations, brochure CTA. No new file is needed. The Mortgage CTA (the only missing piece) is added directly in Task 4.
