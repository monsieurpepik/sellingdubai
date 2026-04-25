# Footer Platform Tell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing whisper-quiet agent page footer with a bold platform tell — three lines plus a faint legal row — turning every scroll-to-bottom into a platform acquisition moment.

**Architecture:** Pure HTML/CSS change. The existing `<footer class="sd-footer">` in `index.html` is replaced in-place. `css/footer.css` gets its internal styles rewritten. No JS, no other pages, no god nodes touched.

**Tech Stack:** HTML, CSS (no preprocessor — plain CSS file)

---

## Files

| Action | File | What changes |
|--------|------|-------------|
| Modify | `index.html` | Replace `<footer class="sd-footer">` block (lines 208–221) |
| Modify | `css/footer.css` | Remove old `.sd-footer-powered`, `.sd-footer-legal`, `.sd-footer-difc` styles; add new platform tell classes |

---

## Task 1: Update footer CSS

**Files:**
- Modify: `css/footer.css`

- [ ] **Step 1: Read the current footer CSS**

Open `css/footer.css`. The block to replace is the `/* FOOTER */` section (`.sd-footer`, `.sd-footer-powered`, `.sd-footer-legal`, `.sd-footer-difc`). The cookie consent section below it is untouched.

- [ ] **Step 2: Replace the footer styles**

Remove everything from `/* ========== FOOTER */` down to (and including) `.sd-footer-difc { ... }`. Replace with:

```css
/* ========== FOOTER — platform tell ========== */
.sd-footer {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  margin-top: 24px;
}
.sd-footer-platform {
  background: #000;
  border-top: 1px solid rgba(255,255,255,0.06);
  padding: 28px 24px 22px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.sd-footer-wordmark {
  font-family: 'Manrope', sans-serif;
  font-size: 17px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: #fff;
}
.sd-footer-tagline {
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 400;
  color: rgba(255,255,255,0.4);
  line-height: 1.4;
  margin: 0;
}
.sd-footer-cta {
  display: inline-block;
  margin-top: 8px;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 600;
  color: #f5c842;
  text-decoration: none;
  transition: opacity 0.2s;
}
.sd-footer-cta:hover { opacity: 0.75; }
.sd-footer-legal-row {
  background: #000;
  border-top: 1px solid rgba(255,255,255,0.04);
  padding: 12px 24px 20px;
  text-align: center;
  font-family: 'Inter', sans-serif;
  font-size: 10px;
  color: rgba(255,255,255,0.25);
}
.sd-footer-legal-row a {
  color: rgba(255,255,255,0.25);
  text-decoration: none;
}
.sd-footer-legal-row a:hover { color: rgba(255,255,255,0.5); }
.sd-footer-entity {
  display: block;
  margin-top: 4px;
  font-size: 9px;
  color: rgba(255,255,255,0.15);
}
```

- [ ] **Step 3: Verify the referral-cta block is still intact above the footer styles**

The `.referral-cta` and `.referral-cta-link` rules at the top of the file are untouched. Confirm they're still present.

- [ ] **Step 4: Commit**

```bash
git add css/footer.css
git commit -m "Update footer CSS for platform tell"
```

---

## Task 2: Update footer HTML

**Files:**
- Modify: `index.html` (lines 208–221)

- [ ] **Step 1: Read the current footer block**

In `index.html`, locate:
```html
<footer class="sd-footer">
  <div class="trust-badges">
    ...
  </div>
  <a href="https://www.sellingdubai.com" ... class="sd-footer-powered">
    <img src="/sellingdubailogo.png" ...>
  </a>
  <p class="sd-footer-legal">...</p>
  <p class="sd-footer-difc">...</p>
</footer>
```

- [ ] **Step 2: Replace with the platform tell structure**

Replace the entire `<footer class="sd-footer">...</footer>` block with:

```html
<footer class="sd-footer">
  <div class="sd-footer-platform">
    <div class="sd-footer-wordmark">SELLINGDUBAI</div>
    <p class="sd-footer-tagline">The operating system for Dubai real estate agents.</p>
    <a href="/join" class="sd-footer-cta">Agents — claim your page →</a>
  </div>
  <div class="sd-footer-legal-row">
    <a href="/terms">Terms</a> | <a href="/privacy">Privacy</a>
    <span class="sd-footer-entity">SellingDubai is a product of PropTeFi Tech Limited · DIFC, Dubai, UAE</span>
  </div>
</footer>
```

- [ ] **Step 3: Run pre-deploy check**

```bash
npm run check
```

Expected: all gates pass (no JS changed, bundle sizes unchanged).

- [ ] **Step 4: Commit and push**

```bash
git add index.html
git commit -m "Replace agent page footer with platform tell"
git push origin main
```

---

## Self-Review

**Spec coverage:**
- ✅ Black section with three lines — `.sd-footer-platform` block with wordmark, tagline, CTA
- ✅ Yellow "Agents — claim your page →" link to `/join` — `.sd-footer-cta` with `#f5c842`
- ✅ Legal sub-row kept — `.sd-footer-legal-row` with Terms | Privacy
- ✅ "SellingDubai is a product of PropTeFi Tech Limited · DIFC, Dubai, UAE" — `.sd-footer-entity`
- ✅ Trust badges and faint logo removed

**Placeholders:** None.

**Type consistency:** CSS class names used in HTML exactly match those defined in the CSS task.
