# Footer — Platform Tell

**Date:** 2026-04-17
**Status:** Approved

## Problem

The existing agent page footer is whisper-quiet: a faint logo at 25% opacity, trust badges, Terms/Privacy, and a DIFC line. It communicates nothing strategic. Every buyer who scrolls to the bottom is a potential platform referral — an agent they'll show this page to — and the current footer wastes that moment.

## Goal

Turn the footer into a low-friction platform acquisition funnel. One black section, three lines, one yellow link. Costs nothing to render, fires only on users who scroll that far, and directly serves the 18–24 month competitive window.

## Design

### Structure

The existing `<footer class="sd-footer">` in `index.html` is replaced with two stacked sub-sections:

**1. Platform tell block**
- `SELLINGDUBAI` — wordmark, Manrope 800, 17px, white, letter-spacing 0.06em
- `The operating system for Dubai real estate agents.` — tagline, 12px, rgba(255,255,255,0.4)
- `Agents — claim your page →` — CTA link to `/join`, 12px, weight 600, color `#f5c842` (yellow)

**2. Legal sub-row** (very faint, below a hairline border)
- `Terms | Privacy` — links to `/terms` and `/privacy`, 10px Inter, rgba(255,255,255,0.25)
- `SellingDubai is a product of PropTeFi Tech Limited · DIFC, Dubai, UAE` — 9px, rgba(255,255,255,0.15)

### What's removed

- Trust badges (DLD Authorized, 256-bit Encrypted) — removed from footer
- Faint SD logo image — removed
- Existing `.sd-footer-powered`, `.sd-footer-legal`, `.sd-footer-difc` classes — replaced

### CSS changes (`css/footer.css`)

New classes added, old `.sd-footer` internals replaced:

| Class | Purpose |
|-------|---------|
| `.sd-footer` | Wrapper — no padding, flex column |
| `.sd-footer-platform` | Black bg, top border, centered, padding 28px 24px 20px |
| `.sd-footer-wordmark` | Manrope 800, 17px, white, letter-spacing 0.06em |
| `.sd-footer-tagline` | 12px, rgba(255,255,255,0.4), margin-bottom 14px |
| `.sd-footer-cta` | 12px, weight 600, #f5c842, no underline, hover opacity 0.8 |
| `.sd-footer-legal-row` | Very faint sub-row, 10px Inter, rgba(255,255,255,0.25), hairline top border |
| `.sd-footer-entity` | Block element, 9px, rgba(255,255,255,0.15), margin-top 4px |

## Files Touched

| File | Change |
|------|--------|
| `index.html` | Replace `<footer class="sd-footer">` block (lines 208–221) |
| `css/footer.css` | Replace `.sd-footer` internal styles, add new classes |

No JS changes. No other pages. No god nodes.

## Blast Radius

None beyond the two files above. The footer is purely presentational HTML/CSS with no JS dependencies.
