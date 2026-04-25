# Agent Onboarding + Nudges — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce agent drop-off at onboarding, surface a profile completeness score on the dashboard, and fire a WhatsApp nudge sequence to keep agents engaged after signup.

**Architecture:** Five independent task groups — copy/UX fixes to `join.html`+`js/join.js`, step-resume persistence in `js/join.js`, profile completeness score in `js/dashboard.js`+`dashboard.html`, a DB migration adding nudge tracking columns, and a new `lead-nudger` edge function that sends WhatsApp lifecycle messages via the existing Meta Graph API credentials.

**Tech Stack:** Vanilla JS (browser), Deno edge functions (TypeScript), Supabase PostgreSQL, WhatsApp Cloud API (Meta Graph API v18.0), existing `WA_TOKEN`+`WA_PHONE_ID` env vars.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `join.html` | Modify | Update step 1 heading + BRN label |
| `js/join.js` | Modify | Step persistence, BRN format validation |
| `dashboard.html` | Modify | Add score % display to completeness card |
| `js/dashboard.js` | Modify | Replace 5-step checklist with 4-category completeness score (0–100) |
| `supabase/migrations/20260408000001_nudge_columns.sql` | Create | Adds nudge tracking columns to `agents` and `leads` |
| `edge-functions/lead-nudger/index.ts` | Create | WhatsApp lifecycle nudge cron function |
| `edge-functions/lead-nudger/index.test.ts` | Create | Unit tests for nudge logic |
| `tests/e2e/journey1-join.spec.js` | Modify | Add step-resume E2E test |

---

## Task 1: Onboarding Copy + BRN Validation

### Context

- `join.html:59` — step 1 heading is currently `<h1 class="name">Get Verified</h1>`
- `join.html:61` — subtext is "Verify your broker license and go live in under 2 minutes."
- `join.html:69` — label reads "Broker Number"
- `js/join.js:70-76` — existing validation only rejects `NaN`; does not check digit count

**Files:** Modify `join.html`, `js/join.js`

- [ ] **Step 1: Update the step 1 heading in join.html**

In `join.html`, change the `<h1>` inside `#step-1 .profile`:

```html
<!-- Before (join.html:59) -->
<h1 class="name">Get Verified</h1>

<!-- After -->
<h1 class="name">Verify your RERA licence</h1>
```

- [ ] **Step 2: Update the step 1 subtext**

```html
<!-- Before (join.html:61) -->
<p class="bio">Verify your broker license and go live in under 2 minutes.</p>

<!-- After -->
<p class="bio">Enter your RERA broker number to confirm your identity. Takes under 2 minutes — your license number is never shown publicly.</p>
```

- [ ] **Step 3: Update the BRN field label in join.html**

```html
<!-- Before (join.html:69) -->
<label>Broker Number</label>

<!-- After -->
<label>RERA Broker Number</label>
```

- [ ] **Step 4: Add BRN format validation in js/join.js before the API call**

The current check (`js/join.js:76`):
```javascript
if (!isTestBrn && (!num || Number.isNaN(num))) { showError(1, 'Please enter a valid broker number.'); return; }
```

Replace with:
```javascript
if (!isTestBrn) {
  if (!num || Number.isNaN(num)) { showError(1, 'Please enter a valid RERA broker number.'); return; }
  if (raw.length < 4 || raw.length > 7) { showError(1, 'RERA broker numbers are 4–7 digits. Check your RERA card.'); return; }
}
```

- [ ] **Step 5: Build and verify no bundle size increase**

```bash
npm run build
# Verify dist/init.bundle.js size — join.js is not in the init bundle, so no change expected
ls -la dist/init.bundle.js
```

Expected: no size change (join.js is loaded separately, not via esbuild entry).

- [ ] **Step 6: Commit**

```bash
git add join.html js/join.js
git commit -m "feat(onboarding): update step 1 copy to RERA framing and add BRN length validation"
```

---

## Task 2: Step Persistence — Resume from Step 2 After Page Refresh

### Context

- `js/join.js:459–506` — `saveFormState()` serialises step-2 form fields to localStorage `sd_join_draft` but does NOT save the current step number or the `verifiedBroker` object
- `js/join.js:477–506` — `restoreFormState()` only restores field values; on refresh the agent is always sent to step 1 even if they had already completed broker verification
- `js/join.js:11–13` — `verifiedBroker` is an in-memory variable, lost on refresh
- `js/join.js:114` — `goStep(2)` called after successful verification
- `js/join.js:498–502` — `saveFormState` is wired to `input` events on step-2 fields but NOT called after step-1 verification

**Files:** Modify `js/join.js`, `tests/e2e/journey1-join.spec.js`

- [ ] **Step 1: Extend saveFormState to persist step and verifiedBroker**

In `js/join.js`, find the `saveFormState` function (line ~461) and replace it:

