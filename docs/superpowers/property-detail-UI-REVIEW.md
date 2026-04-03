# Property Detail Modal -- UI Review

**Audited:** 2026-04-02
**Baseline:** Abstract 6-pillar standards (no UI-SPEC.md exists)
**Screenshots:** Not captured (no dev server detected on ports 3000, 5173, 8080)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Good domain-specific copy; minor empty-state gaps |
| 2. Visuals | 3/4 | Strong hierarchy and gallery; lightbox lacks keyboard nav |
| 3. Color | 2/4 | Brand blue (#1127D2) used on amenity icons breaks white-on-dark constraint |
| 4. Typography | 3/4 | Coherent scale but 9 distinct font sizes is high for one modal |
| 5. Spacing | 2/4 | All inline styles; inconsistent padding values across sections |
| 6. Experience Design | 3/4 | Loading + error + empty states present; no skeleton shimmer or disabled CTA guard |

**Overall: 16/24**

---

## Top 3 Priority Fixes

1. **Amenity icons use brand blue (#1127D2) instead of white-opacity** -- Breaks the established white-on-dark color system; amenity icons are the only non-CTA element with a saturated color -- Change `color:#1127D2` on line 415 of `project-detail.js` to `color:rgba(255,255,255,0.55)` to match the rest of the modal's icon language.

2. **No keyboard navigation or Escape-to-close on the lightbox** -- Users who navigate via keyboard are trapped once the lightbox opens; no `keydown` listener exists for Escape, ArrowLeft, ArrowRight -- Add a `keydown` event listener in `_lbEnsureCreated()` (around line 93) that maps Escape to `closeProjLightbox()`, ArrowLeft to `_lbStep(-1)`, and ArrowRight to `_lbStep(1)`.

3. **9 distinct font sizes creates visual noise** -- The modal uses font-size values of 9px, 10px, 11px, 12px, 13px, 14px, 18px, 22px, and 24px across a single scrollable view -- Consolidate to 5-6 sizes maximum by merging 9px/10px into a single "caption" size (10px) and 12px/13px into a single "body" size (13px).

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

**Strengths:**
- CTA labels are domain-specific and clear: "Enquire", "Mortgage", "WhatsApp" (line 454-456)
- "Get Brochure -- Free" (line 447) is a strong value-driven CTA label
- "Read more" expand pattern on descriptions is appropriate (line 439)
- Error state copy is specific: "Project not found." (line 183) rather than generic "Something went wrong"
- Loading state uses proper ellipsis: "Loading project..." (line 162)
- Empty payment plan state has a helpful fallback: "Contact the agent for full payment plan details." (line 366)

**Minor issues:**
- The "Read more" button has no "Read less" toggle -- once expanded, the user cannot collapse the description
- Unit availability uses terse labels ("5 left", "Sold out") which work well, but "Sold out" units still render as rows with no actionable path (no waitlist or alternative)
- Stats bar labels are abbreviations ("Pay plan") that may not be immediately clear to international users
- No explicit empty state for when `facilities`, `nearbyLocations`, or `sitePlanImgs` arrays are empty -- sections simply do not render, which is acceptable but means sections can vanish silently

### Pillar 2: Visuals (3/4)

**Strengths:**
- Clear visual hierarchy: hero gallery (240px) at top, stats bar, title with badge, then sectioned content
- Horizontal scroll gallery with snap points and slide counter pill (line 306-310)
- Developer card has a clear card treatment with logo, name, and URL (line 332-340)
- Payment plan uses prominent percentage tiles (22px bold) with clear labels (line 347-349)
- Milestone timeline uses a vertical line + dot pattern that reads well (line 352-361)
- Lightbox buttons have proper 44x44px touch targets with aria-labels (line 86, 89, 91)
- Unit availability uses color coding (green/amber/muted) for quick scanning (line 383-387)
- Back button in modal shell has proper z-index layering and blur treatment (CSS line 15-27)

**Issues:**
- The lightbox (`proj-lb`) has no keyboard event handler -- Escape, ArrowLeft, ArrowRight are not bound
- Gallery images lack descriptive alt text beyond "photo 2", "photo 3" etc. (line 308)
- The "Read more" button has no visual indicator (chevron/arrow) that content is truncated
- Icon-only elements (emoji pin "..." on nearby items, line 428) are decorative but not marked `aria-hidden`

### Pillar 3: Color (2/4)

**Color inventory in project-detail.js:**

| Color | Usage | Count |
|-------|-------|-------|
| `rgba(255,255,255,0.xx)` | Labels, borders, backgrounds | ~30 instances |
| `#111` | Gallery background | 1 |
| `#000` | Sticky CTA bar background | 1 |
| `#1127D2` | Amenity icons, Enquire button | 2 |
| `#25d366` / `rgba(37,211,102,x)` | WhatsApp button | 1 |
| `#f59e0b` | Low availability warning | 1 |
| `#4ade80` | Good availability indicator | 1 |

**Issues:**
- **Amenity icons at line 415 use `color:#1127D2`** (brand blue) which is the primary CTA color. Using the same blue on 10+ decorative amenity icons dilutes the CTA hierarchy. The design constraint says "NO gold accents" and "white-on-dark hierarchy only" -- brand blue on non-interactive icons contradicts this intent.
- The WhatsApp button introduces a third distinct accent color (#25d366 green) alongside the brand blue and status amber/green -- this is appropriate for a recognized brand color, but three accent hues in one modal is on the high end.
- Status color coding (#f59e0b amber, #4ade80 green) is hardcoded rather than using CSS custom properties -- makes theme changes difficult.
- The `rgba(255,255,255,0.xx)` opacity scale is well-executed with clear differentiation: 0.25-0.35 for captions, 0.4-0.55 for secondary text, 0.7-0.85 for readable body, 1.0 for headings.

**What works well:**
- Consistent dark background (#000/#111) throughout
- White opacity scale provides clear hierarchy without additional hues
- Border colors consistently use `rgba(255,255,255,0.06-0.12)`

### Pillar 4: Typography (3/4)

**Font sizes in use (9 distinct values):**

| Size | Usage |
|------|-------|
| 9px | Unit table header, availability label |
| 10px | Stats bar labels, unit area |
| 11px | Status badge, developer label, amenity name, payment label, milestone name, unit type |
| 12px | Gallery counter, milestone percentage, description "Read more", nearby distance, empty payment body |
| 13px | Stats bar values, location, description body, nearby name, empty payment title |
| 14px | Section headers (h3), developer name, CTA buttons, brochure button |
| 18px | Emoji fallback for developer logo |
| 22px | Project name (h2), payment percentage values |
| 24px | Lightbox nav arrows |

**Font weights in use (4 values):**
- 600 (semibold): Status badge, developer name, CTA buttons, unit prices, stats bar counter, milestone percentages, brochure button, empty payment title
- 700 (bold): Stats values, section headers, unit types, payment percentages
- 800 (extrabold): Project name only
- No explicit weight (browser default 400): Most body text

**Assessment:**
- Manrope is correctly reserved for display text (project name at 22px/800, payment percentages at 22px/700)
- Inter is correctly used for UI text (CTAs, labels, body)
- 4 font weights is acceptable for a content-dense detail page
- 9 font sizes is high -- the 9px/10px/11px cluster and 12px/13px cluster could each be consolidated to reduce visual noise

### Pillar 5: Spacing (2/4)

**All spacing is inline** -- the entire modal template (lines 303-457) uses zero CSS classes for spacing, relying entirely on `style="..."` attributes. This creates:

**Padding values found:**
- `padding:10px 12px` (stats cells)
- `padding:20px 20px 80px` (detail body)
- `padding:14px 16px` (developer card)
- `padding:12px` (payment tiles)
- `padding:14px 10px` (amenity cards)
- `padding:9px 0` (nearby items)
- `padding:8px 10px` (unit rows)
- `padding:14px` (CTA buttons)
- `padding:4px 10px` (gallery counter)
- `padding:3px 10px` (status badge)
- `padding:12px 16px` (sticky CTA bar)
- `padding:4px 0 0` (Read more button)

**Margin-bottom values:**
- `margin-bottom:3px` (stats label)
- `margin-bottom:4px` (empty payment title)
- `margin-bottom:8px` (milestone items, about heading)
- `margin-bottom:10px` (status badge, unit header, section headers)
- `margin-bottom:12px` (payment heading, amenities heading)
- `margin-bottom:14px` (title block)
- `margin-bottom:20px` (developer card, payment section, units section, site plan, amenities, nearby, description, brochure)

**Assessment:**
- Section margin-bottom is consistently 20px across all content sections -- this is good
- Inner spacing varies significantly (3px, 4px, 8px, 10px, 12px, 14px) without a clear scale
- The lack of CSS classes means every value is a magic number with no reference to design tokens
- Gap values: 2px, 4px, 6px, 8px, 10px, 12px -- 6 distinct gap values
- Padding on the detail body (`20px 20px 80px`) differs from the CSS class `.detail-body` which defines `32px 24px 120px` -- the inline style overrides the class. This is inconsistent.

### Pillar 6: Experience Design (3/4)

**State coverage:**

| State | Present? | Evidence |
|-------|----------|----------|
| Loading | Yes | "Loading project..." centered message (line 162) |
| Error / Not Found | Yes | "Project not found." message (line 183) |
| Empty payment plan | Yes | Fallback card: "Contact the agent..." (line 364-367) |
| Empty units | Yes | Section not rendered (conditional at line 370) |
| Empty amenities | Yes | Section not rendered (conditional at line 409) |
| Empty gallery | Yes | Gallery section not rendered (conditional at line 304) |
| Image error | Yes | `onerror="handleImgError(this)"` on images (lines 307, 308, 334) |
| Site plan image error | Partial | Uses `this.style.display='none'` (line 404) -- hides silently |

**Interaction patterns:**

| Pattern | Present? | Notes |
|---------|----------|-------|
| Gallery swipe | Yes | Horizontal scroll with snap and counter |
| Lightbox pinch-zoom | Yes | Touch gesture handling (lines 96-116) |
| Lightbox swipe nav | Yes | Touch swipe detection (line 114) |
| Description truncation | Yes | -webkit-line-clamp with "Read more" (line 438-439) |
| Brochure lead gate | Yes | `openLeadForBrochure()` guards download (line 445) |
| Scroll lock | Yes | `document.body.style.overflow = 'hidden'` (line 164) |
| Safe area insets | Yes | `env(safe-area-inset-bottom)` on sticky CTA (line 453) |
| Back navigation | Yes | Close button in modal shell (index.html line 452-454) |

**Issues:**
- Loading state is a plain text message, not a skeleton shimmer -- misses the opportunity to show layout shape while loading
- No disabled state on "Enquire" button during form submission
- Gallery has no loading placeholder per-slide -- if images are slow, user sees blank white
- Lightbox has no keyboard navigation (Escape/Arrow keys)
- No `focus-trap` in the modal -- Tab key can reach elements behind the overlay
- The sticky CTA bar is a second inline implementation (line 453-457) separate from the `detail-cta-bar` in the HTML shell (index.html line 455-460) -- the shell CTA is hidden via JS (`ctaBar.style.display = 'none'`, line 167) and replaced with the inline one. This duplication is a maintenance risk.

---

## Files Audited

- `/Users/bobanpepic/Desktop/sellingdubai-app/js/project-detail.js` (full file -- all modal HTML template logic)
- `/Users/bobanpepic/Desktop/sellingdubai-app/js/properties.js` (lines 280-380 -- off-plan card renderer)
- `/Users/bobanpepic/Desktop/sellingdubai-app/index.html` (lines 450-465 -- modal overlay shell and CTA bar)
- `/Users/bobanpepic/Desktop/sellingdubai-app/css/property-detail.css` (full file -- detail overlay, sheet, body, gallery CSS classes)
- `/Users/bobanpepic/Desktop/sellingdubai-app/css/mortgage.css` (lines 256-302 -- detail-cta-bar and button styles)
- `/Users/bobanpepic/Desktop/sellingdubai-app/css/responsive.css` (detail-cta-bar responsive overrides)
