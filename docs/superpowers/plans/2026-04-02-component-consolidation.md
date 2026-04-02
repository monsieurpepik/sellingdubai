# Component Consolidation Sprint — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all property card HTML into a single `js/components.js` module; add full accessibility (visually-hidden "View details" links with `aria-label`, dynamic alt tags, aria-labels on action buttons).

**Architecture:** `optimizeImg` moves to `utils.js` so `components.js` can import from a single utility file with no circular deps. `components.js` exports three pure template functions. `properties.js` re-exports `optimizeImg` for backward compat and replaces its own renderers with imports. `dashboard.js` (a classic IIFE) receives `renderAdminCard` via a tiny bridge `<script type="module">` in `dashboard.html` that sets `window.renderAdminCard`.

**Tech Stack:** Vanilla ES modules, esbuild (entry: `js/init.js` only — `dashboard.js` is served as a plain `defer` script and is NOT in the esbuild graph).

---

## File Map

| Action | File | Change |
|--------|------|--------|
| Modify | `js/utils.js` | Add `optimizeImg` export |
| Create | `js/components.js` | New — exports `renderPropertyCard`, `renderOffPlanCard`, `renderAdminCard` |
| Modify | `js/properties.js` | Remove 3 render fn implementations; import from `components.js`; re-export `optimizeImg` |
| Modify | `js/dashboard.js` | Replace inline card template in `renderPropertyCards` with `window.renderAdminCard(...)` |
| Modify | `dashboard.html` | Add bridge `<script type="module">` before `dashboard.js` |
| Modify | `css/properties.css` | Add `.prop-view-link` SR-only CSS |
| Modify | `js/test-modules.html` | Add smoke tests for `components.js` and updated `utils.js` |

---

## Task 1: Add `optimizeImg` to `utils.js`

**Files:**
- Modify: `js/utils.js`
- Modify: `js/test-modules.html` (add test first)

- [ ] **Step 1: Add the failing test to `js/test-modules.html`**

Open `js/test-modules.html`. Find the utils.js test block (around line 26–36). Add these two lines inside it, after the existing `getAgentSlug` check:

```js
log('  optimizeImg: ' + (typeof utils.optimizeImg === 'function' ? 'OK' : 'MISSING'));
log('  optimizeImg CDN: ' + (utils.optimizeImg('https://pjyorgedaxevxophpfib.supabase.co/img.jpg', 400).includes('/.netlify/images') ? 'OK' : 'FAIL'));
```

Also update the final `log('ALL 12 MODULES PASSED')` line to reflect the count will grow:
```js
log('\n=============================');
log('ALL MODULES PASSED');
```

- [ ] **Step 2: Open `js/test-modules.html` in a browser to verify `optimizeImg` shows MISSING**

Open `http://localhost:8888/js/test-modules.html` (requires `npm run dev` running). Confirm output includes:
```
  optimizeImg: MISSING
```

- [ ] **Step 3: Add `optimizeImg` to `js/utils.js`**

Append to the bottom of `js/utils.js`, before the closing line:

```js
// Netlify Image CDN — WebP, max width, quality 80
// Unsplash URLs are not allowlisted — served directly
export function optimizeImg(url, w = 800) {
  if (!url) return '';
  if (url.includes('images.unsplash.com')) return url;
  return `/.netlify/images?url=${encodeURIComponent(url)}&w=${w}&q=80&fm=webp`;
}
```

- [ ] **Step 4: Reload test page and verify test passes**

Reload `http://localhost:8888/js/test-modules.html`. Confirm:
```
  optimizeImg: OK
  optimizeImg CDN: OK
```

- [ ] **Step 5: Commit**

```bash
cd /Users/bobanpepic/Desktop/sellingdubai-app
git add js/utils.js js/test-modules.html
git commit -m "feat: move optimizeImg to utils.js, add smoke test"
```

---

## Task 2: Create `js/components.js` (with failing test first)

**Files:**
- Create: `js/components.js`
- Modify: `js/test-modules.html`

- [ ] **Step 1: Add failing test for `components.js` to `js/test-modules.html`**

Find the end of the test block (before `log('ALL MODULES PASSED')`). Insert:

```js
      // Test components.js
      const components = await import('./components.js');
      log('\n✓ components.js loaded');
      log('  renderPropertyCard: ' + (typeof components.renderPropertyCard === 'function' ? 'OK' : 'MISSING'));
      log('  renderOffPlanCard: ' + (typeof components.renderOffPlanCard === 'function' ? 'OK' : 'MISSING'));
      log('  renderAdminCard: ' + (typeof components.renderAdminCard === 'function' ? 'OK' : 'MISSING'));
      // renderPropertyCard output checks
      const card = components.renderPropertyCard({ id: 'c1', title: 'Palm Villa', price: 'AED 5,000,000', bedrooms: 4, bathrooms: 3, area_sqft: 3200, property_type: 'Villa', location: 'Palm Jumeirah', status: 'available' }, 0);
      log('  renderPropertyCard has prop-card: ' + (card.includes('prop-card') ? 'OK' : 'FAIL'));
      log('  renderPropertyCard has View details link: ' + (card.includes('prop-view-link') ? 'OK' : 'FAIL'));
      log('  renderPropertyCard aria-label: ' + (card.includes('View details for Palm Villa') ? 'OK' : 'FAIL'));
      log('  renderPropertyCard alt tag: ' + (card.includes('alt="Palm Villa"') ? 'OK' : 'FAIL'));
      // renderAdminCard output checks
      const STATUS_LABELS = { available: 'Available', just_listed: 'Just Listed', sold: 'Sold', rented: 'Rented', under_offer: 'Under Offer', just_sold: 'Just Sold', open_house: 'Open House' };
      const adminCard = components.renderAdminCard({ id: 'a1', title: 'Marina Apt', price: '2,500,000', status: 'available', bedrooms: 2, property_type: 'Apartment', location: 'Dubai Marina', image_url: null }, 0, 1, STATUS_LABELS);
      log('  renderAdminCard has prop-card: ' + (adminCard.includes('prop-card') ? 'OK' : 'FAIL'));
      log('  renderAdminCard Edit aria-label: ' + (adminCard.includes('aria-label="Edit Marina Apt"') ? 'OK' : 'FAIL'));
      log('  renderAdminCard Delete aria-label: ' + (adminCard.includes('aria-label="Delete Marina Apt"') ? 'OK' : 'FAIL'));
```

- [ ] **Step 2: Reload test page — verify `components.js` shows error (file not found)**

Reload `http://localhost:8888/js/test-modules.html`. Expect the catch block to fire with a module load error referencing `components.js`.

- [ ] **Step 3: Create `js/components.js`**

Create the file with the exact content below. This file imports only from `./utils.js`.