```javascript
function saveFormState() {
  try {
    // Determine current visible step
    let currentStep = 1;
    if (document.getElementById('step-2')?.classList.contains('active')) currentStep = 2;
    if (document.getElementById('step-3')?.classList.contains('active')) currentStep = 3;

    localStorage.setItem(FORM_DRAFT_KEY, JSON.stringify({
      displayName: document.getElementById('display-name').value,
      email:       document.getElementById('email').value,
      whatsapp:    document.getElementById('whatsapp').value,
      tagline:     document.getElementById('tagline').value,
      calendly:    document.getElementById('calendly').value,
      instagram:   document.getElementById('instagram').value,
      youtube:     document.getElementById('youtube').value,
      tiktok:      document.getElementById('tiktok').value,
      linkedin:    document.getElementById('linkedin').value,
      step: currentStep,
      verifiedBroker: verifiedBroker || null,
    }));
  } catch(e) { console.warn('[join] Could not save form draft to localStorage:', e); }
}
```

- [ ] **Step 2: Extend restoreFormState to resume step 2 if broker was verified**

Find the `restoreFormState` function (line ~477) and replace it:

```javascript
function restoreFormState() {
  try {
    const raw = localStorage.getItem(FORM_DRAFT_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.displayName) document.getElementById('display-name').value = s.displayName;
    if (s.email)       document.getElementById('email').value       = s.email;
    if (s.whatsapp)    document.getElementById('whatsapp').value    = s.whatsapp;
    if (s.tagline)     document.getElementById('tagline').value     = s.tagline;
    if (s.calendly)    document.getElementById('calendly').value    = s.calendly;
    if (s.instagram)   document.getElementById('instagram').value   = s.instagram;
    if (s.youtube)     document.getElementById('youtube').value     = s.youtube;
    if (s.tiktok)      document.getElementById('tiktok').value      = s.tiktok;
    if (s.linkedin)    document.getElementById('linkedin').value    = s.linkedin;

    // Resume step 2 if agent had already completed broker verification
    if (s.step === 2 && s.verifiedBroker) {
      verifiedBroker = s.verifiedBroker;
      const name = titleCase(verifiedBroker.name_en || '');
      document.getElementById('verify-name').textContent = name;
      document.getElementById('verify-bn').textContent = `#${verifiedBroker.broker_number}`;
      document.getElementById('verify-expiry').textContent = verifiedBroker.license_end || '—';
      document.getElementById('verify-status').textContent = 'Active';
      document.getElementById('step2-name').textContent = name;
      if (s.displayName) document.getElementById('display-name').value = s.displayName;
      goStep(2);
    }
  } catch(e) { console.warn('[join] Could not restore form draft from localStorage:', e); }
}
```

- [ ] **Step 3: Call saveFormState after step 1 verification completes**

In the `verifyBroker` function, after line `verifiedBroker = data.broker;` (line ~102) and after the UI is populated, add a `saveFormState()` call before `goStep(2)`:

```javascript
// Existing code:
verifiedBroker = data.broker;
const name = titleCase(data.broker.name_en);
document.getElementById('verify-name').textContent = name;
document.getElementById('verify-bn').textContent = `#${data.broker.broker_number}`;
document.getElementById('verify-expiry').textContent = data.broker.license_end;
document.getElementById('verify-status').textContent = 'Active';
document.getElementById('step2-name').textContent = name;
document.getElementById('display-name').value = name;

setLoading('btn-verify', false, 'Verify My License');
if (typeof gtag === 'function') gtag('event', 'step1_complete');
saveFormState(); // ← add this line
goStep(2);
```

Also call `saveFormState()` in `manualSubmit()` at the equivalent point, just before `goStep(2)` at line ~551:

```javascript
// At the end of manualSubmit() before goStep(2):
saveFormState(); // ← add this line
goStep(2);
```

- [ ] **Step 4: Write E2E test for step resume in tests/e2e/journey1-join.spec.js**

Add at the end of the file:

```javascript
test('Join page: refreshing after step-1 verification resumes at step-2', async ({ page }) => {
  await page.route('**/verify-broker**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      verified: true,
      license_active: true,
      broker: { name_en: 'Resume Test Agent', broker_number: '55555', license_end: '2027-06-30' }
    })
  }));

  await page.goto('/join.html');
  await page.locator('#broker-number').fill('55555');
  await page.locator('#btn-verify').click();
  // Wait for step 2 to become visible
  await expect(page.locator('#step-2')).toBeVisible({ timeout: 5000 });

  // Reload the page to simulate returning agent
  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  // Should resume at step 2 without needing to re-verify
  await expect(page.locator('#step-2')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#step-1')).not.toBeVisible();
  await expect(page.locator('#verify-bn')).toContainText('55555');
});
```

- [ ] **Step 5: Run the E2E test and verify it passes**

```bash
npx playwright test tests/e2e/journey1-join.spec.js --reporter=line
```

Expected: all tests PASS including the new resume test.

- [ ] **Step 6: Commit**

```bash
git add js/join.js tests/e2e/journey1-join.spec.js
git commit -m "feat(onboarding): persist step and verifiedBroker to localStorage for drop-off resume"
```

---

## Task 3: Profile Completeness Score

### Context

- `dashboard.html:114–146` — existing `#onboard-checklist` card has 5 steps: photo, bio, whatsapp, property, share
- `js/dashboard.js:262–320` — `renderOnboarding()` checks `a.tagline`, `a.photo_url`, `a.whatsapp`, property count, and a localStorage share flag
- Spec requires: score 0–100 from photo(20) + bio/tagline(20) + listing(20) + WhatsApp(20) + RERA verified(20); visible progress bar; tooltip copy per item
- Current checklist disappears when all 5 done (`doneCount >= 5`); spec says score always visible
- `a.verification_status` is available on `currentAgent` (returned by `verify-magic-link:114–120`)

