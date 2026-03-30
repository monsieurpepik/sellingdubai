# Product Showcase Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static screenshot block in `landing.html#preview` with a full-bleed screenshot + 3 animated callout chips that slide in on scroll (Apple-style IntersectionObserver).

**Architecture:** Single HTML section edit. All new styles are inline in the section. Animation is ~15 lines of inline `<script>` — no new JS module, no bundle impact. Screenshot asset already exists in Supabase/Netlify CDN.

**Tech Stack:** HTML, inline CSS, vanilla JS IntersectionObserver, Tailwind utility classes (existing).

---

### Task 1: Replace the #preview section HTML

**Files:**
- Modify: `landing.html` lines 209–229 (the entire `<!-- PRODUCT PREVIEW -->` block)

- [ ] **Step 1: Open `landing.html` and locate the section to replace**

  Find this block (lines 209–229):
  ```html
  <!-- ======== PRODUCT PREVIEW ======== -->
  <section class="py-24 md:py-36 bg-zinc-950 overflow-hidden reveal" id="preview">
    <div class="px-6 text-center">
      <div class="inline-block border border-white/10 px-4 py-1.5 rounded-full text-[10px] font-bold tracking-widest text-white/30 mb-8 uppercase">The Platform</div>
      <h2 class="font-headline text-4xl md:text-6xl text-white mb-12 tight-tracking leading-tight">
        Your profile. Your brand. Your leads.
      </h2>
      <div style="max-width:1100px;margin:0 auto;">
        <img
          src="/.netlify/images?url=https://pjyorgedaxevxophpfib.supabase.co/storage/v1/object/public/agent-images/landing/desktop-screenshot.jpeg&w=2200&fm=webp&q=85"
          alt="Selling Dubai agent profile"
          width="1100"
          height="700"
          style="width:100%;height:auto;display:block;border-radius:16px;box-shadow:0 40px 80px rgba(0,0,0,0.6);"
        />
      </div>
      <p class="text-white/45 text-base leading-relaxed mx-auto mt-10" style="font-weight:300;max-width:600px;">
        This is what buyers see when they find you. DLD-verified. Direct WhatsApp. No portals between you and your client.
      </p>
    </div>
  </section>
  ```