```js
// ==========================================
// SHARED PROPERTY CARD COMPONENTS
// Pure template functions — no DOM, no state, no network.
// Imported by properties.js (ES module chain via init.js)
// and exposed to dashboard.js via a window bridge in dashboard.html.
// ==========================================
import { escHtml, escAttr, optimizeImg } from './utils.js';

// ==========================================
// PUBLIC VIEWER CARD
// Used on: index.html (agent public profile)
// ==========================================
export function renderPropertyCard(p, idx) {
  const STATUS_MAP = {
    'just_listed': { label: 'Just Listed', css: 'prop-tag-just-listed' },
    'available':   { label: 'Available',   css: 'prop-tag-available' },
    'open_house':  { label: 'Open House',  css: 'prop-tag-open-house' },
    'under_offer': { label: 'Under Offer', css: 'prop-tag-under-offer' },
    'just_sold':   { label: 'Just Sold',   css: 'prop-tag-just-sold' },
    'sold':        { label: 'Sold',        css: 'prop-tag-sold' },
    'rented':      { label: 'Rented',      css: 'prop-tag-rented' },
  };

  const st = STATUS_MAP[p.status] || STATUS_MAP['available'];
  const safeTitle = escAttr(p.title);
  const propId = escAttr(String(p.id || idx));

  const extras = p.additional_photos || [];
  const allImages = p.image_url ? [p.image_url, ...extras.slice(0, 4)] : [];
  let imgSection = '';

  const heartBtn = `<button class="prop-heart" onclick="event.stopPropagation();toggleHeart(this)" aria-label="Save property"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg></button>`;

  if (allImages.length > 1) {
    const slides = allImages.map((url, i) =>
      `<img src="${escAttr(optimizeImg(url))}" alt="${safeTitle}" width="800" height="450" loading="${i === 0 ? 'eager' : 'lazy'}" onload="this.classList.add('loaded')" onerror="handleImgError(this)">`
    ).join('');
    const dots = allImages.map((_, i) =>
      `<div class="prop-carousel-dot${i === 0 ? ' active' : ''}" data-idx="${i}"></div>`
    ).join('');
    imgSection = `<div class="prop-carousel" data-card-id="${propId}">
      <div class="prop-carousel-track">${slides}</div>
      <div class="prop-carousel-dots">${dots}</div>
      <button class="prop-carousel-nav prev" onclick="event.stopPropagation();slideCarousel('${propId}',-1)" aria-label="Previous photo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg></button>
      <button class="prop-carousel-nav next" onclick="event.stopPropagation();slideCarousel('${propId}',1)" aria-label="Next photo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg></button>
      ${heartBtn}
      <span class="prop-status ${st.css}">${escHtml(st.label)}</span>
    </div>`;
  } else if (allImages.length === 1) {
    imgSection = `<div class="prop-img-wrap">
      <img class="prop-img" src="${escAttr(optimizeImg(allImages[0]))}" alt="${safeTitle}" width="800" height="450" loading="${idx === 0 ? 'eager' : 'lazy'}" onload="this.classList.add('loaded')" onerror="handleImgError(this)">
      ${heartBtn}
      <span class="prop-status ${st.css}">${escHtml(st.label)}</span>
    </div>`;
  } else {
    imgSection = `<div class="prop-img-wrap">
      <div class="prop-img-placeholder"><svg width="40" height="40" viewBox="0 0 24 24" fill="rgba(255,255,255,0.08)"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg></div>
      ${heartBtn}
      <span class="prop-status ${st.css}">${escHtml(st.label)}</span>
    </div>`;
  }

  const locationText = p.location ? escHtml(p.location.split(',')[0]) : '\u00A0';
  const locationHtml = `<div class="prop-location">${p.location ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>' : ''}${locationText}</div>`;

  const titleHtml = `<div class="prop-title">${p.title ? escHtml(p.title) : '\u00A0'}</div>`;

  let priceHtml = '';
  if (p.price) {
    const priceStr = escHtml(p.price);
    const hasAED = /AED/i.test(priceStr);
    if (hasAED) {
      const cleanVal = priceStr.replace(/AED\s*/i, '').trim();
      priceHtml = `<div class="prop-price"><span class="prop-price-currency">AED</span><span class="prop-price-value">${cleanVal}</span></div>`;
    } else {
      priceHtml = `<div class="prop-price"><span class="prop-price-value">${priceStr}</span></div>`;
    }
  } else {
    priceHtml = `<div class="prop-price"><span class="prop-price-value">\u00A0</span></div>`;
  }

  const specParts = [];
  if (p.bedrooms) specParts.push(`${p.bedrooms} Bed${p.bedrooms > 1 ? 's' : ''}`);
  if (p.bathrooms) specParts.push(`${p.bathrooms} Bath${p.bathrooms > 1 ? 's' : ''}`);
  if (p.area_sqft) specParts.push(`${p.area_sqft.toLocaleString()} sqft`);
  if (p.property_type) specParts.push(escHtml(p.property_type));
  const specsHtml = `<div class="prop-specs-inline">${specParts.length > 0 ? specParts.join('<span class="spec-dot">·</span>') : '\u00A0'}</div>`;

  const features = p.features || [];
  const featurePillsHtml = features.length > 0
    ? `<div class="prop-card-features">${features.slice(0, 6).map(f => `<span class="prop-card-pill">${escHtml(f)}</span>`).join('')}${features.length > 6 ? `<span class="prop-card-pill prop-card-pill-more">+${features.length - 6}</span>` : ''}</div>`
    : '';
  const descPreview = p.description
    ? `<div class="prop-card-desc">${escHtml(p.description.substring(0, 120))}${p.description.length > 120 ? '...' : ''}</div>`
    : '';

  // Visually-hidden link for screen readers and keyboard navigation
  const viewLink = `<a class="prop-view-link" href="#" onclick="event.preventDefault();openPropertyById('${propId}')" aria-label="View details for ${safeTitle}">View details</a>`;

  return `<div class="prop-card" data-title="${safeTitle}" data-id="${propId}" onclick="openPropertyById('${propId}')">
    ${imgSection}
    <div class="prop-body">
      ${locationHtml}
      ${titleHtml}
      ${priceHtml}
      ${specsHtml}
      ${featurePillsHtml}
      ${descPreview}
      ${viewLink}
    </div>
  </div>`;
}