**Files:** Modify `dashboard.html`, `js/dashboard.js`

- [ ] **Step 1: Add score header to the completeness card in dashboard.html**

Find `dashboard.html:116–118` (the onboard title/sub/progress section) and replace:

```html
<!-- Before -->
<div class="onboard-title">Get your profile live</div>
<div class="onboard-sub">Complete these steps to start getting leads from your SellingDubai profile.</div>
<div class="onboard-progress"><div class="onboard-bar" id="onboard-bar" style="width:0%"></div></div>

<!-- After -->
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
  <div class="onboard-title" style="margin-bottom:0;">Profile Completeness</div>
  <div id="onboard-score" style="font-size:22px;font-weight:800;color:#fff;">0%</div>
</div>
<div class="onboard-sub" id="onboard-sub-text">Complete these steps to start getting leads from your SellingDubai profile.</div>
<div class="onboard-progress"><div class="onboard-bar" id="onboard-bar" style="width:0%"></div></div>
```

- [ ] **Step 2: Replace the 5-step checklist items in dashboard.html with 4 spec-aligned items**

The current 5 steps (photo, bio, whatsapp, property, share) need to become 4 spec-aligned steps (photo, bio, whatsapp+RERA as separate items, listing). Replace `dashboard.html:119–145`:

```html
<div class="onboard-steps" id="onboard-steps">
  <a class="onboard-step" id="ob-photo" href="/edit" title="Agents with a photo get 3× more profile views">
    <span class="onboard-check" id="ob-photo-check"></span>
    <span class="onboard-step-label">Upload your profile photo</span>
    <span class="onboard-step-action">Add →</span>
  </a>
  <a class="onboard-step" id="ob-bio" href="/edit" title="A tagline tells buyers what you specialise in">
    <span class="onboard-check" id="ob-bio-check"></span>
    <span class="onboard-step-label">Add your tagline</span>
    <span class="onboard-step-action">Add →</span>
  </a>
  <a class="onboard-step" id="ob-whatsapp" href="/edit" title="Agents with WhatsApp get 2× more direct enquiries">
    <span class="onboard-check" id="ob-whatsapp-check"></span>
    <span class="onboard-step-label">Add your WhatsApp number</span>
    <span class="onboard-step-action">Add →</span>
  </a>
  <div class="onboard-step" id="ob-property" data-action="openAddListing" style="cursor:pointer;" title="Listings are the #1 reason clients tap WhatsApp">
    <span class="onboard-check" id="ob-property-check"></span>
    <span class="onboard-step-label">Add your first property listing</span>
    <span class="onboard-step-action">Add →</span>
  </div>
  <div class="onboard-step" id="ob-rera" style="cursor:default;" title="RERA verification unlocks your public profile">
    <span class="onboard-check" id="ob-rera-check"></span>
    <span class="onboard-step-label">RERA verification (pending review)</span>
    <span class="onboard-step-action" id="ob-rera-action">Pending</span>
  </div>
</div>
```

- [ ] **Step 3: Rewrite renderOnboarding() in js/dashboard.js to use the new 5-item structure**

Find the `renderOnboarding()` function (starts at line ~262) and replace the entire function:

```javascript
function renderOnboarding() {
  if (!currentAgent) return;
  // Don't show if user previously dismissed
  if (localStorage.getItem(`sd_onboard_dismissed_${currentAgent.id}`)) return;

  const a = currentAgent;
  const hasPhoto    = !!a.photo_url;
  const hasBio      = !!(a.tagline && a.tagline.trim().length > 0);
  const hasWhatsapp = !!(a.whatsapp && String(a.whatsapp).replace(/\D/g, '').length >= 8);
  const hasProperty = (a.property_count || 0) > 0;
  const hasRera     = a.verification_status === 'verified';

  const steps = [
    { id: 'ob-photo',    check: 'ob-photo-check',    done: hasPhoto },
    { id: 'ob-bio',      check: 'ob-bio-check',      done: hasBio },
    { id: 'ob-whatsapp', check: 'ob-whatsapp-check', done: hasWhatsapp },
    { id: 'ob-property', check: 'ob-property-check', done: hasProperty },
    { id: 'ob-rera',     check: 'ob-rera-check',     done: hasRera },
  ];

  const completed = steps.filter(s => s.done).length;
  const total = steps.length;
  const score = Math.round((completed / total) * 100);

  // Always show the card — agents can see their score even when complete
  document.getElementById('onboard-checklist').style.display = 'block';
  document.getElementById('onboard-bar').style.width = `${score}%`;

  const scoreEl = document.getElementById('onboard-score');
  if (scoreEl) scoreEl.textContent = `${score}%`;

  const subEl = document.getElementById('onboard-sub-text');
  if (subEl) {
    subEl.textContent = score === 100
      ? 'Your profile is complete. Keep your listings up to date to maximise lead flow.'
      : `${score}% complete — ${total - completed} step${total - completed !== 1 ? 's' : ''} remaining`;
  }

  steps.forEach(s => {
    const el  = document.getElementById(s.id);
    const chk = document.getElementById(s.check);
    if (!el || !chk) return;
    if (s.done) {
      el.classList.add('done');
      chk.innerHTML = '✓';
    } else {
      el.classList.remove('done');
      chk.innerHTML = '';
    }
  });

  // Update RERA action label based on status
  const reraAction = document.getElementById('ob-rera-action');
  if (reraAction) {
    if (hasRera) {
      reraAction.textContent = 'Verified ✓';
    } else if (a.verification_status === 'pending') {
      reraAction.textContent = 'Under review';
    } else {
      reraAction.textContent = 'Join to verify';
    }
  }
}
```

