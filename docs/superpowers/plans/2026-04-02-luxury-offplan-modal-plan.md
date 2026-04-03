# Luxury Off-Plan Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `js/project-detail.js` with a stats bar below the hero, a payment milestone vertical timeline, unit row cards with availability, and replace the local NETLIFY_IMG with the shared optimizeImg utility.

**Architecture:** All changes are in `js/project-detail.js` (473 lines). No new files. Tasks 1–4 are independent — each modifies a distinct part of the file and can be committed separately. The file uses template-literal HTML generation; all styles are inline (existing pattern). No CSS file changes.

**Tech Stack:** Vanilla JS ES modules, esbuild code splitting, inline HTML template strings.

---

## File Map

| File | Changes |
|---|---|
| `js/project-detail.js` | Import optimizeImg; remove NETLIFY_IMG const; replace 6 call sites; add stats bar; add milestone timeline; replace unit cards |

---

## Task 1: Replace NETLIFY_IMG with optimizeImg

**Files:**
- Modify: `js/project-detail.js` lines 4–11 (imports + const), 121, 165, 232, 327, 356, 406

The local `NETLIFY_IMG` function is identical in behavior to `optimizeImg` in `utils.js`. This task removes the duplication.

- [ ] **Step 1: Update the import line**

Current line 4–6:
```js
import { supabase } from './config.js';
import { escHtml, escAttr } from './utils.js';
import { currentAgent } from './state.js';
```

Replace with:
```js
import { supabase } from './config.js';
import { escHtml, escAttr, optimizeImg } from './utils.js';
import { currentAgent } from './state.js';
```

- [ ] **Step 2: Delete the NETLIFY_IMG const**

Remove lines 10–11:
```js
const NETLIFY_IMG = (url, w) =>
  url ? `/.netlify/images?url=${encodeURIComponent(url)}&w=${w}&fm=webp&q=80` : '';
```

- [ ] **Step 3: Replace all 6 call sites**

Line 121 — in `_lbRender()`:
```js
// before
img.src = NETLIFY_IMG(_lbImgs[_lbIdx], 1200);
// after
img.src = optimizeImg(_lbImgs[_lbIdx], 1200);
```

Line 165 — in `_injectProjectSchema()`:
```js
// before
if (project.cover_image_url) schema.image = NETLIFY_IMG(project.cover_image_url, 800);
// after
if (project.cover_image_url) schema.image = optimizeImg(project.cover_image_url, 800);
```

Line 232 — hero imgSrc:
```js
// before
const imgSrc = project.cover_image_url ? NETLIFY_IMG(project.cover_image_url, 800) : '';
// after
const imgSrc = project.cover_image_url ? optimizeImg(project.cover_image_url, 800) : '';
```

Line 327 — gallery map:
```js
// before
return `<div ... onclick="openProjLightbox(${lbIdx})"><img src="${escAttr(NETLIFY_IMG(u, 800))}" ...
// after
return `<div ... onclick="openProjLightbox(${lbIdx})"><img src="${escAttr(optimizeImg(u, 800))}" ...
```

