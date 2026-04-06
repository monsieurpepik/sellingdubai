# Landing Page Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `landing.html` with a minimal, single-purpose claim page: logo + headline + subline + one CTA that opens a 3-step wizard modal (Name/Email/WhatsApp → DLD BRN → success). Below the fold: 3-facts row + existing footer. Submits to the existing `waitlist-join` edge function.

**Architecture:** All changes are to `landing.html` (HTML + inline `<style>`) and a new `js/landing-wizard.js`. No build step, no new dependencies, no external CSS. Existing `sd-config.js`, `landing-behavior.js` (agent count), and `landing-chip-anim.js` are preserved. The wizard reads `window.__SD_SUPABASE_URL__` (set by `dist/release-config.js`) for the edge function URL.

**Tech Stack:** Vanilla HTML, CSS (inline `<style>` block), vanilla JS, existing Tailwind classes from `landing-output.css` for the footer only.

---

### Task 1: Write `js/landing-wizard.js`

**Files:**
- Create: `js/landing-wizard.js`

This is a standalone IIFE — no imports, no build step. It reads `window.__SD_SUPABASE_URL__` for the endpoint.

- [ ] **Step 1: Create `js/landing-wizard.js`**

```js
// @ts-check
// js/landing-wizard.js — 3-step claim-profile wizard for landing.html

(function () {
  /** @type {HTMLElement|null} */
  var overlay  = document.getElementById('wizard-overlay');
  /** @type {HTMLElement|null} */
  var closeBtn = document.getElementById('wizard-close');
  /** @type {HTMLElement|null} */
  var backBtn  = document.getElementById('wizard-back');
  /** @type {HTMLElement|null} */
  var step1    = document.getElementById('wizard-step-1');
  /** @type {HTMLElement|null} */
  var step2    = document.getElementById('wizard-step-2');
  /** @type {HTMLElement|null} */
  var step3    = document.getElementById('wizard-step-3');
  /** @type {HTMLFormElement|null} */
  var form1    = /** @type {HTMLFormElement|null} */ (document.getElementById('wizard-form-1'));
  /** @type {HTMLFormElement|null} */
  var form2    = /** @type {HTMLFormElement|null} */ (document.getElementById('wizard-form-2'));
  /** @type {HTMLElement|null} */
  var err1     = document.getElementById('step1-error');
  /** @type {HTMLElement|null} */
  var err2     = document.getElementById('step2-error');

  if (!overlay || !step1 || !step2 || !step3 || !form1 || !form2) return;

  var data = { name: '', email: '', whatsapp: /** @type {string|null} */ (null) };

  // ── helpers ──────────────────────────────────────────────────────────────

  function openWizard() {
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    showStep(1);
    var nameInput = /** @type {HTMLInputElement|null} */ (form1.querySelector('[name="name"]'));
    if (nameInput) setTimeout(function () { nameInput.focus(); }, 60);
  }

  function closeWizard() {
    overlay.setAttribute('aria-hidden', 'true');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  function showStep(n) {
    step1.classList.toggle('wz-hidden', n !== 1);
    step2.classList.toggle('wz-hidden', n !== 2);
    step3.classList.toggle('wz-hidden', n !== 3);
    var dots = overlay.querySelectorAll('.wz-dot');
    dots.forEach(function (d, i) { d.classList.toggle('active', i < n); });
  }

  // ── open triggers (data-open-wizard attribute) ────────────────────────────

  document.querySelectorAll('[data-open-wizard]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      openWizard();
    });
  });

  // ── close / backdrop / escape ─────────────────────────────────────────────

  if (closeBtn) closeBtn.addEventListener('click', closeWizard);

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeWizard();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeWizard();
  });

  // ── back button ───────────────────────────────────────────────────────────

  if (backBtn) backBtn.addEventListener('click', function () { showStep(1); });

  // ── step 1: collect name / email / whatsapp ───────────────────────────────

  form1.addEventListener('submit', function (e) {
    e.preventDefault();
    if (err1) err1.textContent = '';

    var nameEl  = /** @type {HTMLInputElement} */ (form1.querySelector('[name="name"]'));
    var emailEl = /** @type {HTMLInputElement} */ (form1.querySelector('[name="email"]'));
    var waEl    = /** @type {HTMLInputElement} */ (form1.querySelector('[name="whatsapp"]'));

    var nameVal  = nameEl.value.trim();
    var emailVal = emailEl.value.trim().toLowerCase();
    var waVal    = waEl.value.trim() || null;

    if (nameVal.length < 2) {
      if (err1) err1.textContent = 'Name must be at least 2 characters.';
      nameEl.focus();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      if (err1) err1.textContent = 'Please enter a valid email address.';
      emailEl.focus();
      return;
    }

    data.name     = nameVal;
    data.email    = emailVal;
    data.whatsapp = waVal;

    showStep(2);
    var brnEl = /** @type {HTMLInputElement|null} */ (form2.querySelector('[name="brn"]'));
    if (brnEl) setTimeout(function () { brnEl.focus(); }, 60);
  });

  // ── step 2: collect BRN → POST to waitlist-join ───────────────────────────

  form2.addEventListener('submit', function (e) {
    e.preventDefault();
    if (err2) err2.textContent = '';

    var brnEl  = /** @type {HTMLInputElement} */ (form2.querySelector('[name="brn"]'));
    var brnVal = brnEl.value.trim();

    if (!brnVal) {
      if (err2) err2.textContent = 'Please enter your DLD BRN.';
      brnEl.focus();
      return;
    }

    var submitBtn = /** @type {HTMLButtonElement} */ (form2.querySelector('[type="submit"]'));
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting\u2026';

    var supabaseUrl =
      (typeof window !== 'undefined' &&
        /** @type {any} */ (window).__SD_SUPABASE_URL__) ||
      'https://pjyorgedaxevxophpfib.supabase.co';

    fetch(supabaseUrl + '/functions/v1/waitlist-join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: data.name, email: data.email, whatsapp: data.whatsapp }),
    })
      .then(function (r) { return r.json(); })
      .then(function () {
        showStep(3);
      })
      .catch(function () {
        if (err2) err2.textContent = 'Something went wrong. Please try again.';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Claim My Profile \u2192';
      });
  });
})();
```