// ==========================================
// OFF-PLAN / NEW LAUNCH CAROUSEL CARD
// Used on: index.html (agent public profile, off-plan section)
// ==========================================
export function renderOffPlanCard(p) {
  const propId = escAttr(String(p.id));
  const safeTitle = escAttr(p.title);
  const isLaunch = p.listing_type === 'new_launch';
  const typeLabel = isLaunch ? 'NEW LAUNCH' : 'OFF PLAN';
  const typeClass = isLaunch ? 'offplan-badge-launch' : 'offplan-badge-offplan';

  let priceHtml = '';
  if (p.price) {
    const priceStr = escHtml(p.price);
    priceHtml = `<div class="offplan-price"><span class="offplan-price-label">Starting from</span><span class="offplan-price-value">${priceStr}</span></div>`;
  }

  const imgSrc = p.image_url
    ? `<img class="offplan-img" src="${escAttr(optimizeImg(p.image_url))}" alt="${safeTitle}" width="800" height="500" loading="lazy" onerror="handleImgError(this)">`
    : `<div class="offplan-img-placeholder"><svg width="32" height="32" viewBox="0 0 24 24" fill="rgba(255,255,255,0.08)"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg></div>`;

  const locationText = p.location ? escHtml(p.location.split(',')[0]) : '';
  const developer = p.developer ? escHtml(p.developer) : '';
  const handover = p.handover_date ? escHtml(p.handover_date) : '';
  const paymentPlan = p.payment_plan ? escHtml(p.payment_plan) : '';

  let metaHtml = '';
  if (paymentPlan || handover) {
    metaHtml = '<div class="offplan-meta">';
    if (paymentPlan) metaHtml += `<span class="offplan-pill"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M19 14V6c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zm-9-1c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm13-6v11c0 1.1-.9 2-2 2H4v-2h17V7h2z"/></svg>${paymentPlan} Plan</span>`;
    if (handover) metaHtml += `<span class="offplan-pill"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/></svg>${handover}</span>`;
    metaHtml += '</div>';
  }

  // Visually-hidden link for screen readers and keyboard navigation
  const viewLink = `<a class="prop-view-link" href="#" onclick="event.preventDefault();openPropertyById('${propId}')" aria-label="View details for ${safeTitle}">View details</a>`;

  return `<div class="offplan-card" data-id="${propId}" onclick="openPropertyById('${propId}')">
    <div class="offplan-img-wrap">
      ${imgSrc}
      <span class="offplan-badge ${typeClass}">${typeLabel}</span>
    </div>
    <div class="offplan-body">
      ${developer ? `<div class="offplan-developer">${developer}</div>` : ''}
      <div class="offplan-title">${escHtml(p.title)}</div>
      ${locationText ? `<div class="offplan-location"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>${locationText}</div>` : ''}
      ${priceHtml}
      ${metaHtml}
      ${viewLink}
    </div>
  </div>`;
}

