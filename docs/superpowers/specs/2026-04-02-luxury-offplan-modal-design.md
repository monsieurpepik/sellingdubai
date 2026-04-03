# Luxury Off-Plan Modal Design

## Goal

Upgrade `js/project-detail.js` to display all available REM JSONB data with a clean, information-dense layout. No layout change — same vertical scrolling modal — but three new UI components replace or extend existing sections, and the image pipeline is fixed.

## Design Decisions

- **No gold accents** — white-on-dark hierarchy only. `rgba(255,255,255,0.x)` opacity scale for label vs value contrast.
- **Current layout preserved** — hero image, vertical scroll, sticky CTA bar at bottom. No structural rearrangement.
- **Three targeted upgrades:** stats bar, payment milestone timeline, unit row cards.
- **Image fix:** replace local `NETLIFY_IMG` with imported `optimizeImg` from `utils.js`.

---

## Part 1: Stats Bar

**What:** A 4-cell horizontal bar inserted directly below the hero image gallery (before the status badge + title block). No scroll required to see key investment numbers.

**Cells (left to right):**
| Label | Value | Source field |
|---|---|---|
| From | `AED X.XM` formatted | `project.min_price` via `fmtPrice()` |
| Handover | `MMM YYYY` | `project.completion_date` |
| Size from | `NNN sqft` | `project.min_area_sqft` |
| Pay plan | `10/60/30` | `bookingPct`/`constructionPct`/`handoverPct` |

**Rendering rules:**
- Only render the bar if at least 2 cells have data (avoid a near-empty bar).
- Each cell: label in `rgba(255,255,255,0.35)` at 10px, value in `#fff` at 13px font-weight 700.
- Cells separated by `1px solid rgba(255,255,255,0.06)` vertical dividers.
- Bar has `border-bottom: 1px solid rgba(255,255,255,0.06)`.
- Pay plan cell shows `${bookingPct}/${constructionPct}/${handoverPct}` — omit any null segment.
- Handover cell: format as `new Date(project.completion_date).toLocaleDateString('en-AE', { month: 'short', year: 'numeric' })`.
- Remove the standalone price `<div>` and the "Specs row" (Unit Types / Beds / Area / Completion flex-wrap) — that data is now in the stats bar or in the unit rows below.

**HTML structure:**
```html
<div style="display:grid;grid-template-columns:repeat(N,1fr);border-bottom:1px solid rgba(255,255,255,0.06);">
  <div style="padding:10px 12px;border-right:1px solid rgba(255,255,255,0.06);">
    <div style="font-size:10px;color:rgba(255,255,255,0.35);margin-bottom:3px;">From</div>
    <div style="font-size:13px;font-weight:700;">AED 2.1M</div>
  </div>
  <!-- repeat for each cell with data -->
</div>
```
N = number of cells that have data (1–4). Use `grid-template-columns: repeat(${cellCount}, 1fr)`.

---

## Part 2: Payment Milestone Timeline

**What:** Below the existing 3 summary tiles (Booking / Construction / Handover %), add an always-visible vertical dot-and-line timeline listing every milestone from `paymentMilestones`.

**Only rendered when:** `paymentMilestones` is a non-empty array (from `ppPlan.milestones`).

**Structure per milestone row:**
- Left: 8px dot on a 1px vertical line. First dot: `background: rgba(255,255,255,0.9)`. Remaining dots: `background: rgba(255,255,255,0.2)`.
- Right of dot: milestone label (e.g. "On Booking", "On 30% Construction") in `rgba(255,255,255,0.55)` at 11px.
- Far right: percentage value in `#fff` font-weight 700 at 12px.

**Milestone data shape** (from REM sync, stored in `ppPlan.milestones`):
```json
{ "name": "On Booking", "percentage": "5%" }
```
Percentage may be a string like `"5%"` — strip `%` and display as-is.

**HTML structure:**
```html
<div style="margin-top:12px;position:relative;padding-left:20px;">
  <div style="position:absolute;left:6px;top:4px;bottom:4px;width:1px;background:rgba(255,255,255,0.08);"></div>
  ${paymentMilestones.map((m, i) => `
  <div style="position:relative;margin-bottom:8px;">
    <div style="position:absolute;left:-17px;top:3px;width:8px;height:8px;border-radius:50%;background:${i===0?'rgba(255,255,255,0.9)':'rgba(255,255,255,0.2)'};"></div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;">
      <span style="font-size:11px;color:rgba(255,255,255,0.55);">${escHtml(m.name)}</span>
      <span style="font-size:12px;font-weight:700;">${escHtml(String(m.percentage))}</span>
    </div>
  </div>`).join('')}
</div>
```