- [ ] **Step 4: Remove the stale `updateOnboardPropertyStep` call pattern**

After the properties load (around line ~641), there's a call `updateOnboardPropertyStep(propertiesCache.length)`. Find and replace it with a simple re-render:

```javascript
// Before (find this pattern ~line 642):
updateOnboardPropertyStep(propertiesCache.length);

// After:
renderOnboarding();
```

Then find and delete the `updateOnboardPropertyStep` function if it exists (search for `function updateOnboardPropertyStep`). Also remove the `copyProfileLink` share-step logic for the deleted `ob-share` element:

In `window.copyProfileLink` (line ~539), find the block that updates `ob-share`/`ob-share-check` and remove it. The new `renderOnboarding()` handles everything.

- [ ] **Step 5: Verify the dashboard loads and shows the score card**

```bash
npm run dev
# Open http://localhost:8888/dashboard.html in a browser and log in
# Confirm: "Profile Completeness" title with "X%" score is visible
# Confirm: 5 checklist items render correctly
# Confirm: progress bar width matches the percentage
```

- [ ] **Step 6: Commit**

```bash
git add dashboard.html js/dashboard.js
git commit -m "feat(dashboard): add profile completeness score (0-100%) with RERA verification step"
```

---

## Task 4: DB Migration — Nudge Tracking Columns

### Context

The `lead-nudger` function needs to track which nudges have been sent to avoid re-sending. Add columns to `agents` (lifecycle nudges) and `leads` (idle reminder).

**Files:** Create `supabase/migrations/20260408000001_nudge_columns.sql`

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260408000001_nudge_columns.sql`:

```sql
-- Nudge tracking columns for lead-nudger cron function
-- Adds nullable TIMESTAMPTZ columns so we can tell when (or if) each nudge was last sent.

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS nudge_day1_sent_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nudge_day3_sent_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nudge_day7_sent_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nudge_weekly_sent_at TIMESTAMPTZ;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS idle_nudge_sent_at TIMESTAMPTZ;

-- Index to speed up the nagger's "leads idle > 5 days, no nudge" query
CREATE INDEX IF NOT EXISTS idx_leads_idle_nudge
  ON leads (created_at, idle_nudge_sent_at)
  WHERE idle_nudge_sent_at IS NULL;
```

- [ ] **Step 2: Apply the migration to the local stack**

```bash
# Reset local DB to pick up new migration
supabase db reset
```

Expected output: all migrations run without error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260408000001_nudge_columns.sql
git commit -m "chore(migration): add nudge tracking columns to agents and leads"
```

---

## Task 5: lead-nudger Edge Function

### Context

New cron function that fires WhatsApp lifecycle nudges for Dubai agents. Uses same Meta Graph API pattern as `whatsapp-ingest`.

**Five nudge types:**
1. **Day 1** — agent joined < 24h ago, `nudge_day1_sent_at IS NULL`, has a WhatsApp number
2. **Day 3** — joined > 2 days ago, profile incomplete (no photo OR no tagline OR no listing), `nudge_day3_sent_at IS NULL`
3. **Day 7** — joined > 6 days ago, zero active listings, `nudge_day7_sent_at IS NULL`
4. **Weekly** — `nudge_weekly_sent_at IS NULL` or `> 7 days ago`, agent has leads in the last 7 days
5. **Lead idle** — lead created > 5 days ago, `idle_nudge_sent_at IS NULL`

**Auth:** `CRON_SECRET` (same pattern as `lead-followup-nagger`)

**WhatsApp send:** `WA_TOKEN` + `WA_PHONE_ID` env vars → `https://graph.facebook.com/v18.0/${WA_PHONE_ID}/messages`

**Files:** Create `edge-functions/lead-nudger/index.ts`, `edge-functions/lead-nudger/index.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `edge-functions/lead-nudger/index.test.ts`:

```typescript
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeNudges, normalizePhone } from "./index.ts";

// --- normalizePhone ---