// ==========================================
// ADMIN MANAGEMENT CARD
// Used on: dashboard.html (agent's own listing manager)
// Exposed to dashboard.js (classic IIFE) via window.renderAdminCard bridge in dashboard.html.
// Parameters:
//   p            — property object from manage-properties edge fn
//   idx          — 0-based index in the array (for first/last detection)
//   total        — total array length (for first/last detection)
//   statusLabels — PROP_STATUS_LABELS map from dashboard.js
// ==========================================
export function renderAdminCard(p, idx, total, statusLabels) {
  const safeTitle = escHtml(p.title || '');
  const safeId = escAttr(String(p.id));
  const status = p.status || 'available';
  const statusLabel = statusLabels[status] || status;
  const isFirst = idx === 0;
  const isLast = idx === total - 1;

  const thumbHtml = p.image_url
    ? `<img class="prop-thumb" src="${escAttr(optimizeImg(p.image_url, 200))}" alt="${escAttr(p.title || '')}">`
    : '<div class="prop-thumb-placeholder">🏠</div>';

  const metaParts = [];
  if (p.bedrooms != null) metaParts.push(p.bedrooms + ' bed');
  if (p.property_type) metaParts.push(escHtml(p.property_type));
  if (p.location) metaParts.push(escHtml(p.location));
  const metaHtml = metaParts.join(' · ');

  const statusOptions = Object.entries(statusLabels)
    .map(([v, l]) => `<option value="${escAttr(v)}"${v === status ? ' selected' : ''}>${escHtml(l)}</option>`)
    .join('');

  return `<div class="prop-card">` +
    `<div class="prop-reorder">` +
      `<button class="prop-arrow-btn" onclick="reorderProp('${safeId}', -1)"${isFirst ? ' disabled' : ''} title="Move up" aria-label="Move ${safeTitle} up">▲</button>` +
      `<button class="prop-arrow-btn" onclick="reorderProp('${safeId}', 1)"${isLast ? ' disabled' : ''} title="Move down" aria-label="Move ${safeTitle} down">▼</button>` +
    `</div>` +
    thumbHtml +
    `<div class="prop-body">` +
      `<div class="prop-title-text">${safeTitle}</div>` +
      (p.price ? `<div class="prop-meta">AED ${escHtml(p.price)}${metaHtml ? ' · ' + metaHtml : ''}</div>` : (metaHtml ? `<div class="prop-meta">${metaHtml}</div>` : '')) +
      `<div class="prop-actions">` +
        (p.is_active ? '<span class="prop-badge prop-badge-live">Live</span>' : '<span class="prop-badge prop-badge-hidden">Hidden · Add DLD Permit to publish</span>') +
        `<span class="prop-badge prop-badge-${escAttr(status)}">${escHtml(statusLabel)}</span>` +
        `<select class="prop-status-select prop-status-${escAttr(status)}" onchange="updatePropStatus('${safeId}', this.value, this)">${statusOptions}</select>` +
        `<button class="prop-share-btn" onclick="shareProperty('${safeId}')" aria-label="Share ${safeTitle}">Share</button>` +
        `<button class="prop-edit-btn" onclick="openPropModal('${safeId}')" aria-label="Edit ${safeTitle}">Edit</button>` +
        `<button class="prop-delete-btn" onclick="deletePropertyConfirm('${safeId}')" aria-label="Delete ${safeTitle}">Delete</button>` +
      `</div>` +
    `</div>` +
  `</div>`;
}
```

- [ ] **Step 4: Reload test page and verify all `components.js` tests pass**

Reload `http://localhost:8888/js/test-modules.html`. Confirm:
```
✓ components.js loaded
  renderPropertyCard: OK
  renderOffPlanCard: OK
  renderAdminCard: OK
  renderPropertyCard has prop-card: OK
  renderPropertyCard has View details link: OK
  renderPropertyCard aria-label: OK
  renderPropertyCard alt tag: OK
  renderAdminCard has prop-card: OK
  renderAdminCard Edit aria-label: OK
  renderAdminCard Delete aria-label: OK
```

- [ ] **Step 5: Commit**

```bash
cd /Users/bobanpepic/Desktop/sellingdubai-app
git add js/components.js js/test-modules.html
git commit -m "feat: create js/components.js with all three property card renderers + accessibility"
```

---

## Task 3: Update `properties.js` to import from `components.js`

**Files:**
- Modify: `js/properties.js`

- [ ] **Step 1: Replace the import line at the top of `properties.js`**

Current top of `js/properties.js`:
```js
import { DEMO_MODE, supabase } from './config.js';
import { escHtml, escAttr } from './utils.js';
import { allProperties, currentFilters } from './state.js';
```