Line 356 — developer logo:
```js
// before
${dev.logo_url ? `<img src="${escAttr(NETLIFY_IMG(dev.logo_url, 80))}" ...
// after
${dev.logo_url ? `<img src="${escAttr(optimizeImg(dev.logo_url, 80))}" ...
```

Line 406 — site plan images:
```js
// before
${sitePlanImgs.map((u, i) => `<img src="${escAttr(NETLIFY_IMG(u, 800))}" ...
// after
${sitePlanImgs.map((u, i) => `<img src="${escAttr(optimizeImg(u, 800))}" ...
```

- [ ] **Step 4: Verify no NETLIFY_IMG references remain**

Run:
```bash
grep -n "NETLIFY_IMG" js/project-detail.js
```

Expected: no output (zero matches).

- [ ] **Step 5: Build and verify**

Run:
```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds, no errors. Note the `project-detail` chunk size in the output.

- [ ] **Step 6: Commit**

```bash
git add js/project-detail.js
git commit -m "refactor: replace local NETLIFY_IMG with shared optimizeImg in project-detail"
```

---

## Task 2: Add compact price formatter and stats bar

**Files:**
- Modify: `js/project-detail.js`

The stats bar sits between the hero gallery and the `detail-body` div. It shows up to 4 cells: From price / Handover / Size from / Pay plan. Also removes the standalone price div (line 342) and specs row (lines 345–351) that become redundant.

- [ ] **Step 1: Add fmtCompact helper after fmtPrice**

Current line 13–14:
```js
const fmtPrice = (n) =>
  n ? 'AED\u00a0' + Number(n).toLocaleString('en-AE', { maximumFractionDigits: 0 }) : null;
```

Add immediately after:
```js
const fmtCompact = (n) => {
  if (!n) return null;
  const num = Number(n);
  if (num >= 1_000_000) return 'AED\u00a0' + (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 1_000) return 'AED\u00a0' + Math.round(num / 1_000) + 'K';
  return 'AED\u00a0' + num.toLocaleString('en-AE', { maximumFractionDigits: 0 });
};
```

- [ ] **Step 2: Add completionShort variable**

After the existing `completionStr` variable (around line 318–320), add:
```js
const completionShort = project.completion_date
  ? new Date(project.completion_date).toLocaleDateString('en-AE', { month: 'short', year: 'numeric' })
  : null;
```

- [ ] **Step 3: Build stats cells array**

After the `completionShort` line, add:
```js
const statCells = [];
if (project.min_price) statCells.push({ label: 'From', value: fmtCompact(project.min_price) });
if (completionShort) statCells.push({ label: 'Handover', value: completionShort });
if (project.min_area_sqft) statCells.push({ label: 'Size from', value: Number(project.min_area_sqft).toLocaleString('en-AE', { maximumFractionDigits: 0 }) + '\u00a0sqft' });
if (hasPaymentPlan) {
  const parts = [bookingPct, constructionPct, handoverPct].filter(v => v != null);
  statCells.push({ label: 'Pay plan', value: parts.join('/') });
}
const showStatsBar = statCells.length >= 2;
```

Note: `hasPaymentPlan` is already computed above on line 316, so this is safe to reference here.

- [ ] **Step 4: Insert stats bar HTML into the template**

In `sheet.innerHTML`, find the closing of the gallery block and the opening of `detail-body`:
```js
    </div>` : ''}

    <div class="detail-body" style="padding:20px 20px 80px;">
```

Replace with:
```js
    </div>` : ''}

    ${showStatsBar ? `
    <div style="display:grid;grid-template-columns:repeat(${statCells.length},1fr);border-bottom:1px solid rgba(255,255,255,0.06);">
      ${statCells.map((c, i) => `
      <div style="padding:10px 12px;${i < statCells.length - 1 ? 'border-right:1px solid rgba(255,255,255,0.06);' : ''}">
        <div style="font-size:10px;color:rgba(255,255,255,0.35);margin-bottom:3px;">${escHtml(c.label)}</div>
        <div style="font-size:13px;font-weight:700;">${escHtml(c.value)}</div>
      </div>`).join('')}
    </div>` : ''}

    <div class="detail-body" style="padding:20px 20px 80px;">
```

- [ ] **Step 5: Remove standalone price div**

Find and delete this block in `sheet.innerHTML` (around line 342):
```js
      <!-- Price -->
      ${priceStr ? `<div style="font-size:20px;font-weight:700;font-family:'Manrope',sans-serif;margin-bottom:16px;">${escHtml(priceStr)}</div>` : ''}
```

- [ ] **Step 6: Remove specs row**

Find and delete this block (around lines 345–351):
```js
      <!-- Specs row -->
      ${(types || project.beds || areaStr || completionStr) ? `
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px;">
        ${types ? `<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Unit Types</span><span style="font-weight:600;">${escHtml(types)}</span></div>` : ''}
        ${project.beds ? `<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Beds</span><span style="font-weight:600;">${escHtml(project.beds)}</span></div>` : ''}
        ${areaStr ? `<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Area</span><span style="font-weight:600;">${escHtml(areaStr)}</span></div>` : ''}
        ${completionStr ? `<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px;font-size:12px;"><span style="color:rgba(255,255,255,0.45);display:block;margin-bottom:2px;">Completion</span><span style="font-weight:600;">${escHtml(completionStr)}</span></div>` : ''}
      </div>` : ''}
```

- [ ] **Step 7: Build and verify**

Run:
```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds. No errors.

- [ ] **Step 8: Commit**

```bash
git add js/project-detail.js
git commit -m "feat: add investment stats bar below hero in project-detail modal"
```

---

## Task 3: Payment milestone vertical timeline

**Files:**
- Modify: `js/project-detail.js`

After the 3 summary payment tiles, render a vertical dot timeline listing every milestone from `paymentMilestones`. Only shown when the array is non-empty.

- [ ] **Step 1: Locate the payment plan section in sheet.innerHTML**

Find this block (around lines 365–377):
```js
      <!-- Payment plan -->
      ${hasPaymentPlan ? `
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:12px;">Payment Plan</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${bookingPct != null ? `<div style="flex:1;min-width:80px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;font-family:'Manrope',sans-serif;">${bookingPct}%</div><div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">Booking</div></div>` : ''}
          ${constructionPct != null ? `<div style="flex:1;min-width:80px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;font-family:'Manrope',sans-serif;">${constructionPct}%</div><div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">Construction</div></div>` : ''}
          ${handoverPct != null ? `<div style="flex:1;min-width:80px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;font-family:'Manrope',sans-serif;">${handoverPct}%</div><div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">Handover</div></div>` : ''}
        </div>
      </div>` : `
```

- [ ] **Step 2: Add milestone timeline after the summary tiles**

Replace the closing of the hasPaymentPlan truthy branch — change:
```js
        </div>
      </div>` : `
```

To:
```js
        </div>
        ${paymentMilestones ? `
        <div style="margin-top:12px;position:relative;padding-left:20px;">
          <div style="position:absolute;left:6px;top:4px;bottom:4px;width:1px;background:rgba(255,255,255,0.08);"></div>
          ${paymentMilestones.map((m, i) => `
          <div style="position:relative;margin-bottom:8px;">
            <div style="position:absolute;left:-17px;top:3px;width:8px;height:8px;border-radius:50%;background:${i === 0 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)'};"></div>
            <div style="display:flex;justify-content:space-between;align-items:baseline;">
              <span style="font-size:11px;color:rgba(255,255,255,0.55);">${escHtml(m.name || '')}</span>
              <span style="font-size:12px;font-weight:700;">${escHtml(String(m.percentage || ''))}</span>
            </div>
          </div>`).join('')}
        </div>` : ''}
      </div>` : `
```

- [ ] **Step 3: Build and verify**

Run:
```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add js/project-detail.js
git commit -m "feat: add payment milestone vertical timeline in project-detail modal"
```

---

## Task 4: Unit row cards

**Files:**
- Modify: `js/project-detail.js`

Replace the flat unit cards (type + price line, sqft below) with a structured 4-column grid row per unit: Type / Size / Price / Availability.

- [ ] **Step 1: Locate the available units section**

Find this block (around lines 379–399):
```js
      <!-- Available units -->
      ${units.length ? `
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;">Available Units</h3>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${units.map(u => {
            const bedLabel = u.bedroom ? `${u.bedroom}BR ` : '';
            const typeLabel = bedLabel + (u.property_types || 'Unit');
            const areaVal = u.lowest_area || u.area_sqft || u.area;
            const priceVal = u.lowest_price || u.price || u.min_price;
            return `
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px 14px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
              <div style="font-size:13px;font-weight:600;">${escHtml(typeLabel)}</div>
              ${priceVal ? `<div style="font-size:13px;font-weight:700;white-space:nowrap;">AED\u00a0${Number(priceVal).toLocaleString('en-AE', {maximumFractionDigits:0})}</div>` : ''}
            </div>
            ${areaVal ? `<div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:3px;">From ${escHtml(Number(areaVal).toLocaleString('en-AE', {maximumFractionDigits:0}))} sqft</div>` : ''}
          </div>`;
          }).join('')}
        </div>
      </div>` : ''}
```

- [ ] **Step 2: Replace with row cards**

Replace the entire block above with:
```js
      <!-- Available units -->
      ${units.length ? `
      <div style="margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;">Available Units</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 52px;gap:2px;padding:0 2px 6px;font-size:9px;color:rgba(255,255,255,0.25);">
          <span>Type</span><span>Size</span><span>From</span><span style="text-align:right;">Avail.</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          ${units.map(u => {
            const typeLabel = u.bedroom ? `${u.bedroom}\u00a0BR` : (u.property_types || 'Unit');
            const areaVal = u.lowest_area || u.area_sqft || u.area;
            const priceVal = u.lowest_price || u.price || u.min_price;
            const avail = u.available_units_count;
            let availColor = '', availText = '';
            if (avail != null) {
              if (avail === 0) { availColor = 'rgba(255,255,255,0.3)'; availText = 'Sold out'; }
              else if (avail <= 5) { availColor = '#f59e0b'; availText = avail + ' left'; }
              else { availColor = '#4ade80'; availText = avail + ' left'; }
            }
            return `
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr 52px;gap:4px;align-items:center;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:8px 10px;">
            <div style="font-size:11px;font-weight:700;">${escHtml(typeLabel)}</div>
            <div style="font-size:10px;color:rgba(255,255,255,0.5);">${areaVal ? escHtml(Number(areaVal).toLocaleString('en-AE', {maximumFractionDigits:0})) + '\u00a0sqft' : ''}</div>
            <div style="font-size:11px;font-weight:600;">${priceVal ? 'AED\u00a0' + Number(priceVal).toLocaleString('en-AE', {maximumFractionDigits:0}) : ''}</div>
            <div style="font-size:9px;font-weight:600;text-align:right;color:${availColor};">${availText}</div>
          </div>`;
          }).join('')}
        </div>
      </div>` : ''}
```

- [ ] **Step 3: Build and verify**

Run:
```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds.

- [ ] **Step 4: Run pre-deploy check**

Run:
```bash
npm run check 2>&1
```

Expected: all checks pass. Note the project-detail chunk size. If it exceeds 23KB, add a note to `DECISIONS.md`.

- [ ] **Step 5: Commit**

```bash
git add js/project-detail.js
git commit -m "feat: replace flat unit cards with row cards (type/size/price/availability)"
```

---

## Success Criteria

- [ ] `grep -n "NETLIFY_IMG" js/project-detail.js` returns no output
- [ ] Stats bar visible below hero when ≥2 data cells available; standalone price div and specs row removed
- [ ] Payment milestone timeline renders below summary tiles when `paymentMilestones` is non-empty
- [ ] Unit rows show 4-column grid with type / size / price / availability
- [ ] `npm run check` passes with no new errors
