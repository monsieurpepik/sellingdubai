# Phase 4: TypeScript Migration (Client)

**Objective:** Convert all 31 client JS modules to TypeScript, add strict type checking, generate Supabase DB types, and wire `tsc --noEmit` into CI so type errors block PRs.

**Why this matters:** Type safety surfaces bugs at compile time rather than in production. The migration is low-risk because esbuild already handles `.ts` files natively — only file extensions, imports, and a `tsconfig.json` change. Edge functions are already TypeScript; client code must match.

**Output:**
- `tsconfig.json` with strict mode
- `js/globals.d.ts` for esbuild `define` constants and `window` augmentations
- `types/supabase.ts` with generated DB types
- 31 files renamed `.js` → `.ts` with type annotations
- `scripts/build-js.js` updated for `.ts` entry points
- CI `lint` job running `tsc --noEmit`
- Type coverage ≥ 95% documented in `ENGINEERING.md`

**Constraints:**
- No `any` — use `unknown` and narrow
- Zero `@ts-ignore` suppressions
- `init.bundle.js` must stay under 30 KB (renaming to `.ts` adds zero bytes — esbuild strips types)
- BILLING_LIVE patch in `scripts/build-js.js` references `js/pricing.js` by path — that reference must be updated to `js/pricing.ts`
- IIFE scripts loaded directly from HTML (`gtag-init`, `sentry-init`, `async-css`, `cookie-consent`, `sd-config`, `landing-chip-anim`, `landing-behavior`, `pricing`, `dashboard`, `edit`, `join`, `agency-dashboard`, `event-delegation`) need their HTML `<script src>` references updated from `.js` to `.ts`… **but the browser never loads `.ts` directly** — the server serves the original source. For IIFE files loaded raw (not bundled by esbuild), keep the `.js` extension OR serve `.ts` through a build step. See Task 1 for the decision on each file's category.

---

## Task 1: Audit + Categorise All 31 Files

**Files:** (read-only audit — no writes yet)

**Action:**

Run the following to confirm the full file list and categorise each module:

```bash
ls js/*.js | sort
```

Assign every file to one of two categories:

**Category A — esbuild-bundled (rename to `.ts`, types enforced by tsc):**
These files are imported via ES module `import` statements and bundled by esbuild from the two entry points (`js/init.js`, `js/agency-page.js`). They never load directly in the browser as source. Renaming to `.ts` is safe.

Based on the import graph rooted at `js/init.js` and `js/agency-page.js`:
- `config.js` — imported by `init.js`, `agent-page.js`, `agency-page.js`
- `utils.js` — imported by many modules
- `state.js` — imported by `analytics.js`, `agent-page.js`
- `analytics.js` — imported by `agent-page.js`
- `icons.js` — imported by `agent-page.js`
- `components.js` — imported by `properties.js`
- `agent-page.js` — imported by `init.js`
- `agency-page.js` — esbuild entry point
- `properties.js` — lazy-imported by `init.js` via `filters.js`
- `filters.js` — lazy-imported by `init.js`
- `gallery.js` — lazy-imported by `init.js`
- `property-detail.js` — lazy-imported by `init.js`
- `lead-modal.js` — lazy-imported by `init.js`
- `mortgage.js` — lazy-imported by `init.js`
- `mortgage-offplan.js` — imported by or related to `mortgage.js`
- `project-detail.js` — lazy-imported by `init.js`
- `dashboard-bridge.js` — check if it is a thin bridge script for the IIFE `dashboard.js`
- `event-delegation.js` — also imported by `init.js`; but served directly in `edit.html`, `join.html`, `agency-dashboard.html`. For these HTML pages the file is loaded raw, so it cannot be renamed to `.ts` unless those pages use the bundled dist output instead. **Decision:** keep `event-delegation.ts` (rename it), but serve the bundled output for `edit.html`, `join.html`, and `agency-dashboard.html` — OR keep serving the raw file and add a compile step. **Simplest path:** rename to `.ts`, add it as a third esbuild entry point (alongside `init.js` / `agency-page.js`) so it compiles to `dist/event-delegation.bundle.js`, and update the three HTML files to load from `dist/`.