Deno.test("normalizePhone: strips non-digits and adds UAE code if missing", () => {
  assertEquals(normalizePhone("+971 50 123 4567"), "971501234567");
  assertEquals(normalizePhone("050 123 4567"), "971501234567");
  assertEquals(normalizePhone("00971501234567"), "971501234567");
});

Deno.test("normalizePhone: returns empty string for falsy input", () => {
  assertEquals(normalizePhone(null), "");
  assertEquals(normalizePhone(""), "");
});

// --- computeNudges ---

const BASE_AGENT = {
  id: "agent-1",
  name: "Test Agent",
  whatsapp: "+971501234567",
  photo_url: null,
  tagline: null,
  verification_status: "pending",
  nudge_day1_sent_at: null,
  nudge_day3_sent_at: null,
  nudge_day7_sent_at: null,
  nudge_weekly_sent_at: null,
};

Deno.test("computeNudges: day1 fires for agent created < 24h with no day1 sent", () => {
  const now = Date.now();
  const agent = { ...BASE_AGENT, created_at: new Date(now - 2 * 60 * 60 * 1000).toISOString() };
  const nudges = computeNudges(agent, 0, now);
  assertEquals(nudges.includes("day1"), true);
});

Deno.test("computeNudges: day1 does not fire if already sent", () => {
  const now = Date.now();
  const agent = {
    ...BASE_AGENT,
    created_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    nudge_day1_sent_at: new Date(now - 1 * 60 * 60 * 1000).toISOString(),
  };
  const nudges = computeNudges(agent, 0, now);
  assertEquals(nudges.includes("day1"), false);
});

Deno.test("computeNudges: day3 fires for agent > 2 days old with incomplete profile", () => {
  const now = Date.now();
  const agent = {
    ...BASE_AGENT,
    created_at: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
    // no photo, no tagline — profile incomplete
  };
  const nudges = computeNudges(agent, 0, now); // 0 active listings
  assertEquals(nudges.includes("day3"), true);
});

Deno.test("computeNudges: day3 does not fire if profile is complete", () => {
  const now = Date.now();
  const agent = {
    ...BASE_AGENT,
    created_at: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
    photo_url: "https://example.com/photo.jpg",
    tagline: "Luxury specialist in Palm Jumeirah",
    whatsapp: "+971501234567",
  };
  const nudges = computeNudges(agent, 1, now); // 1 listing — complete
  assertEquals(nudges.includes("day3"), false);
});