Replace with:
```js
import { DEMO_MODE, supabase } from './config.js';
import { escHtml, escAttr, optimizeImg as _optimizeImg } from './utils.js';
import { allProperties, currentFilters } from './state.js';
import { renderPropertyCard, renderOffPlanCard } from './components.js';
```

- [ ] **Step 2: Remove the `optimizeImg` implementation and replace with a re-export**

Find and remove this block (lines 9–13):
```js
// Netlify Image CDN — WebP, max width, quality 80
export function optimizeImg(url, w = 800) {
  if (!url) return '';
  // Unsplash URLs are not in the Netlify Image CDN allowlist — serve directly
  if (url.includes('images.unsplash.com')) return url;
  return `/.netlify/images?url=${encodeURIComponent(url)}&w=${w}&q=80&fm=webp`;
}
```

Replace with a single re-export line (keeps `agent-page.js` working without any import changes):
```js
// Re-export for consumers that import optimizeImg from this module (e.g. agent-page.js)
export { _optimizeImg as optimizeImg };
```

Also update the `_optimizeImg` import alias at the top to use it for the internal `renderRemProjectCard` function (which calls `optimizeImg` internally in the rest of the file):

After the re-export line, add:
```js
const optimizeImg = _optimizeImg;
```

- [ ] **Step 3: Remove `renderPropertyCard` and `renderOffPlanCard` implementations**

Delete the entire `renderPropertyCard` function (the block from `// RENDER PROPERTY CARD` comment through its closing `}` — lines 115–208 in the original).

Delete the entire `renderOffPlanCard` function (lines 250–298 in the original).

The exported names are now provided by the `import` added in Step 1, so the exports are preserved. Verify the file still has `export function renderPropertyList` and `export { renderPropertyCard, renderOffPlanCard }` (they come from the import statement).

- [ ] **Step 4: Reload test page to verify `properties.js` still passes all existing tests**

Reload `http://localhost:8888/js/test-modules.html`. Confirm the `properties.js` section still shows:
```
✓ properties.js loaded
  loadProperties: OK
  renderPropertyCard: OK
  renderOffPlanCard: OK
  renderPropertyList: OK
  renderSkeletonCards: OK
  initOffPlanCarousel: OK
  STATUS_MAP: OK
```

- [ ] **Step 5: Commit**

```bash
cd /Users/bobanpepic/Desktop/sellingdubai-app
git add js/properties.js
git commit -m "refactor: properties.js delegates card rendering to components.js"
```

---

## Task 4: Add `.prop-view-link` SR-only CSS

**Files:**
- Modify: `css/properties.css`

- [ ] **Step 1: Append to `css/properties.css`**

Open `css/properties.css` and append at the end of the file:

```css
/* Visually-hidden "View details" link — keyboard/screen-reader target inside each card */
.prop-view-link {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/bobanpepic/Desktop/sellingdubai-app
git add css/properties.css
git commit -m "a11y: add .prop-view-link SR-only style for property cards"
```

---

## Task 5: Wire `renderAdminCard` into `dashboard.html` and `dashboard.js`

**Files:**
- Modify: `dashboard.html`
- Modify: `js/dashboard.js`

- [ ] **Step 1: Add the bridge module script to `dashboard.html`**

Open `dashboard.html`. Find these two lines near the bottom of `<body>` (around line 417–418):
```html
<script src="/js/sd-config.js" defer></script>
<script src="/js/dashboard.js" defer></script>
```

Insert a new `<script type="module">` block BETWEEN them:
```html
<script src="/js/sd-config.js" defer></script>
<script type="module">
  import { renderAdminCard } from '/js/components.js';
  window.renderAdminCard = renderAdminCard;
</script>
<script src="/js/dashboard.js" defer></script>
```

This works because `<script type="module">` has implicit `defer` semantics and executes in document order — so `window.renderAdminCard` is set before the IIFE in `dashboard.js` runs.

- [ ] **Step 2: Replace the inline card template in `dashboard.js`**

Open `js/dashboard.js`. Find the `renderPropertyCards` function (around line 604). The `container.innerHTML = props.map((p, idx) => { ... return '<div class="prop-card">...' }).join('');` block currently contains ~22 lines of string concatenation.

Replace the entire `container.innerHTML = props.map((p, idx) => { ... }).join('');` block with:

```js
    container.innerHTML = props.map((p, idx) => window.renderAdminCard(p, idx, props.length, PROP_STATUS_LABELS)).join('');
```

The full updated `renderPropertyCards` function should look like:

```js
  function renderPropertyCards(props, limit, tier) {
    const badge = document.getElementById('props-count-badge');
    const limitNote = document.getElementById('props-limit-note');
    const limitLabel = limit === null ? '∞' : limit;
    badge.textContent = props.length + ' / ' + limitLabel;

    if (propLimitReached) {
      limitNote.innerHTML = 'Listing limit reached (' + limit + '). <a href="/pricing" style="color:#fff;font-weight:600;text-decoration:underline;">Upgrade to Pro or Premium</a> to add more.';
      limitNote.style.display = 'block';
    } else {
      limitNote.style.display = 'none';
    }

    const container = document.getElementById('props-list');
    if (!props.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">🏠</div><div class="empty-title">No listings yet</div><div class="empty-sub">Add a property \u2014 it\'s the #1 reason clients tap WhatsApp</div></div>';
      return;
    }

    container.innerHTML = props.map((p, idx) => window.renderAdminCard(p, idx, props.length, PROP_STATUS_LABELS)).join('');
  }
```

- [ ] **Step 3: Verify `updatePropStatus` still finds `.prop-card` and `.prop-badge`**

In `dashboard.js` search for `selectEl.closest('.prop-card')` (around line 871). This DOM query works on the rendered output of `renderAdminCard` — confirm the output HTML still contains `class="prop-card"` (it does, as written in Task 2 Step 3).

No code change needed. Just confirm visually.

- [ ] **Step 4: Commit**

```bash
cd /Users/bobanpepic/Desktop/sellingdubai-app
git add dashboard.html js/dashboard.js
git commit -m "refactor: dashboard.js uses renderAdminCard from components.js via window bridge"
```

---

## Task 6: Run build and verify bundle size

**Files:** None modified — verification only.

- [ ] **Step 1: Run the build**

```bash
cd /Users/bobanpepic/Desktop/sellingdubai-app
npm run build
```

Expected: build completes with no errors.

- [ ] **Step 2: Check `init.bundle.js` size stays under 30KB**

```bash
wc -c dist/init.bundle.js
```

Expected: output is under 30720 (30KB). Since this is a pure code move (no new bytes, just reorganization), the bundle size should be equal to or smaller than before. If it exceeds 30KB, something went wrong — check for accidental duplication.

- [ ] **Step 3: Run pre-deploy check**

```bash
npm run check
```

Expected: all checks pass. If a check fails, read the error message and fix before proceeding.

- [ ] **Step 4: Commit if any build artifacts changed**

```bash
cd /Users/bobanpepic/Desktop/sellingdubai-app
git add dist/
git commit -m "build: rebuild after component consolidation"
```

---

## Task 7: Final smoke test in browser

- [ ] **Step 1: Start dev server if not running**

```bash
npm run dev
```

- [ ] **Step 2: Run module smoke tests**

Open `http://localhost:8888/js/test-modules.html`. Confirm output ends with all OK lines and no FAIL entries.

- [ ] **Step 3: Verify public card on index.html**

Open `http://localhost:8888` (or any agent profile URL). Open DevTools → Elements. Inspect a property card. Confirm:
- `<a class="prop-view-link" aria-label="View details for [title]">` exists inside `.prop-body`
- `<img>` tags have `alt="[property title]"` (not empty)
- Carousel nav buttons have `aria-label="Previous photo"` / `aria-label="Next photo"`

- [ ] **Step 4: Verify admin card on dashboard.html**

Log into `http://localhost:8888/dashboard.html`. Open DevTools → Elements. Inspect a property card in the listings section. Confirm:
- Edit button has `aria-label="Edit [title]"`
- Delete button has `aria-label="Delete [title]"`
- Share button has `aria-label="Share [title]"`
- Thumbnail `<img>` has `alt="[property title]"` (not empty `""`)

- [ ] **Step 5: Run Lighthouse accessibility audit**

In Chrome DevTools → Lighthouse tab → select Accessibility → Analyze page load on the agent profile page. Target score: 95+.