**Category B — IIFE/standalone scripts (loaded raw from HTML, keep `.js` or compile separately):**
These files are not imported by the esbuild graph. They run as plain `<script>` tags. The browser loads them directly, so they must remain valid JS:
- `gtag-init.js` — 5 lines of gtag boilerplate; too small to migrate, add JSDoc types
- `sentry-init.js` — 9 lines; add JSDoc
- `async-css.js` — 4 lines; add JSDoc
- `cookie-consent.js` — IIFE, add JSDoc types
- `sd-config.js` — sets `window.SD_CONFIG`; add JSDoc interface declaration
- `landing-chip-anim.js` — IIFE; add JSDoc
- `landing-behavior.js` — uses `window.SD_CONFIG`; add JSDoc
- `pricing.js` — IIFE; patched by build script at `js/pricing.js`; add JSDoc. **Keep `.js` extension** so the BILLING_LIVE patch regex in `scripts/build-js.js` still works against `js/pricing.js`.
- `dashboard.js` — large IIFE loaded via `<script src="/js/dashboard.js">`; add JSDoc types
- `edit.js` — large IIFE loaded via `<script src="/js/edit.js">`; add JSDoc types
- `join.js` — IIFE; add JSDoc types
- `agency-dashboard.js` — IIFE; add JSDoc types

Verify: For Category A files, run `grep -r "import.*from './" js/ | sort` to confirm the full import graph. For Category B, run `grep -rn "script src.*js/" *.html` to confirm which files load raw.

**Verify:** Print two lists: Category A (will become `.ts`) and Category B (stay `.js` + JSDoc).

**Done:** Every file has a confirmed category. No ambiguous assignments.

---

## Task 2: Foundation — `tsconfig.json`, globals, and Supabase types

**Files:**
- `tsconfig.json` (create)
- `js/globals.d.ts` (create)
- `types/supabase.ts` (create via `supabase gen types`)

**Action:**

### 2a. Create `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noEmit": true,
    "skipLibCheck": true,
    "allowJs": false,
    "isolatedModules": true,
    "esModuleInterop": false,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["js/**/*.ts", "js/globals.d.ts"],
  "exclude": ["node_modules", "dist", "supabase"]
}
```

Notes on each flag:
- `moduleResolution: "bundler"` — matches esbuild's resolution algorithm; required for bare specifiers
- `allowJs: false` — Category B files stay `.js` and are intentionally excluded from `include`
- `noUncheckedIndexedAccess: true` — array indexing returns `T | undefined`; forces index-safety
- `isolatedModules: true` — each file must be independently transpilable; catches re-export patterns that esbuild can't handle
- `skipLibCheck: true` — avoids false positives from third-party `.d.ts` files
- `exactOptionalPropertyTypes: true` — `{a?: string}` does not allow `{a: undefined}`

### 2b. Create `js/globals.d.ts`

This file declares the two esbuild `define` constants and extends the `Window` interface for the globals that Category A modules read or write via `window.*`:

```typescript
// esbuild replaces these at bundle time via --define
declare const __SUPABASE_URL__: string;
declare const __SUPABASE_ANON_KEY__: string;

// Supabase CDN global (loaded via <script> in HTML before the bundle)
declare namespace SupabaseGlobal {
  interface SupabaseClientOptions {
    auth?: Record<string, unknown>;
  }
  interface SupabaseClient {
    from(table: string): unknown;
    // Extend as needed — full types come from types/supabase.ts
  }
  function createClient(url: string, key: string, opts?: SupabaseClientOptions): SupabaseClient;
}
declare const supabase: { createClient: typeof SupabaseGlobal.createClient };