- [ ] **Step 2: Replace the entire block with the new section**

  ```html
  <!-- ======== PRODUCT PREVIEW ======== -->
  <section class="py-24 md:py-36 bg-zinc-950 overflow-hidden reveal" id="preview">
    <style>
      .callout-chip {
        position: absolute;
        display: flex;
        align-items: center;
        gap: 10px;
        background: rgba(10,10,20,0.88);
        backdrop-filter: blur(16px) saturate(1.4);
        -webkit-backdrop-filter: blur(16px) saturate(1.4);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 12px;
        padding: 10px 14px;
        font-size: 12px;
        font-weight: 600;
        color: #fff;
        white-space: nowrap;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        z-index: 10;
        opacity: 0;
        transform: translateY(12px);
        transition: opacity 0.55s ease, transform 0.55s ease;
        pointer-events: none;
      }
      .callout-chip.chip-visible {
        opacity: 1;
        transform: translateY(0);
      }
      @media (prefers-reduced-motion: reduce) {
        .callout-chip { opacity: 1; transform: none; transition: none; }
      }
      .chip-icon {
        width: 28px; height: 28px;
        border-radius: 7px;
        display: flex; align-items: center; justify-content: center;
        font-size: 14px;
        flex-shrink: 0;
      }
      .chip-icon-blue  { background: rgba(17,39,210,0.3); }
      .chip-icon-green { background: rgba(37,211,102,0.2); }
      .chip-icon-gold  { background: rgba(255,196,0,0.15); }
      .chip-label { font-size: 10px; font-weight: 500; color: rgba(255,255,255,0.45); display: block; margin-top: 1px; }
      .screenshot-wrap {
        position: relative;
        max-width: 1100px;
        margin: 0 auto;
      }
      .screenshot-wrap::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 80px;
        background: linear-gradient(180deg, #09090b 0%, transparent 100%);
        border-radius: 16px 16px 0 0;
        pointer-events: none;
        z-index: 2;
      }
    </style>

    <div class="px-6 text-center">
      <div class="inline-block border border-white/10 px-4 py-1.5 rounded-full text-[10px] font-bold tracking-widest text-white/30 mb-8 uppercase">The Platform</div>
      <h2 class="font-headline text-4xl md:text-6xl text-white mb-6 tight-tracking leading-tight">
        Your profile. Your brand. Your leads.
      </h2>
      <p class="text-white/40 text-base leading-relaxed mx-auto mb-14" style="font-weight:300;max-width:520px;">
        This is what buyers see when they find you. DLD-verified. Direct WhatsApp. No portals.
      </p>

      <div class="screenshot-wrap" id="showcase-wrap">

        <!-- Callout 1: DLD Verified — top left -->
        <div class="callout-chip" id="chip-dld" style="top:18%;left:-6%;">
          <div class="chip-icon chip-icon-blue">🏛</div>
          <div>
            <span>DLD Verified</span>
            <span class="chip-label">Pulls live from official registry</span>
          </div>
        </div>

        <!-- Callout 2: Direct WhatsApp — right -->
        <div class="callout-chip" id="chip-wa" style="top:42%;right:-5%;">
          <div class="chip-icon chip-icon-green">💬</div>
          <div>
            <span>Direct WhatsApp</span>
            <span class="chip-label">Buyer → agent, no middleman</span>
          </div>
        </div>

        <!-- Callout 3: Sales stats — bottom left -->
        <div class="callout-chip" id="chip-stats" style="bottom:20%;left:-4%;">
          <div class="chip-icon chip-icon-gold">📊</div>
          <div>
            <span>AED 312M in sales</span>
            <span class="chip-label">Auto-synced from DLD records</span>
          </div>
        </div>

        <img
          src="/.netlify/images?url=https://pjyorgedaxevxophpfib.supabase.co/storage/v1/object/public/agent-images/landing/desktop-screenshot.jpeg&w=2200&fm=webp&q=85"
          alt="Selling Dubai agent profile"
          width="1100"
          height="700"
          style="width:100%;height:auto;display:block;border-radius:16px;box-shadow:0 40px 100px rgba(0,0,0,0.7),0 0 0 1px rgba(255,255,255,0.06);"
        />
      </div>

      <p class="text-white/30 text-sm leading-relaxed mx-auto mt-10" style="font-weight:300;">
        Your page. Your client. Zero portal fees.
      </p>
    </div>

    <script>
      (function() {
        var chips = [
          document.getElementById('chip-dld'),
          document.getElementById('chip-wa'),
          document.getElementById('chip-stats')
        ];
        var wrap = document.getElementById('showcase-wrap');
        if (!wrap || !window.IntersectionObserver) {
          chips.forEach(function(c) { if (c) c.classList.add('chip-visible'); });
          return;
        }
        var triggered = false;
        var observer = new IntersectionObserver(function(entries) {
          if (triggered || !entries[0].isIntersecting) return;
          triggered = true;
          chips.forEach(function(c, i) {
            if (!c) return;
            setTimeout(function() { c.classList.add('chip-visible'); }, i * 220);
          });
          observer.disconnect();
        }, { threshold: 0.2 });
        observer.observe(wrap);
      })();
    </script>
  </section>
  ```

- [ ] **Step 3: Verify the old block is gone and new block is in place**

  Run: `grep -n "callout-chip\|chip-dld\|chip-wa\|chip-stats\|showcase-wrap" landing.html`

  Expected: lines from the new block only (no duplicates).

- [ ] **Step 4: Commit**

  ```bash
  git add landing.html
  git commit -m "feat: product showcase with animated callout chips"
  ```

---

### Task 2: Build and verify

**Files:**
- Run build, check bundle sizes

- [ ] **Step 1: Run the build**

  ```bash
  npm run build
  ```

  Expected: exits 0 with no new errors.

- [ ] **Step 2: Verify init.bundle.js size stays under 30KB**

  ```bash
  ls -lh dist/init.bundle.js
  ```

  Expected: size shown is ≤ 30KB (currently ~23–25KB). The new code is inline HTML — it does NOT go through esbuild, so this number should be unchanged.

- [ ] **Step 3: Verify no chunks exceed 20KB without justification**

  ```bash
  ls -lh dist/chunks/
  ```

  Expected: no new chunks appeared. Existing chunks sizes are unchanged.

- [ ] **Step 4: Open landing.html locally and scroll to #preview**

  Open `landing.html` in a browser (or the Netlify dev server). Scroll to the product preview section.

  Verify:
  - Screenshot renders at full width with rounded corners
  - Top edge of screenshot fades into the dark background (gradient overlay visible)
  - All 3 chips are initially invisible
  - Chips fade+slide into view one by one (~220ms apart) once the section is 20% visible
  - Chips are positioned: DLD Verified top-left, WhatsApp right, AED stats bottom-left
  - Caption reads: "Your page. Your client. Zero portal fees."

- [ ] **Step 5: Test prefers-reduced-motion**

  In Chrome DevTools → Rendering → Emulate CSS media feature → `prefers-reduced-motion: reduce`.

  Expected: all 3 chips are immediately visible with no animation on page load.

- [ ] **Step 6: Commit**

  ```bash
  git add -A
  git commit -m "build: verify bundle sizes unchanged after showcase section"
  ```

  Note: only commit if `git status` shows anything staged. If nothing changed in dist (expected), skip this step.
