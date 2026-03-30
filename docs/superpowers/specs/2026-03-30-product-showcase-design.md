# Product Showcase Section — Design Spec
Date: 2026-03-30

## Goal

Replace the current static desktop screenshot section on `landing.html` with a premium, Apple-style product showcase: full-bleed screenshot with animated floating callout chips that scroll into view.

## Layout

- Dark section background: `#09090b` (matches existing `bg-zinc-950`)
- Section padding: `96px 24px` top/bottom
- Text content centered above screenshot: label pill → headline → subheadline
- Screenshot container: `max-width: 1100px`, centered, `margin: 0 auto`

## Screenshot

- Asset: `desktop-screenshot.jpeg` already in Supabase `agent-images/landing/`
- Served via Netlify Image CDN: `/.netlify/images?url=<supabase-url>&w=2200&fm=webp&q=85`
- `border-radius: 16px`, `box-shadow: 0 40px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)`
- Top gradient fade: `::before` pseudo-element, `#09090b → transparent` over top 80px — dissolves screenshot into dark background, removes hard top edge

## Floating Callout Chips — 3 total

Each chip: glass-blur card with icon, title, and subtitle label.

| Chip | Icon | Title | Subtitle | Position |
|------|------|-------|----------|----------|
| 1 | 🏛 | DLD Verified | Pulls live from official registry | `top: 18%; left: -6%` |
| 2 | 💬 | Direct WhatsApp | Buyer → agent, no middleman | `top: 42%; right: -5%` |
| 3 | 📊 | AED 312M in sales | Auto-synced from DLD records | `bottom: 20%; left: -4%` |

Chip styling:
- `background: rgba(10, 10, 20, 0.88)`
- `backdrop-filter: blur(16px) saturate(1.4)`
- `border: 1px solid rgba(255,255,255,0.12)`
- `border-radius: 12px`, `padding: 10px 14px`
- Icon container: `28×28px`, `border-radius: 7px`, color-tinted background per chip (blue / green / gold)

## Animation

- Trigger: `IntersectionObserver` on the `.screenshot-wrap` element, fires once when 20% of the section is visible (`threshold: 0.2`)
- Initial state: `opacity: 0; transform: translateY(12px)`
- Visible state: `opacity: 1; transform: translateY(0)`
- Transition: `0.55s ease` on both properties
- Stagger: chips get `.visible` class added at 0ms, 220ms, 440ms respectively
- Implementation: ~15 lines of inline `<script>` inside the section — no new JS module, no bundle impact
- `prefers-reduced-motion`: if user has reduced motion set, skip the animation (add chips as visible immediately)

## Copy

**Label pill:** `THE PLATFORM`

**Headline:**
```
Your profile.
Your brand.
Your leads.
```

**Subheadline:**
`This is what buyers see when they find you. DLD-verified. Direct WhatsApp. No portals.`

**Bottom caption** (below screenshot):
`Your page. Your client. Zero portal fees.`

## What Does Not Change

- Existing headline font: Manrope 800, `tight-tracking` class, `letter-spacing: -0.025em`
- Section ID: `#preview`
- The `reveal` scroll class already on the section
- The benefit icons row and trust bar below this section — untouched

## Files Changed

- `landing.html` — only the `#preview` section block (lines ~209–229)

## Out of Scope

- No new JS module or chunk
- No changes to `styles.css` (all new styles are inline in the section or as a small `<style>` block)
- No changes to any other section of `landing.html`
- No new third-party dependencies