// Window augmentation — globals set by IIFE scripts and read by Category A modules
interface Window {
  // Set by sd-config.js (IIFE)
  SD_CONFIG: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string };

  // Lazy-load entry points set by init.ts and read by event-delegation.ts
  openFullGallery: (() => void) | undefined;
  openPhotoViewer: ((idx: number) => void) | undefined;
  openPropertyDetail: ((propIndex: number) => void) | undefined;
  openPropertyById: ((propId: string) => void) | undefined;
  openLead: (() => void) | undefined;
  openLeadForBrochure: ((projectName: string, brochureUrl: string) => void) | undefined;
  openLeadForProperty: ((propertyTitle: string) => void) | undefined;
  openFilters: (() => void) | undefined;
  openProps: (() => void) | undefined;
  openMortgage: (() => void) | undefined;
  initMortModal: ((opts: unknown) => void) | undefined;
  openProjectDetail: ((slug: string) => void) | undefined;
  closeDetail: (() => void) | undefined;

  // Set by utils.ts for inline onerror handlers
  handleImgError: ((img: HTMLImageElement) => void) | undefined;

  // Analytics / error tracking
  __sdTrackError: ((msg: string, ctx: Record<string, unknown>) => void) | undefined;
  __sd_ga_id: string | undefined;

  // Event delegation targets (set by dashboard.ts / edit.ts IIFE scripts)
  sendMagicLink: (() => void) | undefined;
  showAuthForm: (() => void) | undefined;
  logout: (() => void) | undefined;
  copyProfileLink: (() => void) | undefined;
  dismissOnboarding: (() => void) | undefined;
  openBillingPortal: (() => void) | undefined;
  copyReferralLink: (() => void) | undefined;
  closePropModal: (() => void) | undefined;
  savePropModal: (() => void) | undefined;
  closeDeletePropModal: (() => void) | undefined;
  confirmDeleteProp: (() => void) | undefined;
  deletePropertyConfirm: ((propId: string) => void) | undefined;
  openPropModal: ((propId: string | null) => void) | undefined;
  updatePropStatus: ((propId: string, status: string, el: HTMLElement) => void) | undefined;
  updateLeadStatus: ((leadId: string, status: string, el: HTMLElement) => void) | undefined;
  scrollToProperties: (() => void) | undefined;
  reorderProp: ((propId: string, dir: number) => void) | undefined;
  shareProperty: ((propId: string) => void) | undefined;
  removePropPhoto: ((idx: number) => void) | undefined;
  onPropPhotoPick: ((el: HTMLInputElement) => void) | undefined;
  // Add more as migration proceeds — use `unknown` as return type placeholder if unsure
  [key: string]: unknown;
}
```

The trailing `[key: string]: unknown` index signature avoids TypeScript errors when `event-delegation.ts` does `typeof window.someFn === 'function'` checks. It is permissive but correct — we are not introducing `any`.

### 2c. Generate Supabase types

```bash
supabase gen types typescript --project-id pjyorgedaxevxophpfib > types/supabase.ts
```

If the Supabase CLI is not authenticated locally, run:
```bash
supabase login
supabase gen types typescript --project-id pjyorgedaxevxophpfib > types/supabase.ts
```

Commit `types/supabase.ts` to the repo. Add a comment at the top of the file:
```typescript
// AUTO-GENERATED — do not edit manually.
// Regenerate with: supabase gen types typescript --project-id pjyorgedaxevxophpfib > types/supabase.ts
```

### 2d. Install TypeScript as a devDependency

esbuild handles transpilation but `tsc --noEmit` requires the TypeScript package:

```bash
npm install --save-dev typescript
```

Confirm `"typescript"` appears in `devDependencies` in `package.json`.

**Verify:**
```bash
npx tsc --version
# Should print TypeScript 5.x.x

npx tsc --noEmit
# Will fail (no .ts files yet) — expected. Confirm the error is "No inputs were found"
# or file-not-found errors, NOT a tsconfig parse error.

ls types/supabase.ts
# Must exist and be non-empty
```

**Done:** `tsconfig.json` parses without errors, `js/globals.d.ts` exists, `types/supabase.ts` committed, `typescript` in `devDependencies`.

---

## Task 3: Migrate shared foundation modules (Wave 1)

**Files:**
- `js/config.js` → `js/config.ts`
- `js/utils.js` → `js/utils.ts`
- `js/state.js` → `js/state.ts`
- `js/icons.js` → `js/icons.ts`
- `js/analytics.js` → `js/analytics.ts`

**Action:**

These are the modules imported by everything else. Migrate them first. For each file: rename it (Git rename to preserve history), add type annotations, verify `tsc --noEmit` passes for that file in isolation before moving on.

### 3a. `js/config.ts`

The file uses `window.supabase.createClient`. The `__SUPABASE_URL__` and `__SUPABASE_ANON_KEY__` declares come from `globals.d.ts`.

Key changes:
- Remove `/* global __SUPABASE_URL__, __SUPABASE_ANON_KEY__ */` comment — the `.d.ts` replaces it
- `typeof __SUPABASE_URL__ !== 'undefined'` check can remain; TypeScript sees the constant as `string` (from `globals.d.ts`) but the runtime check is still valid guard
- `window.supabase` is typed via `globals.d.ts`; the return type of `createClient` is `SupabaseClient` (from your globals declaration)
- Export `supabase` with the `SupabaseClient` type from `globals.d.ts`

```typescript
export const DEMO_MODE = false;
export const SUPABASE_URL: string = (typeof __SUPABASE_URL__ !== 'undefined') ? __SUPABASE_URL__ : '';
if (!SUPABASE_URL) {
  console.error('[config] SUPABASE_URL is not set — check your environment variables');
}
export const SUPABASE_ANON_KEY: string = (typeof __SUPABASE_ANON_KEY__ !== 'undefined') ? __SUPABASE_ANON_KEY__ : '';
if (!SUPABASE_ANON_KEY) {
  console.error('[config] SUPABASE_ANON_KEY is not set — check your environment variables');
}
export const CAPTURE_URL = `${SUPABASE_URL}/functions/v1/capture-lead`;
export const LOG_EVENT_URL = `${SUPABASE_URL}/functions/v1/log-event`;
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