---

## Part 3: Unit Row Cards

**What:** Replace the current flat unit cards (type label + price on one line, sqft below) with structured row cards that show type / size / price / availability in a scannable grid.

**Only rendered when:** `units.length > 0` (same condition as today).

**Row card structure:**
- Header row (labels only, `rgba(255,255,255,0.25)` at 9px): `Type · Size · From · Avail.`
- One card per unit: `background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:8px 10px;`
- 4-column grid: `grid-template-columns: 1fr 1fr 1fr 52px`
- **Type**: `u.bedroom ? u.bedroom + ' BR' : u.property_types` — font-weight 700, 11px
- **Size**: `u.lowest_area` formatted as `NNN sqft` — `rgba(255,255,255,0.5)` at 10px; omit if null
- **From**: `AED X.XM` via `fmtPrice(u.lowest_price || u.price || u.min_price)` — font-weight 600, 11px; omit if null
- **Availability**: `u.available_units_count` if present:
  - `> 5`: green `#4ade80`, text e.g. `12 left`
  - `> 0 && <= 5`: amber `#f59e0b`, text e.g. `3 left`
  - `=== 0`: `rgba(255,255,255,0.3)`, text `Sold out`
  - null/undefined: omit cell (render empty)
- Text size for availability: 9px, font-weight 600, text-align right

**HTML structure:**
```html
<div style="margin-bottom:20px;">
  <h3 style="font-size:14px;font-weight:700;margin-bottom:10px;">Available Units</h3>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr 52px;gap:2px;padding:0 2px 6px;font-size:9px;color:rgba(255,255,255,0.25);">
    <span>Type</span><span>Size</span><span>From</span><span style="text-align:right;">Avail.</span>
  </div>
  <div style="display:flex;flex-direction:column;gap:4px;">
    ${units.map(u => /* row card */ '').join('')}
  </div>
</div>
```

---

## Part 4: Image Pipeline Fix

**What:** Remove the local `NETLIFY_IMG` function and import `optimizeImg` from `./utils.js` instead. Same URL transform, same signature — pure replacement.

**Change:**
- Remove: `const NETLIFY_IMG = (url, w) => url ? \`/.netlify/images?url=...\` : '';`
- Add to imports: `import { supabase } from './config.js'; import { escHtml, escAttr, optimizeImg } from './utils.js';`
- Replace all 6 call sites: `NETLIFY_IMG(x, w)` → `optimizeImg(x, w)`

Call sites in the file:
1. `_lbRender()` — `NETLIFY_IMG(_lbImgs[_lbIdx], 1200)`
2. `_injectProjectSchema` — `NETLIFY_IMG(project.cover_image_url, 800)`
3. Hero image src — `NETLIFY_IMG(project.cover_image_url, 800)`
4. Gallery images map — `NETLIFY_IMG(u, 800)`
5. Developer logo — `NETLIFY_IMG(dev.logo_url, 80)`
6. Site plan images — `NETLIFY_IMG(u, 800)`

---

## What Is Not Changing

- Lightbox (full-screen, pinch-zoom, swipe)
- Amenities grid (2-column icon + label cards, keep as-is)
- Nearby locations list
- Description with "Read more" collapse
- Brochure download gate
- Sticky CTA bar (Enquire / Mortgage / WhatsApp)
- DLD async section (appended after sheet.innerHTML — not touched)
- JSON-LD schema injection
- `sanitizeHtml` function
- `facilityIcon` mapping
- Gallery scroll counter

---

## Files Changed

| File | Change |
|---|---|
| `js/project-detail.js` | Stats bar, payment milestone timeline, unit row cards, NETLIFY_IMG → optimizeImg |

No other files. No CSS file changes — all styles are inline in the HTML template strings (existing pattern).

---

## Chunk Size Impact

Current `project-detail` chunk: ~21.6KB (documented in DECISIONS.md as accepted overage).

Expected delta: +0.8–1.2KB for the three new UI sections minus the removed specs-row and price div. Update DECISIONS.md if the chunk exceeds 23KB after build.

---

## Success Criteria

- Stats bar visible immediately below hero (no scroll) when ≥2 data cells available
- Payment milestone timeline renders all milestones from `ppPlan.milestones` array when present
- Unit rows show type / size / price / availability; availability cell omitted when data absent
- Zero `NETLIFY_IMG` references remain in `project-detail.js`
- `npm run check` passes with no new chunk size violations