- [ ] **Step 2: Verify `// @ts-check` is line 1**

```bash
head -1 js/landing-wizard.js
```

Expected: `// @ts-check`

- [ ] **Step 3: Commit**

```bash
git add js/landing-wizard.js
git commit -m "feat: add landing page wizard JS (3-step claim-profile flow)

Vanilla IIFE, no deps. Reads window.__SD_SUPABASE_URL__ for the
endpoint. Opens on [data-open-wizard] clicks.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Update `landing.html` — head, meta, and inline style block

**Files:**
- Modify: `landing.html` (head + `<style>` block only — lines 1–150 approx.)

- [ ] **Step 1: Update `<title>` and description meta**

In `landing.html`, replace:

```html
<title>SellingDubai | The Verified Page for Dubai Agents</title>
<meta name="description" content="The DLD-verified link-in-bio for Dubai real estate agents. Your badge, your listings, direct WhatsApp, visitor analytics. Free to set up in 5 minutes."/>
```

With:

```html
<title>SellingDubai — The Operating System for Dubai Real Estate Agents</title>
<meta name="description" content="DLD-verified agent profiles. Your leads, your brand, zero commission. Free forever."/>
```

- [ ] **Step 2: Update OG and Twitter meta**

Replace:

```html
<meta property="og:title" content="SellingDubai | The Verified Page for Dubai Agents"/>
<meta property="og:description" content="The DLD-verified link-in-bio for Dubai real estate agents. Your badge, listings, direct WhatsApp, analytics. Free."/>
```

With:

```html
<meta property="og:title" content="SellingDubai — The Operating System for Dubai Real Estate Agents"/>
<meta property="og:description" content="DLD-verified. Your leads. Your brand. Free."/>
```

Replace:

```html
<meta name="twitter:title" content="SellingDubai | The Verified Page for Dubai Agents"/>
<meta name="twitter:description" content="The DLD-verified link-in-bio for Dubai real estate agents. Your badge, listings, direct WhatsApp, analytics. Free."/>
```

With:

```html
<meta name="twitter:title" content="SellingDubai — The Operating System for Dubai Real Estate Agents"/>
<meta name="twitter:description" content="DLD-verified. Your leads. Your brand. Free."/>
```

- [ ] **Step 3: Remove the dubai-skyline preload link (no longer needed above the fold)**

Remove this line entirely:

```html
<link rel="preload" as="image" fetchpriority="high" href="/.netlify/images?url=https://pjyorgedaxevxophpfib.supabase.co/storage/v1/object/public/agent-images/dubai-skyline.jpg&w=800&fm=webp&q=80">
```

- [ ] **Step 4: Add wizard + above-fold CSS to the inline `<style>` block**

Find the closing `</style>` just before the `<script type="application/ld+json">` tag (around line 150). Insert before `</style>`:

```css

  /* ── Above-fold hero ── */
  .hero-above-fold {
    min-height: 100svh;
    display: flex; align-items: center; justify-content: center;
    text-align: center; padding: 40px 24px; background: #fff;
  }
  .hero-inner { max-width: 560px; margin: 0 auto; }
  .hero-brand { font-family: 'Manrope', sans-serif; font-weight: 800;
    letter-spacing: 0.25em; text-transform: uppercase; font-size: 12px;
    color: #0a0a0a; margin-bottom: 40px; display: block; }
  .hero-headline {
    font-family: 'Manrope', sans-serif; font-weight: 800;
    font-size: clamp(30px, 6vw, 60px); color: #0a0a0a;
    letter-spacing: -0.03em; line-height: 1.1; margin: 0 0 20px;
  }
  .hero-subline { font-size: 18px; font-weight: 400; color: #71717a; margin: 0 0 36px; }
  .hero-cta-btn {
    display: inline-block; background: #0a0a0a; color: #fff; border: none;
    cursor: pointer; padding: 16px 44px; border-radius: 14px;
    font-size: 16px; font-weight: 700; letter-spacing: -0.01em;
    font-family: 'Manrope', sans-serif; transition: opacity 0.15s;
  }
  .hero-cta-btn:hover, .hero-cta-btn:focus-visible { opacity: 0.8; }
  .hero-agent-count { font-size: 13px; color: #a1a1aa; margin: 16px 0 0; }

  /* ── Facts row ── */
  .facts-row { padding: 64px 24px; background: #fafafa; border-top: 1px solid #f0f0f0; }
  .facts-inner { display: flex; gap: 16px; justify-content: center; max-width: 640px; margin: 0 auto; flex-wrap: wrap; }
  .fact { text-align: center; flex: 1; min-width: 140px; }
  .fact-number { font-size: 36px; font-weight: 800; color: #0a0a0a;
    font-family: 'Manrope', sans-serif; letter-spacing: -0.03em; }
  .fact-label { font-size: 13px; color: #71717a; margin-top: 4px; }

  /* ── Wizard modal ── */
  .wz-overlay {
    display: none; position: fixed; inset: 0; z-index: 100;
    background: rgba(0,0,0,0.55); backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    align-items: center; justify-content: center;
  }
  .wz-overlay.open { display: flex; }
  @media (max-width: 767px) {
    .wz-overlay.open { align-items: flex-end; }
    .wz-panel { border-radius: 20px 20px 0 0 !important; max-width: none !important;
      position: fixed; bottom: 0; left: 0; right: 0; max-height: 90svh; }
  }
  .wz-panel {
    background: #fff; border-radius: 20px; padding: 40px 32px;
    width: calc(100% - 32px); max-width: 400px; position: relative;
    max-height: 90svh; overflow-y: auto;
  }
  .wz-close {
    position: absolute; top: 14px; right: 16px; background: none; border: none;
    cursor: pointer; font-size: 22px; color: #a1a1aa; line-height: 1;
    padding: 4px 8px; border-radius: 6px;
  }
  .wz-close:hover { color: #0a0a0a; }
  .wz-dots { display: flex; gap: 6px; justify-content: center; margin-bottom: 28px; }
  .wz-dot { width: 8px; height: 8px; border-radius: 50%; background: #e4e4e7; transition: background 0.2s; }
  .wz-dot.active { background: #1127D2; }
  .wz-step h2 { font-size: 22px; font-weight: 800; color: #0a0a0a; margin: 0 0 8px;
    font-family: 'Manrope', sans-serif; letter-spacing: -0.02em; }
  .wz-step p { font-size: 14px; color: #71717a; margin: 0 0 24px; line-height: 1.5; }
  .wz-step label { display: block; margin-bottom: 16px; font-size: 13px;
    font-weight: 600; color: #3f3f46; font-family: 'Manrope', sans-serif; }
  .wz-step input[type="text"],
  .wz-step input[type="email"],
  .wz-step input[type="tel"] {
    display: block; width: 100%; border: 1.5px solid #e4e4e7; border-radius: 10px;
    padding: 12px 14px; font-size: 15px; margin-top: 5px; outline: none;
    transition: border-color 0.15s; box-sizing: border-box; font-family: inherit;
  }
  .wz-step input:focus { border-color: #1127D2; }
  .wz-optional { font-weight: 400; color: #a1a1aa; margin-left: 4px; }
  .wz-submit {
    display: block; width: 100%; background: #0a0a0a; color: #fff; border: none;
    border-radius: 12px; padding: 14px; font-size: 15px; font-weight: 700;
    cursor: pointer; margin-top: 8px; letter-spacing: -0.01em; font-family: 'Manrope', sans-serif;
    transition: opacity 0.15s;
  }
  .wz-submit:hover:not(:disabled) { opacity: 0.85; }
  .wz-submit:disabled { opacity: 0.5; cursor: not-allowed; }
  .wz-error { color: #dc2626; font-size: 13px; margin: -8px 0 8px; min-height: 18px; }
  .wz-back {
    background: none; border: none; cursor: pointer; font-size: 13px;
    font-weight: 600; color: #71717a; padding: 0; margin-bottom: 20px;
    font-family: 'Manrope', sans-serif;
  }
  .wz-back:hover { color: #0a0a0a; }
  .wz-success-icon { font-size: 48px; text-align: center; margin-bottom: 16px; }
  .wz-hidden { display: none !important; }
```

- [ ] **Step 5: Commit head + style changes**

```bash
git add landing.html
git commit -m "feat: update landing.html head meta + add wizard/above-fold CSS

New headline messaging, remove dubai-skyline preload, inline wizard
and hero CSS added to style block.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Replace nav + hero + add wizard modal HTML in `landing.html`

**Files:**
- Modify: `landing.html` (nav + hero section + wizard modal)

- [ ] **Step 1: Replace the existing `<nav>` with a minimal nav**

Replace:

```html
<!-- ======== NAVBAR (no logo — agent is the brand) ======== -->
<nav class="sticky top-0 w-full z-50 border-b border-zinc-100 bg-white/80 backdrop-blur-md">
  <div class="flex justify-between items-center max-w-7xl mx-auto px-6 py-3">
    <div class="flex items-center gap-6">
      <a class="text-zinc-500 hover:text-zinc-900 transition-colors text-xs tracking-wide" href="#features">Features</a>
      <a class="text-zinc-500 hover:text-zinc-900 transition-colors text-xs tracking-wide" href="#how-steps">How It Works</a>
      <a class="text-zinc-500 hover:text-zinc-900 transition-colors text-xs tracking-wide" href="#faq">FAQ</a>
    </div>
    <div class="flex items-center gap-3">
      <a href="/dashboard" class="text-zinc-500 hover:text-zinc-900 transition-colors text-xs font-semibold tracking-tight">Agent Login</a>
      <a href="/join" class="bg-primary text-on-primary px-5 py-2 rounded-full text-xs font-bold tracking-tight hover:opacity-90 transition-opacity">Get Your Page</a>
    </div>
  </div>
</nav>
```

With:

```html
<!-- ======== MINIMAL NAV ======== -->
<nav style="position:sticky;top:0;z-index:50;display:flex;justify-content:flex-end;padding:12px 20px;background:rgba(255,255,255,0.9);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid rgba(0,0,0,0.05);">
  <a href="/dashboard" style="font-size:12px;font-weight:600;color:#71717a;text-decoration:none;font-family:'Manrope',sans-serif;padding:6px 0;" onmouseover="this.style.color='#0a0a0a'" onmouseout="this.style.color='#71717a'">Agent Login</a>
</nav>
```

- [ ] **Step 2: Replace the existing hero section**

Replace:

```html
<!-- ======== HERO ======== -->
<section class="max-w-7xl mx-auto px-6 pt-16 pb-12 text-center">
  <div class="inline-block bg-zinc-100 px-4 py-1.5 rounded-full text-[10px] font-bold tracking-widest text-zinc-500 mb-8 uppercase">The Agent Operating System</div>
  <h1 class="font-headline text-3xl sm:text-5xl md:text-8xl text-on-surface mb-8 tight-tracking leading-[1.1]">
    <span>You built the trust.<br/>Someone else is getting the leads.</span>
  </h1>
  <p class="font-body text-base text-on-surface-variant max-w-lg mx-auto mb-10 leading-relaxed" style="font-weight:300;">
    You built that audience. You answered their questions, posted the market updates, showed up every week. When they want to buy, they open a portal and find you listed alongside ten other agents. You paid to be on that list. So did the other nine.
  </p>
  <div class="max-w-md mx-auto mb-6 w-full px-4 text-center">
    <a href="/join" class="inline-block bg-primary text-on-primary px-10 py-4 rounded-2xl text-sm font-bold hover:opacity-90 transition-opacity">Get Your Page — Free</a>
    <p class="text-xs text-zinc-400 mt-3">No subscription fee. No platform commission. Independent by design.</p>
  </div>


</section>
```

With:

```html
<!-- ======== ABOVE-FOLD HERO ======== -->
<section class="hero-above-fold">
  <div class="hero-inner">
    <span class="hero-brand">SellingDubai</span>
    <h1 class="hero-headline">The Operating System for Dubai Real Estate Agents</h1>
    <p class="hero-subline">DLD-verified. Your leads. Your brand. Free.</p>
    <button class="hero-cta-btn" data-open-wizard>Claim Your Profile &rarr;</button>
    <p class="hero-agent-count">
      <span id="agent-count-live">—</span> agents already on the platform
    </p>
  </div>
</section>
```

- [ ] **Step 3: Add wizard modal HTML immediately after the hero section (before next section)**

Insert this block immediately after the closing `</section>` of the hero:

```html

<!-- ======== WIZARD MODAL ======== -->
<div id="wizard-overlay" class="wz-overlay" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="wz-title-1">

  <div class="wz-panel">
    <button id="wizard-close" class="wz-close" aria-label="Close">&times;</button>

    <div class="wz-dots" aria-hidden="true">
      <span class="wz-dot active"></span>
      <span class="wz-dot"></span>
      <span class="wz-dot"></span>
    </div>

    <!-- Step 1: Name / Email / WhatsApp -->
    <div class="wz-step" id="wizard-step-1">
      <h2 id="wz-title-1">Claim your profile</h2>
      <p>Free forever. DLD-verified badge included.</p>
      <form id="wizard-form-1" novalidate>
        <label>Full name
          <input type="text" name="name" required autocomplete="name" placeholder="Ahmed Al Mansouri">
        </label>
        <label>Email
          <input type="email" name="email" required autocomplete="email" placeholder="ahmed@agency.ae">
        </label>
        <label>WhatsApp <span class="wz-optional">(optional)</span>
          <input type="tel" name="whatsapp" autocomplete="tel" placeholder="+971 50 123 4567">
        </label>
        <p class="wz-error" id="step1-error" aria-live="polite"></p>
        <button type="submit" class="wz-submit">Continue &rarr;</button>
      </form>
    </div>

    <!-- Step 2: DLD BRN -->
    <div class="wz-step wz-hidden" id="wizard-step-2">
      <button type="button" id="wizard-back" class="wz-back">&larr; Back</button>
      <h2>Your DLD licence</h2>
      <p>We verify every agent. Your BRN earns you the verified badge on your profile.</p>
      <form id="wizard-form-2" novalidate>
        <label>DLD BRN
          <input type="text" name="brn" required placeholder="e.g. 12345" inputmode="numeric" autocomplete="off">
        </label>
        <p class="wz-error" id="step2-error" aria-live="polite"></p>
        <button type="submit" class="wz-submit">Claim My Profile &rarr;</button>
      </form>
    </div>

    <!-- Step 3: Success -->
    <div class="wz-step wz-hidden" id="wizard-step-3">
      <div class="wz-success-icon">✓</div>
      <h2>You're on the list.</h2>
      <p>We'll email you when your profile is ready to activate. Keep an eye on your inbox.</p>
    </div>
  </div>

</div>
```

- [ ] **Step 4: Confirm the hero + wizard HTML is in place**

```bash
grep -n "data-open-wizard\|wz-overlay\|wizard-step-1\|wizard-step-3" landing.html
```

Expected: 4+ matches.

- [ ] **Step 5: Commit**

```bash
git add landing.html
git commit -m "feat: replace landing.html nav + hero with minimal above-fold + wizard modal HTML

New headline: 'The Operating System for Dubai Real Estate Agents'
CTA triggers wizard instead of /join redirect.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Replace below-fold, update sticky CTA, add facts row, add script tag

**Files:**
- Modify: `landing.html` (below-fold sections, sticky CTA, script tags)

The current below-fold contains: Product Preview (phone mockup), Features, How It Works, FAQ, a brand section. All of this is removed and replaced with a single 3-facts row. The footer and sticky CTA are kept; the sticky CTA is updated to open the wizard instead of linking to `/join`.

- [ ] **Step 1: Remove all below-fold sections between the wizard modal and the footer**

The sections to remove span from after the wizard modal closing `</div>` to just before `<!-- ======== FOOTER ======== -->`. This includes:

- `<!-- ======== PRODUCT PREVIEW ======== -->` section
- Any Features, How It Works, Testimonials, FAQ, or brand sections
- The brand/logo reveal section around line 790

Replace everything between the wizard modal and the footer with the 3-facts row. Find the boundary by locating:

```html
</div>

<!-- ======== FOOTER ======== -->
```

Everything between the wizard modal's closing `</div>` and `<!-- ======== FOOTER ======== -->` should be removed and replaced with:

```html

<!-- ======== 3 FACTS ======== -->
<section class="facts-row">
  <div class="facts-inner">
    <div class="fact">
      <div class="fact-number">100%</div>
      <div class="fact-label">Free to start — no credit card</div>
    </div>
    <div class="fact">
      <div class="fact-number">DLD</div>
      <div class="fact-label">Verified badge on every profile</div>
    </div>
    <div class="fact">
      <div class="fact-number">0%</div>
      <div class="fact-label">Platform commission on your leads</div>
    </div>
  </div>
</section>

```

Practical approach — use a single Edit replacing from the first below-fold section header to the footer comment. The exact old_string starts with:

```html
<!-- ======== PRODUCT PREVIEW ======== -->
```

and ends with the blank line before:

```html
<!-- ======== FOOTER ======== -->
```

Identify those exact lines in the file before editing (`grep -n "PRODUCT PREVIEW\|FOOTER" landing.html`), then replace everything between them.

- [ ] **Step 2: Update sticky CTA to open the wizard instead of linking to `/join`**

Replace:

```html
<!-- ======== STICKY MOBILE CTA ======== -->
<div class="sticky-cta">
  <a href="/join" style="display:block;background:#1d1d1f;color:#fff;text-align:center;padding:14px;border-radius:14px;font-size:14px;font-weight:700;font-family:Inter,sans-serif;text-decoration:none;">Get Your Page — Free</a>
</div>
```

With:

```html
<!-- ======== STICKY MOBILE CTA ======== -->
<div class="sticky-cta">
  <button data-open-wizard style="display:block;width:100%;background:#1d1d1f;color:#fff;text-align:center;padding:14px;border-radius:14px;font-size:14px;font-weight:700;font-family:Inter,sans-serif;border:none;cursor:pointer;">Claim Your Profile — Free</button>
</div>
```

- [ ] **Step 3: Add `landing-wizard.js` script tag**

The bottom scripts block currently ends with:

```html
<script src="/js/sd-config.js"></script>
<script src="/js/landing-chip-anim.js" defer></script>
<script src="/js/landing-behavior.js" defer></script>
```

Replace with:

```html
<script src="/js/sd-config.js"></script>
<script src="/js/landing-chip-anim.js" defer></script>
<script src="/js/landing-behavior.js" defer></script>
<script src="/js/landing-wizard.js" defer></script>
```

- [ ] **Step 4: Confirm the page has no references to removed sections**

```bash
grep -n "hero-waitlist\|#features\|#how-steps\|#faq\|PRODUCT PREVIEW\|phone-frame\|callout-chip" landing.html | head -10
```

Expected: 0 matches. If there are any, remove them.

- [ ] **Step 5: Confirm the `agent-count-live` span is present** (used by `landing-behavior.js`)

```bash
grep -n "agent-count-live" landing.html
```

Expected: exactly 1 match (in the hero section added in Task 3).

- [ ] **Step 6: Run the pre-deploy check**

```bash
npm run check
```

Expected: no FAIL lines. The check for CTAs pointing to old waitlist anchors (check #5) should now pass because the sticky CTA no longer has `href="/join"` anchors to `#hero-waitlist`. Note: the pre-deploy check looks for `href="/#hero-waitlist"` and `href="#hero"` — our button uses `data-open-wizard` so it's clean.

- [ ] **Step 7: Commit**

```bash
git add landing.html
git commit -m "feat: landing.html — replace below-fold with 3-facts row, wizard sticky CTA

Removes product preview, features, FAQ sections. Adds 3-facts row.
Sticky CTA now opens wizard modal instead of linking to /join.
Adds landing-wizard.js script tag.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|---|---|
| Minimal, single-purpose page | Tasks 3–4 (removes all below-fold selling content) |
| Logo centered above fold | Task 3 Step 2 (`.hero-brand` inside `.hero-inner` centered) |
| Headline: "The Operating System for Dubai Real Estate Agents" | Task 3 Step 2 |
| Subline: "DLD-verified. Your leads. Your brand. Free." | Task 3 Step 2 |
| One CTA: "Claim Your Profile →" opens wizard | Task 3 Steps 2–3 |
| Wizard Step 1: Name/Email/WhatsApp | Task 3 Step 3 |
| Wizard Step 2: DLD BRN + back button | Task 3 Step 3 |
| Wizard Step 3: success screen | Task 3 Step 3 |
| Progress dots | Task 3 Step 3 (`.wz-dots`) |
| Mobile full-screen / desktop max-w-md | Task 2 Step 4 (`.wz-panel` + media query) |
| Submit calls `waitlist-join` | Task 1 (`fetch(supabaseUrl + '/functions/v1/waitlist-join')`) |
| Preserve `landing-behavior.js` (agent count) | Tasks 3 + 4 (`agent-count-live` span kept, script tag kept) |
| Preserve `sd-config.js` | Task 4 Step 3 (script tag kept) |
| 3 facts row below fold | Task 4 Step 1 |
| Existing footer | Task 4 (footer untouched) |
| Vanilla JS only | Task 1 (plain IIFE, no imports) |
| Sticky CTA triggers modal | Task 4 Step 2 |

All requirements covered — no gaps found.

### Placeholder scan

No TBD, TODO, or "similar to Task N" patterns — each task contains complete code.

### Type consistency

- `data-open-wizard` attribute → `querySelectorAll('[data-open-wizard]')` in wizard JS ✓
- `wizard-overlay` id → `document.getElementById('wizard-overlay')` ✓
- `wizard-form-1` id → `document.getElementById('wizard-form-1')` ✓
- `wizard-form-2` id → `document.getElementById('wizard-form-2')` ✓
- `wz-hidden` class → `.classList.toggle('wz-hidden', ...)` ✓
- `wz-dot` class → `.querySelectorAll('.wz-dot')` ✓
- `step1-error` / `step2-error` ids → `document.getElementById(...)` ✓