### 3b. `js/utils.ts`

Add explicit parameter and return types to all functions:

```typescript
export function escHtml(str: unknown): string { ... }
export function escAttr(str: unknown): string { ... }
export function safeUrl(url: unknown): string { ... }
export function safeTrackingId(id: unknown): string { ... }
export function handleImgError(img: HTMLImageElement): void { ... }
export function getAgentSlug(): string | null { ... }
export function optimizeImg(url: string | null | undefined, w?: number): string { ... }
```

`window.handleImgError = handleImgError` — TypeScript may warn that `window.handleImgError` needs the `HTMLImageElement` type. The `globals.d.ts` already declares it; this assignment is valid.

### 3c. `js/state.ts`

The shared state uses a Supabase agent row. Add a minimal `Agent` interface (full DB types from `types/supabase.ts` can be referenced here):

```typescript
// Import the generated type — adjust the table name to match your schema
import type { Database } from '../types/supabase.ts';
type Agent = Database['public']['Tables']['agents']['Row'];

export type Filters = {
  search: string;
  priceMin: number;
  priceMax: number;
  beds: number;
  baths: number;
  furnishing: string;
  areaMin: number;
  areaMax: number;
  amenities: string[];
};

export let currentAgent: Agent | null = null;
export let allProperties: unknown[] = [];  // Refine to Property type in Task 4
export let currentFilters: Filters = { ... };

export function setCurrentAgent(agent: Agent): void { currentAgent = agent; }
export function setAllProperties(props: unknown[]): void { allProperties = props; }
export function setCurrentFilters(filters: Filters): void { currentFilters = filters; }
export function resetCurrentFilters(): void { currentFilters = { ... }; }
```

If `types/supabase.ts` uses a different table name or structure, inspect the generated file and adjust the import path.

### 3d. `js/icons.ts`

Add explicit type for the exported objects:

```typescript
export const ICONS: Record<string, string> = { ... };
export const FEAT_ICONS: Record<string, string> = { ... };
```

No other changes needed.

### 3e. `js/analytics.ts`

```typescript
import { LOG_EVENT_URL } from './config.ts';
import { currentAgent } from './state.ts';

export function logEvent(eventType: string, metadata: Record<string, unknown>): void { ... }
export async function trackPageView(agentId: string): Promise<void> { ... }
```

The click event listener at the bottom: `e.target` is `EventTarget | null`. Narrow it:
```typescript
document.addEventListener('click', function(e: MouseEvent) {
  const btn = (e.target as Element | null)?.closest('[data-track]');
  if (!btn || !currentAgent) return;
  const trackType = (btn as HTMLElement).dataset.track;
  ...
});
```

**Update all import paths:** After renaming, every file that imported `'./config.js'` must change to `'./config.ts'` (or `'./config'` — either works with `moduleResolution: "bundler"`). Search across all migrated files:
```bash
grep -rn "from './config.js'" js/
```

**Verify:**
```bash
npx tsc --noEmit
# Should now find the 5 migrated files; errors should only come from missing imports
# in files that haven't been migrated yet (expected at this stage).

# Confirm esbuild still bundles successfully:
SUPABASE_URL=https://test.supabase.co SUPABASE_ANON_KEY=test node scripts/build-js.js
# Must complete without error
```

**Done:** 5 shared modules emit zero tsc errors when checked in isolation. Build passes.

---

## Task 4: Migrate leaf modules (Wave 2)

