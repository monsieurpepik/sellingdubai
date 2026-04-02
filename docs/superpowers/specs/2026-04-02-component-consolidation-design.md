# Component Consolidation Sprint — Design Spec

**Date:** 2026-04-02
**Goal:** 95+ Lighthouse/accessibility score. Single source of truth for all property card HTML. Full accessibility on all card types.

---

## Context

Property cards are rendered in two places via JavaScript:

| File | Function | Context |
|------|----------|---------|
| `js/properties.js` | `renderPropertyCard(p, idx)` | Public viewer card (index.html) |
| `js/properties.js` | `renderOffPlanCard(p)` | Off-plan carousel card (index.html) |
| `js/dashboard.js` | inline `renderPropertyCards()` closure | Admin management card (dashboard.html) |

`agency-dashboard.html` has no property cards (agency metrics + member table only).

No HTML file has hardcoded card markup — all three are already JS-rendered.

---

## Module Graph (after)

```
js/utils.js  ←  js/components.js  ←  js/properties.js
                                   ←  js/dashboard.js
```

`components.js` imports only from `utils.js`. No Supabase, no DOM, no state — pure template functions.

---

## File Changes

### `js/utils.js`
- Add `optimizeImg(url, w)` — moved from `properties.js`
- Export it

### `js/components.js` (new)
Exports three pure functions:

```js
export function renderPropertyCard(p, idx)
export function renderOffPlanCard(p)
export function renderAdminCard(p, idx, total, statusLabels)
```

Imports: `escHtml`, `escAttr`, `optimizeImg` from `./utils.js` only.

### `js/properties.js`
- Remove `renderPropertyCard`, `renderOffPlanCard` — import from `./components.js`
- Remove `optimizeImg` implementation — import from `./utils.js`
- Keep `export { optimizeImg }` re-export for any existing consumer

### `js/dashboard.js`
- Remove inline `renderPropertyCards` closure body
- Import `renderAdminCard` from `./components.js`
- Call `renderAdminCard(p, idx, props.length, PROP_STATUS_LABELS)` per card

---

## Accessibility Changes

### Public viewer card (`renderPropertyCard`)
**Problem:** Entire card is `<div onclick="...">` — not keyboard-navigable, not named for screen readers.

**Fix:** Add a visually-hidden named anchor inside `.prop-body`:
```html
<a class="prop-view-link"
   href="#"
   onclick="event.preventDefault();openPropertyById('${propId}')"
   aria-label="View details for ${p.title}">View details</a>
```

CSS (added to `css/properties.css`):
```css
.prop-view-link {
  position: absolute;
  width: 1px; height: 1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  white-space: nowrap;
}
```

Image alt tags: already `alt="${safeTitle}"` — preserved unchanged.

### Off-plan card (`renderOffPlanCard`)
- Same visually-hidden "View details" link pattern added
- Image alt already `alt="${safeTitle}"` — preserved

### Admin management card (`renderAdminCard`)
- Thumbnail `alt=""` → `alt="${esc(p.title)}"`
- Edit button: add `aria-label="Edit ${p.title}"`
- Delete button: add `aria-label="Delete ${p.title}"`
- Share button: add `aria-label="Share ${p.title}"`
- Reorder buttons already have `aria-label` — preserve as-is

---

## Bundle Impact

`components.js` is a pure code move — no new bytes added to the bundle. It is loaded lazily via the same dynamic `import()` chains that already gate `properties.js` and `dashboard.js`. `init.bundle.js` is unaffected.

---

## What Does NOT Change

- No HTML file changes
- No new `<script>` tags
- No new third-party dependencies
- Card visual design is identical — the accessibility additions are invisible to sighted users
- `renderPropertyList` stays in `properties.js` (orchestration, not rendering)
- All carousel/touch/heart interaction handlers stay in `properties.js`