Deno.test("computeNudges: day7 fires for agent > 6 days old with zero listings", () => {
  const now = Date.now();
  const agent = {
    ...BASE_AGENT,
    created_at: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const nudges = computeNudges(agent, 0, now);
  assertEquals(nudges.includes("day7"), true);
});

Deno.test("computeNudges: day7 does not fire if agent has listings", () => {
  const now = Date.now();
  const agent = {
    ...BASE_AGENT,
    created_at: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const nudges = computeNudges(agent, 2, now);
  assertEquals(nudges.includes("day7"), false);
});

Deno.test("computeNudges: weekly fires if nudge_weekly_sent_at > 7 days ago", () => {
  const now = Date.now();
  const agent = {
    ...BASE_AGENT,
    created_at: new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString(),
    nudge_weekly_sent_at: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const nudges = computeNudges(agent, 0, now);
  assertEquals(nudges.includes("weekly"), true);
});

Deno.test("computeNudges: weekly does not fire if sent < 7 days ago", () => {
  const now = Date.now();
  const agent = {
    ...BASE_AGENT,
    created_at: new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString(),
    nudge_weekly_sent_at: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const nudges = computeNudges(agent, 0, now);
  assertEquals(nudges.includes("weekly"), false);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd edge-functions/lead-nudger
deno test index.test.ts --allow-env --allow-net
```

Expected: error — `computeNudges` and `normalizePhone` not found (module doesn't exist yet).

- [ ] **Step 3: Implement the edge function**

Create `edge-functions/lead-nudger/index.ts`:

```typescript
// ===========================================
// LEAD NUDGER — SellingDubai
// ===========================================
// Cron function. Sends WhatsApp lifecycle nudges to agents:
//   Day 1 after signup: welcome + "add your first listing" link
//   Day 3 (profile <60%): "your profile is X% complete"
//   Day 7 (no listing): "add a property to start receiving leads"
//   Weekly: "you have N leads this week — M need follow-up"
//   Lead idle >5 days: "Hassan hasn't heard from you in 5 days"
//
// Auth: CRON_SECRET (query ?secret= or Authorization Bearer or x-cron-secret header)
// Returns: { sent: N, skipped: N, details: [...] }
// ===========================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Types ──

interface Agent {
  id: string;
  name: string;
  whatsapp: string | null;
  photo_url: string | null;
  tagline: string | null;
  verification_status: string | null;
  created_at: string;
  nudge_day1_sent_at: string | null;
  nudge_day3_sent_at: string | null;
  nudge_day7_sent_at: string | null;
  nudge_weekly_sent_at: string | null;
}

// ── Pure helpers (exported for tests) ──

/**
 * Normalises a WhatsApp number to the E.164-style digit string Meta expects.
 * Strips all non-digits, removes leading '00', prepends '971' if it looks like
 * a UAE local number (starts with 05x).
 */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  // UAE mobile: 05x → 9715x
  if (digits.startsWith("05") && digits.length === 10) digits = "971" + digits.slice(1);
  return digits;
}

/**
 * Determines which nudge types an agent should receive right now.
 * Pure function — no side effects, no I/O. Tested directly.
 *
 * @param agent     The agent record from DB
 * @param listingCount  Number of active listings for this agent
 * @param nowMs     Current timestamp in milliseconds (injectable for tests)
 */
export function computeNudges(
  agent: Agent & { created_at: string },
  listingCount: number,
  nowMs: number = Date.now(),
): string[] {
  const nudges: string[] = [];
  const createdAt = new Date(agent.created_at).getTime();
  const ageMs = nowMs - createdAt;

  const DAY = 24 * 60 * 60 * 1000;

  // Day 1: joined < 24h ago, no day1 nudge sent yet
  if (ageMs < DAY && !agent.nudge_day1_sent_at) {
    nudges.push("day1");
  }

  // Day 3: joined > 2 days ago, profile incomplete, no day3 nudge sent
  if (ageMs > 2 * DAY) {
    const hasPhoto    = !!agent.photo_url;
    const hasBio      = !!(agent.tagline && agent.tagline.trim().length > 0);
    const hasWhatsapp = !!(agent.whatsapp && normalizePhone(agent.whatsapp).length >= 9);
    const hasListing  = listingCount > 0;
    const profileComplete = hasPhoto && hasBio && hasWhatsapp && hasListing;

    if (!profileComplete && !agent.nudge_day3_sent_at) {
      nudges.push("day3");
    }
  }

  // Day 7: joined > 6 days ago, still no listing, no day7 nudge sent
  if (ageMs > 6 * DAY && listingCount === 0 && !agent.nudge_day7_sent_at) {
    nudges.push("day7");
  }

  // Weekly: no weekly nudge sent yet, or last sent > 7 days ago
  if (!agent.nudge_weekly_sent_at) {
    nudges.push("weekly");
  } else {
    const lastWeekly = new Date(agent.nudge_weekly_sent_at).getTime();
    if (nowMs - lastWeekly > 7 * DAY) nudges.push("weekly");
  }

  return nudges;
}

// ── WhatsApp sender ──

async function sendWhatsApp(
  waToken: string,
  waPhoneId: string,
  to: string,
  body: string,
): Promise<boolean> {
  const phone = normalizePhone(to);
  if (!phone) return false;
  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${waPhoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${waToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: { body },
        }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

// ── Message builders ──

const DASHBOARD_URL = "https://sellingdubai.com/dashboard";

function buildDay1Message(agentName: string): string {
  return `Hi ${agentName} 👋 Welcome to SellingDubai! Add your first property listing to start receiving enquiries from buyers: ${DASHBOARD_URL}`;
}

function buildDay3Message(agentName: string): string {
  return `Hi ${agentName}, your SellingDubai profile isn't complete yet. Agents with a photo, tagline, and listing get 3× more leads. It takes 2 minutes: ${DASHBOARD_URL}`;
}

function buildDay7Message(agentName: string): string {
  return `Hi ${agentName}, you still haven't added a property listing to SellingDubai. Listings are the #1 reason buyers contact agents on the platform: ${DASHBOARD_URL}`;
}

function buildWeeklyMessage(agentName: string, leadCount: number, uncontactedCount: number): string {
  if (leadCount === 0) {
    return `Hi ${agentName}, your SellingDubai weekly summary: no new leads this week. Share your profile link to get started: ${DASHBOARD_URL}`;
  }
  if (uncontactedCount > 0) {
    return `Hi ${agentName}, your SellingDubai weekly summary: ${leadCount} lead${leadCount !== 1 ? "s" : ""} this week — ${uncontactedCount} still need${uncontactedCount === 1 ? "s" : ""} follow-up: ${DASHBOARD_URL}`;
  }
  return `Hi ${agentName}, your SellingDubai weekly summary: ${leadCount} lead${leadCount !== 1 ? "s" : ""} this week. Great work! ${DASHBOARD_URL}`;
}

function buildIdleLeadMessage(agentName: string, leadName: string, daysIdle: number): string {
  return `Hi ${agentName}, ${leadName} enquired ${daysIdle} days ago on SellingDubai and hasn't heard back. Speed-to-lead matters: ${DASHBOARD_URL}`;
}

// ── CORS ──

const ALLOWED_ORIGINS = [
  "https://www.sellingdubai.com",
  "https://sellingdubai.com",
  "https://staging.sellingdubai.com",
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "content-type, authorization, x-cron-secret",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

// ── Handler ──

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    // Auth
    const cronSecret = Deno.env.get("CRON_SECRET") || Deno.env.get("cron_secret") || "";
    if (!cronSecret) {
      return new Response(JSON.stringify({ error: "CRON_SECRET not configured." }), { status: 401, headers: cors });
    }
    const url = new URL(req.url);
    const isAuthorized =
      url.searchParams.get("secret") === cronSecret ||
      req.headers.get("authorization") === `Bearer ${cronSecret}` ||
      req.headers.get("x-cron-secret") === cronSecret;

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), { status: 401, headers: cors });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const WA_TOKEN    = Deno.env.get("WA_TOKEN") || "";
    const WA_PHONE_ID = Deno.env.get("WA_PHONE_ID") || "";

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

    let sent = 0;
    let skipped = 0;
    const details: string[] = [];

    // ── 1. Lifecycle nudges (Day 1, 3, 7, weekly) ──

    // Fetch agents created in the last 8 days who have a WhatsApp number and
    // haven't had ALL nudges sent (so we exclude fully-nudged agents quickly)
    const eightDaysAgo = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString();
    const { data: agents, error: agentsErr } = await supabase
      .from("agents")
      .select("id, name, whatsapp, photo_url, tagline, verification_status, created_at, nudge_day1_sent_at, nudge_day3_sent_at, nudge_day7_sent_at, nudge_weekly_sent_at")
      .not("whatsapp", "is", null)
      .gte("created_at", eightDaysAgo)
      .eq("is_active", true)
      .limit(200);

    if (agentsErr) {
      console.error("lead-nudger: agents query error");
      return new Response(JSON.stringify({ error: "Failed to query agents." }), { status: 500, headers: cors });
    }

    for (const agent of (agents || []) as Agent[]) {
      // Get listing count for this agent
      const { count: listingCount } = await supabase
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", agent.id)
        .eq("is_active", true);

      const nudgesToSend = computeNudges(agent, listingCount ?? 0, now);

      for (const nudgeType of nudgesToSend) {
        let message = "";
        let updateField = "";

        if (nudgeType === "day1") {
          message = buildDay1Message(agent.name);
          updateField = "nudge_day1_sent_at";
        } else if (nudgeType === "day3") {
          message = buildDay3Message(agent.name);
          updateField = "nudge_day3_sent_at";
        } else if (nudgeType === "day7") {
          message = buildDay7Message(agent.name);
          updateField = "nudge_day7_sent_at";
        } else if (nudgeType === "weekly") {
          // Get weekly lead counts
          const { count: weekLeads } = await supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("agent_id", agent.id)
            .gte("created_at", sevenDaysAgo);

          const { count: uncontacted } = await supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("agent_id", agent.id)
            .gte("created_at", sevenDaysAgo)
            .is("contacted_at", null);

          message = buildWeeklyMessage(agent.name, weekLeads ?? 0, uncontacted ?? 0);
          updateField = "nudge_weekly_sent_at";
        }

        if (!message) continue;

        if (WA_TOKEN && WA_PHONE_ID && agent.whatsapp) {
          const ok = await sendWhatsApp(WA_TOKEN, WA_PHONE_ID, agent.whatsapp, message);
          if (ok) {
            await supabase.from("agents").update({ [updateField]: nowIso }).eq("id", agent.id);
            sent++;
            details.push(`${nudgeType}:${agent.id}`);
          } else {
            skipped++;
          }
        } else {
          // No WA credentials configured — log but don't fail
          console.warn(`lead-nudger: WA credentials missing, skipping ${nudgeType} for ${agent.id}`);
          skipped++;
        }
      }
    }

    // ── 2. Weekly nudge also runs for older agents ──
    // Re-query agents older than 8 days who need weekly nudge
    const { data: olderAgents } = await supabase
      .from("agents")
      .select("id, name, whatsapp, photo_url, tagline, verification_status, created_at, nudge_day1_sent_at, nudge_day3_sent_at, nudge_day7_sent_at, nudge_weekly_sent_at")
      .not("whatsapp", "is", null)
      .lt("created_at", eightDaysAgo)
      .eq("is_active", true)
      .or(`nudge_weekly_sent_at.is.null,nudge_weekly_sent_at.lt.${sevenDaysAgo}`)
      .limit(200);

    for (const agent of (olderAgents || []) as Agent[]) {
      const { count: weekLeads } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", agent.id)
        .gte("created_at", sevenDaysAgo);

      const { count: uncontacted } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", agent.id)
        .gte("created_at", sevenDaysAgo)
        .is("contacted_at", null);

      const message = buildWeeklyMessage(agent.name, weekLeads ?? 0, uncontacted ?? 0);

      if (WA_TOKEN && WA_PHONE_ID && agent.whatsapp) {
        const ok = await sendWhatsApp(WA_TOKEN, WA_PHONE_ID, agent.whatsapp, message);
        if (ok) {
          await supabase.from("agents").update({ nudge_weekly_sent_at: nowIso }).eq("id", agent.id);
          sent++;
          details.push(`weekly:${agent.id}`);
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }
    }

    // ── 3. Lead idle nudges (> 5 days old, not contacted) ──

    const fiveDaysAgo = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString();
    const { data: idleLeads } = await supabase
      .from("leads")
      .select("id, name, created_at, agent_id, agents!inner(id, name, whatsapp)")
      .lt("created_at", fiveDaysAgo)
      .is("contacted_at", null)
      .is("idle_nudge_sent_at", null)
      .eq("archived", false)
      .limit(100);

    for (const lead of (idleLeads || []) as Array<{ id: string; name: string; created_at: string; agent_id: string; agents: { id: string; name: string; whatsapp: string | null } }>) {
      const agent = lead.agents;
      if (!agent?.whatsapp) continue;

      const daysIdle = Math.floor((now - new Date(lead.created_at).getTime()) / (24 * 60 * 60 * 1000));
      const message = buildIdleLeadMessage(agent.name, lead.name || "Your lead", daysIdle);

      if (WA_TOKEN && WA_PHONE_ID) {
        const ok = await sendWhatsApp(WA_TOKEN, WA_PHONE_ID, agent.whatsapp, message);
        if (ok) {
          await supabase.from("leads").update({ idle_nudge_sent_at: nowIso }).eq("id", lead.id);
          sent++;
          details.push(`idle:${lead.id}`);
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }
    }

    return new Response(
      JSON.stringify({ sent, skipped, details }),
      { status: 200, headers: cors },
    );
  } catch (e) {
    console.error("lead-nudger: unhandled error");
    return new Response(
      JSON.stringify({ error: "Internal server error." }),
      { status: 500, headers: cors },
    );
  }
});
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
cd edge-functions/lead-nudger
deno test index.test.ts --allow-env --allow-net
```

Expected: all 9 tests PASS.

- [ ] **Step 5: Add lead-nudger to the pre-deploy smoke test**

Open `scripts/smoke-test.sh` and add an auth-gated check for lead-nudger to the edge function health checks section:

```bash
# Add after the existing edge function checks:
check_edge "lead-nudger (health)" "${SMOKE_SUPABASE_URL}/functions/v1/lead-nudger?secret=INVALID" "401"
```

This verifies the function is deployed and the auth check works (should return 401 for invalid secret).

- [ ] **Step 6: Verify the new function is added to the supabase/functions symlink directory**

```bash
ls -la supabase/functions/ | grep lead-nudger
```

The `supabase/functions` directory is a symlink to `../edge-functions`. New function directories added under `edge-functions/` are automatically visible. Confirm it appears.

- [ ] **Step 7: Commit**

```bash
git add edge-functions/lead-nudger/index.ts edge-functions/lead-nudger/index.test.ts scripts/smoke-test.sh
git commit -m "feat(lead-nudger): add WhatsApp lifecycle nudge cron function with Day 1/3/7/weekly/idle triggers"
```

---

## Task 6: Register lead-nudger as a Cron Job

### Context

`lead-followup-nagger` is triggered every 15 minutes via `pg_cron` or an external cron hitting the endpoint. `lead-nudger` only needs to run **daily** — nudge windows are measured in days.

**Files:** `supabase/migrations/20260408000002_lead_nudger_cron.sql`

- [ ] **Step 1: Write the migration to register the cron job**

Create `supabase/migrations/20260408000002_lead_nudger_cron.sql`:

```sql
-- Register lead-nudger as a daily cron job via pg_cron.
-- Fires at 9:00 AM UTC (1:00 PM Dubai time / GST = UTC+4).
-- Requires pg_cron extension (enabled by default on Supabase).

SELECT cron.schedule(
  'lead-nudger-daily',         -- job name (unique)
  '0 9 * * *',                 -- cron expression: daily at 09:00 UTC
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/lead-nudger',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

> **Note:** The `app.supabase_url` and `app.cron_secret` settings must be set on the Supabase project before this migration runs. Alternatively, call the function URL from an external cron service (cron-job.org) with the `x-cron-secret` header — this is the safer option if `pg_net` is not available.

- [ ] **Step 2: Apply migration**

```bash
supabase db reset
```

If `pg_cron` or `pg_net` is not available locally, this migration can be applied manually on the Supabase dashboard SQL editor in production only.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260408000002_lead_nudger_cron.sql
git commit -m "chore(cron): schedule lead-nudger to fire daily at 09:00 UTC"
```

---

## Self-Check

**Spec coverage:**

| Spec requirement | Task |
|-----------------|------|
| Step persistence: save progress to localStorage at each step | Task 2 |
| Copy clarity: replace "Is This You?" DLD heading with "Verify your RERA licence" | Task 1 |
| Inline validation: real-time feedback on BRN format | Task 1 |
| Profile completeness score 0–100 | Task 3 |
| Score shown as progress bar on dashboard home | Task 3 |
| Tooltip on each incomplete item | Task 3 (title attributes) |
| WhatsApp nudge sequence (Day 1/3/7, weekly, idle >5 days) | Tasks 4+5+6 |
| bio/tagline mismatch | Verified not a runtime issue — `join.js`, `edit.js`, `dashboard.js` all use `tagline` consistently. No code change needed; SCHEMA.md has a docs-only discrepancy (`bio` vs `tagline`). |

**Placeholder scan:** None — all steps contain exact code.

**Type consistency:** `Agent` interface defined once in `index.ts` and used consistently. `computeNudges` and `normalizePhone` exported from same file used in tests.

**Scope check:** This plan covers Phase 1 only (onboarding + nudges). WhatsApp AI Secretary, Telegram, and Voice are separate plans.