**Files:**
- `js/components.js` → `js/components.ts`
- `js/event-delegation.js` → `js/event-delegation.ts`
- `js/agent-page.js` → `js/agent-page.ts`
- `js/properties.js` → `js/properties.ts`
- `js/filters.js` → `js/filters.ts`
- `js/gallery.js` → `js/gallery.ts`
- `js/property-detail.js` → `js/property-detail.ts`
- `js/lead-modal.js` → `js/lead-modal.ts`
- `js/mortgage.js` → `js/mortgage.ts`
- `js/mortgage-offplan.js` → `js/mortgage-offplan.ts`
- `js/project-detail.js` → `js/project-detail.ts`
- `js/agency-page.js` → `js/agency-page.ts`
- `js/dashboard-bridge.js` → `js/dashboard-bridge.ts` (if it's a bundled module; verify in Task 1)

**Action:**

Migrate each file in order (components first, since properties depends on it; agent-page after config/utils/icons/analytics; agency-page last as the second entry point).

### Per-file guidance:

**`js/components.ts`**
- Imports `escHtml`, `escAttr`, `optimizeImg` from `./utils.ts`
- Define a `Property` type (or import from `types/supabase.ts` if the generated DB types cover it)
- `renderPropertyCard(p: Property, idx: number): string`
- `renderAdminCard(p: Property, idx: number): string` — add the signature for admin card function if it exists
- HTML template strings: return type is `string`

**`js/event-delegation.ts`**
- All DOM event listeners: `e: MouseEvent`, `e: Event`, `e: InputEvent` as appropriate
- `e.target as Element | null` — narrow before calling `.closest()`
- `(el as HTMLElement).dataset.propId` — narrow dataset access
- The `setupManagedImg` function: parameter is `HTMLImageElement`
- `MutationObserver` callback: `mutations: MutationRecord[]`
- After renaming, update `scripts/build-js.js` to add `event-delegation.ts` as a third entry point (see Task 6)
- Update `edit.html`, `join.html`, `agency-dashboard.html` to load from `dist/event-delegation.bundle.js` instead of `/js/event-delegation.ts`

**`js/agent-page.ts`**
- Imports from `./config.ts`, `./utils.ts`, `./icons.ts`, `./analytics.ts`, `./state.ts`, `./properties.ts`
- Functions that set `window.*` globals: type the assignment against `globals.d.ts` declarations
- Supabase query result: `const { data: agent, error }` — if using `supabase.from('agents').select(...).single()`, the result type is `{ data: Agent | null, error: PostgrestError | null }`. The `supabase` client from `globals.d.ts` returns `unknown` — you have two options:
  - Cast: `const result = await (supabase.from('agents').select(...).single() as Promise<{ data: Agent | null; error: unknown }>);`
  - Or add proper Supabase JS types: `npm install --save-dev @supabase/supabase-js` and update `globals.d.ts` to use `SupabaseClient` from the package instead of the hand-rolled declaration. **Prefer this path** — it gives full query result types and integrates with `types/supabase.ts`.

If you install `@supabase/supabase-js` as a devDependency, update `globals.d.ts`:
```typescript
import { createClient } from '@supabase/supabase-js';
declare const supabase: ReturnType<typeof createClient>;
```
Note: This is a type-only dependency. esbuild does NOT bundle `@supabase/supabase-js` — the Supabase client is still loaded via CDN `<script>` tag. The package is used only for its type definitions at compile time. Add to `tsconfig.json` `compilerOptions`: `"types": ["@supabase/supabase-js"]` if needed, or rely on ambient declaration.

**`js/properties.ts`, `js/filters.ts`, `js/gallery.ts`, `js/property-detail.ts`, `js/lead-modal.ts`, `js/project-detail.ts`**
- These are lazy-loaded chunks. Type them fully; esbuild will split them into `dist/chunks/` automatically
- Annotate function parameters, return types, and DOM queries
- `document.getElementById('foo')` returns `HTMLElement | null` — always null-check or assert: `const el = document.getElementById('foo') as HTMLElement;` (only when you're certain it exists from HTML; add a comment: `// exists in index.html`)
- `document.querySelector<HTMLInputElement>('.my-input')` — use generic querySelector for typed results

**`js/mortgage.ts`, `js/mortgage-offplan.ts`**
- These set `window.openMortgage`, `window.initMortModal`, etc. as side-effects
- Type the assigned functions against `globals.d.ts` declarations
- The mortgage calculator does arithmetic — annotate all numeric state as `number`

**`js/agency-page.ts`**
- Second esbuild entry point
- Imports from `./config.ts`
- Uses `supabase.from('agencies')` — apply same Supabase type approach as `agent-page.ts`

### Import path updates

After all renames, update every `import ... from './foo.js'` to `'./foo.ts'` (or just `'./foo'`):

```bash
# Run after all renames to find stragglers
grep -rn "from '\.\/[a-z-]*\.js'" js/
```

**Verify:**
```bash
npx tsc --noEmit
# Target: zero errors from the 13+ files migrated in this task.
# Errors in files not yet migrated (init.ts) are acceptable here.

SUPABASE_URL=https://test.supabase.co SUPABASE_ANON_KEY=test node scripts/build-js.js
# Must complete. Check dist/ output sizes:
ls -lh dist/init.bundle.js  # Must be under 30 KB
ls -lh dist/chunks/         # Each chunk must be under 20 KB
```

**Done:** All 13 leaf modules emit zero tsc errors. Build produces same or smaller chunk sizes.

---

## Task 5: Migrate entry point `init.js` → `init.ts`

**Files:**
- `js/init.js` → `js/init.ts`

**Action:**

`init.js` is the most complex file — it wires all lazy-loaded modules, manages keyboard navigation, focus traps, offline detection, and the core agent-loading flow. Migrate it last in the bundled category.

Key typing challenges:

**Lazy-load module references:**
```typescript
let _gallery: Promise<typeof import('./gallery.ts')> | undefined;
let _propDetail: Promise<typeof import('./property-detail.ts')> | undefined;
let _leadModal: Promise<typeof import('./lead-modal.ts')> | undefined;
let _filters: Promise<typeof import('./filters.ts')> | undefined;
let _projectDetail: Promise<typeof import('./project-detail.ts')> | undefined;
```

**`window.closeDetail` stub:**
```typescript
window.closeDetail = function(): void {
  document.getElementById('detail-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
};
```
The `globals.d.ts` already declares `window.closeDetail?: () => void`. This assignment is valid.

**Keyboard event listeners:**
```typescript
document.addEventListener('keydown', (e: KeyboardEvent) => { ... });
```

**`trapFocus`:**
```typescript
function trapFocus(modal: HTMLElement, e: KeyboardEvent): void {
  const focusable = modal.querySelectorAll<HTMLElement>(
    'input:not([tabindex="-1"]),select,textarea,button:not([disabled]),[tabindex]:not([tabindex="-1"])'
  );
  ...
}
```

**The `init()` function:**
- `supabase.from('agents').select(...).single()` — type the result using `Database['public']['Tables']['agents']['Row']` from `types/supabase.ts`
- `const { data: agent, error }` — if Supabase JS types are installed (from Task 4), this types automatically
- `window.__sdTrackError` — declared in `globals.d.ts` as optional; check before calling: `window.__sdTrackError?.('...', { ... })`

**`showOfflineBanner`:**
```typescript
function showOfflineBanner(show: boolean): void { ... }
```

**`showFeatureError`:**
```typescript
function showFeatureError(featureName: string): void { ... }
```

**After rename**, update `scripts/build-js.js` entry points in Task 6 (done together).

**Verify:**
```bash
npx tsc --noEmit
# Target: zero errors across all migrated files

SUPABASE_URL=https://test.supabase.co SUPABASE_ANON_KEY=test node scripts/build-js.js
ls -lh dist/init.bundle.js   # Must be < 30 KB
```

**Done:** `init.ts` passes tsc. Full build passes. `dist/init.bundle.js` remains under 30 KB.

---

## Task 6: Update build pipeline and HTML references

**Files:**
- `scripts/build-js.js`
- `index.html`
- `edit.html`
- `join.html`
- `agency-dashboard.html`

**Action:**

### 6a. Update `scripts/build-js.js`

Change entry points from `.js` to `.ts`:

```javascript
esbuild.build({
  entryPoints: ['js/init.ts', 'js/agency-page.ts', 'js/event-delegation.ts'],
  ...
});
```

Update the BILLING_LIVE patch to reference `js/pricing.js` (Category B, stays `.js`):
```javascript
const pricingPath = 'js/pricing.js';  // unchanged — pricing.js stays .js
```

No other changes to `scripts/build-js.js` are needed.

### 6b. Update HTML references for `event-delegation`

The three HTML files that load `event-delegation` directly must now load the compiled output:

In `edit.html` (line ~507):
```html
<!-- Before: <script src="/js/event-delegation.js" defer></script> -->
<script src="/dist/event-delegation.bundle.js" defer></script>
```

In `join.html` (line ~297):
```html
<script src="/dist/event-delegation.bundle.js" defer></script>
```

In `agency-dashboard.html` (line ~188):
```html
<script src="/dist/event-delegation.bundle.js" defer></script>
```

Note: `index.html` already loads `init.bundle.js` from `dist/` — `event-delegation.ts` is imported by `init.ts` and gets tree-shaken into the bundle automatically. The HTML does not reference it directly; no change needed for `index.html`.

### 6c. Verify no remaining `js/event-delegation.js` references

```bash
grep -rn "event-delegation.js" *.html
# Must return zero results
```

**Verify:**
```bash
# Full build
SUPABASE_URL=https://test.supabase.co SUPABASE_ANON_KEY=test npm run build

# Confirm output files exist
ls dist/init.bundle.js dist/agency-page.bundle.js dist/event-delegation.bundle.js

# Size check
du -k dist/init.bundle.js | awk '{if($1*1024 > 30720) print "OVER BUDGET: " $1 "KB"; else print "OK: " $1 "KB"}'

# Type check passes
npx tsc --noEmit
```

**Done:** Build produces three top-level bundles. All HTML references point to compiled output. `tsc --noEmit` passes with zero errors.

---

## Task 7: Add JSDoc types to Category B IIFE scripts

**Files:**
- `js/gtag-init.js`
- `js/sentry-init.js`
- `js/async-css.js`
- `js/cookie-consent.js`
- `js/sd-config.js`
- `js/landing-chip-anim.js`
- `js/landing-behavior.js`
- `js/pricing.js`
- `js/dashboard.js`
- `js/edit.js`
- `js/join.js`
- `js/agency-dashboard.js`

**Action:**

Category B files stay as `.js`. They load raw from the browser and are not processed by esbuild. Add JSDoc `@type` and `@param` annotations to improve IDE support and catch obvious type mistakes. These files are NOT checked by `tsc` (they are excluded from `tsconfig.json`'s `include`), so JSDoc is tooling guidance only.

For each file, add a `// @ts-check` comment at the top. This enables per-file TypeScript checking via JSDoc without requiring the file to be `.ts`. This is optional but recommended for the largest IIFE files (`dashboard.js`, `edit.js`, `join.js`).

**`js/dashboard.js`** (highest priority — 17 catch blocks):
- Add `// @ts-check` at top
- Annotate local variables: `/** @type {string | null} */ let currentAgent = null;`
- Annotate function parameters and return types using JSDoc syntax
- The `SD_CONFIG` read: `/** @type {{ SUPABASE_URL: string; SUPABASE_ANON_KEY: string }} */ const config = window.SD_CONFIG;`

**`js/edit.js`** (18 catch blocks):
- Add `// @ts-check`
- Annotate key variables and function signatures
- `fetch` calls: annotate response handling with `/** @type {Response} */`

**`js/join.js`**, **`js/agency-dashboard.js`**:
- Add `// @ts-check`
- Annotate parameters

**Smaller IIFE files** (`gtag-init.js`, `sentry-init.js`, `async-css.js`, `cookie-consent.js`, `sd-config.js`, `landing-chip-anim.js`, `landing-behavior.js`, `pricing.js`):
- Add `// @ts-check` at top
- These are small enough that no further annotation is needed beyond what the runtime already enforces

**Note on `sd-config.js`**: This file has a hardcoded production anon key. This is acceptable for a public-facing anon key (it's intentionally public). Add a comment confirming: `// Public anon key — safe to expose. Rotate in sd-config.js AND js/config.ts simultaneously when rotating.`

**Verify:**
```bash
# For dashboard.js with @ts-check, run the TypeScript language server check:
npx tsc --noEmit --allowJs --checkJs --strict --target ES2020 js/dashboard.js
# Expect: some errors (acceptable — JSDoc is best-effort for IIFE files)
# Goal: no errors of type "object is possibly null" in critical auth paths

# Full tsc pass on Category A files still clean:
npx tsc --noEmit
```

**Done:** All 12 Category B files have `// @ts-check` at top. `dashboard.js` and `edit.js` have JSDoc annotations on all functions with ≥ 3 parameters. Zero regressions in Category A tsc output.

---

## Task 8: Wire CI `lint` job and measure type coverage

**Files:**
- `.github/workflows/ci.yml`
- `package.json`
- `ENGINEERING.md` (create or update)

**Action:**

### 8a. Add `tsc` npm script

In `package.json`, add:
```json
"scripts": {
  ...
  "typecheck": "tsc --noEmit",
  ...
}
```

### 8b. Add `lint` job to CI

Add a new job to `.github/workflows/ci.yml` that runs before `ci` (or in parallel with it, since it only needs Node, not build env vars):

```yaml
  lint:
    name: Type Check
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: TypeScript type check
        run: npm run typecheck
```

Add `lint` to the `needs` array of the `deploy` job so it gates production deploys:
```yaml
  deploy:
    needs: [ci, lint, e2e]
```

Also add `lint` to the `e2e` job's `needs` if e2e should wait on type check:
```yaml
  e2e:
    needs: [ci, lint]
```

### 8c. Measure type coverage

Install `typescript-coverage-report`:
```bash
npm install --save-dev typescript-coverage-report
```

Run coverage measurement:
```bash
npx typescript-coverage-report --threshold 95 --outputDir coverage/types
```

This generates an HTML report and exits non-zero if coverage < 95%.

If the tool reports < 95% coverage, find the uncovered nodes:
```bash
npx typescript-coverage-report --details
```

Address each uncovered node by adding explicit types (no `any`, no `unknown` where a concrete type is possible).

### 8d. Document in `ENGINEERING.md`

Add or update the `## TypeScript` section:

```markdown
## TypeScript

**Status:** All 31 client modules typed. Edge functions were already TypeScript.

**Configuration:**
- `tsconfig.json`: strict mode, ES2020 target, bundler module resolution
- `js/globals.d.ts`: esbuild `define` constants and `Window` augmentations
- `types/supabase.ts`: auto-generated from `supabase gen types typescript --project-id pjyorgedaxevxophpfib`

**Type Coverage:** ≥ 95% (measured with `typescript-coverage-report`)

**CI:** `lint` job runs `tsc --noEmit` on every PR. Type errors block merge and production deploy.

**Rules:**
- No `any` — use `unknown` and narrow with type guards
- Zero `@ts-ignore` suppressions
- Category B IIFE scripts (12 files loaded raw from HTML) use JSDoc `@ts-check` for IDE support

**Regenerating Supabase types after schema changes:**
```bash
supabase gen types typescript --project-id pjyorgedaxevxophpfib > types/supabase.ts
git add types/supabase.ts && git commit -m "chore: regenerate supabase types"
```
```

**Verify:**
```bash
# npm script works
npm run typecheck
# Must exit 0

# Coverage
npx typescript-coverage-report --threshold 95
# Must exit 0 (≥ 95% coverage)

# Confirm CI yaml parses
cat .github/workflows/ci.yml | python3 -c "import sys, yaml; yaml.safe_load(sys.stdin); print('YAML valid')"
# Or: npx js-yaml .github/workflows/ci.yml
```

**Done:** `npm run typecheck` passes. CI has a `lint` job. Type coverage ≥ 95% measured and documented in `ENGINEERING.md`. The `deploy` job's `needs` includes `lint`.

---

## Final Verification

Run these commands in order. Every command must exit 0.

```bash
# 1. Full type check — zero errors
npx tsc --noEmit

# 2. Build succeeds
SUPABASE_URL=https://pjyorgedaxevxophpfib.supabase.co SUPABASE_ANON_KEY=test npm run build

# 3. Bundle sizes within budget
node -e "
const fs = require('fs');
const init = fs.statSync('dist/init.bundle.js').size;
console.log('init.bundle.js:', (init/1024).toFixed(1), 'KB', init > 30720 ? 'OVER BUDGET' : 'OK');
const chunks = fs.readdirSync('dist/chunks').filter(f => f.endsWith('.js'));
chunks.forEach(f => {
  const s = fs.statSync('dist/chunks/' + f).size;
  console.log('chunks/' + f + ':', (s/1024).toFixed(1), 'KB', s > 20480 ? 'OVER BUDGET' : 'OK');
});
"

# 4. No @ts-ignore in any .ts file
grep -rn "@ts-ignore" js/*.ts && echo "FAIL: @ts-ignore found" || echo "OK: zero @ts-ignore"

# 5. No `any` type in migrated files (warnings — review each hit)
grep -rn ": any" js/*.ts && echo "REVIEW: explicit any found — replace with unknown or concrete type" || echo "OK: no explicit any"

# 6. Type coverage
npx typescript-coverage-report --threshold 95

# 7. No remaining .js imports from .ts files
grep -rn "from '\.\/[a-z-]*\.js'" js/*.ts && echo "FAIL: .js imports in .ts files" || echo "OK"

# 8. event-delegation dist output exists
ls dist/event-delegation.bundle.js

# 9. No HTML files reference raw event-delegation.js
grep -rn "event-delegation.js" *.html && echo "FAIL" || echo "OK"

# 10. Supabase types file committed
ls types/supabase.ts
```

---

## Migration Order Summary

| Wave | Files | Category | Dependency |
|------|-------|----------|------------|
| 0 | `tsconfig.json`, `js/globals.d.ts`, `types/supabase.ts` | Foundation | None |
| 1 | `config.ts`, `utils.ts`, `state.ts`, `icons.ts`, `analytics.ts` | Shared | Wave 0 |
| 2 | `components.ts`, `event-delegation.ts`, `agent-page.ts`, `properties.ts`, `filters.ts`, `gallery.ts`, `property-detail.ts`, `lead-modal.ts`, `mortgage.ts`, `mortgage-offplan.ts`, `project-detail.ts`, `agency-page.ts`, `dashboard-bridge.ts` | Leaf modules | Wave 1 |
| 3 | `init.ts` | Entry point | Wave 2 |
| 4 | `scripts/build-js.js` update, HTML reference updates | Build pipeline | Wave 3 |
| 5 | Category B JSDoc (`dashboard.js`, `edit.js`, `join.js`, et al.) | IIFE scripts | Wave 0 |
| 6 | CI `lint` job, coverage measurement, `ENGINEERING.md` | CI / Docs | Wave 4 |

Waves 0 and 5 can run in parallel. Waves 1–4 are strictly sequential (each depends on the previous). Wave 6 requires Wave 4 to be complete.
