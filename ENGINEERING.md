# Engineering Reference

## TypeScript Setup

The project uses TypeScript 6.0.2 in strict mode for all Category A (esbuild-bundled) modules.

### Type checking

```bash
npm run typecheck   # runs tsc --noEmit — fails on any type error
```

Run this before every deploy. The `pre-deploy-check.sh` script also calls it.

### Configuration

`tsconfig.json` at repo root. Key settings:

| Setting | Value | Why |
|---|---|---|
| `strict` | `true` | Enables all strict checks |
| `noUncheckedIndexedAccess` | `true` | Array/Record access returns `T \| undefined` |
| `exactOptionalPropertyTypes` | `true` | Optional props cannot be set to `undefined` explicitly |
| `moduleResolution` | `"bundler"` | Matches esbuild's module resolution |
| `noEmit` | `true` | esbuild handles transpilation — tsc is type-check only |

### File categories

**Category A — TypeScript (esbuild-bundled):** All modules under `js/` that are entry points or imported by entry points via ES `import`. These are `.ts` files, type-checked by `tsc --noEmit` and bundled by `esbuild`.

Entry points: `js/init.ts`, `js/agency-page.ts`, `js/event-delegation.ts`

**Category B — JS with @ts-check (IIFE / standalone):** Standalone scripts loaded via `<script>` tags. These remain `.js` files but have `// @ts-check` at the top and JSDoc annotations on key variables. Checked by the TypeScript language server in editors; not part of the `tsc --noEmit` pass.

Category B files: `js/dashboard.js`, `js/edit.js`, `js/join.js`, `js/agency-dashboard.js`, `js/pricing.js`, `js/landing-behavior.js`, `js/landing-chip-anim.js`, `js/cookie-consent.js`, `js/sd-config.js`, `js/gtag-init.js`, `js/sentry-init.js`, `js/async-css.js`

### Type coverage target

**>= 95% of Category A lines are type-annotated.** The remaining ~5% are necessary `as unknown as T` double-casts for Supabase `Json` columns (facilities, nearby_locations) and partial select results that are narrower than the full generated Row type.

### Common patterns

**Supabase Json columns to typed arrays:**
```typescript
const facilities: Facility[] = Array.isArray(row.facilities) && row.facilities.length
  ? row.facilities as unknown as Facility[] : [];
```

**Columns not in generated DB types (e.g. land_area):**
```typescript
const ext = result as Property & { land_area?: number | null };
```

**Partial select result cast:**
```typescript
const agent = data as unknown as Agent;
```

**noUncheckedIndexedAccess fallbacks:**
```typescript
const icon = ICONS[key] ?? '';
const first = arr[0] ?? defaultValue;
```

**Timer types:**
```typescript
let timer: ReturnType<typeof setTimeout> | null = null;
```

**Lazy module refs:**
```typescript
let _mod: Promise<unknown> | null = null;
```

### Rotating the Supabase anon key

The public anon key appears in two places — update both simultaneously:

1. `js/sd-config.js` — `window.SD_CONFIG.SUPABASE_ANON_KEY`
2. `js/config.ts` — `export const SUPABASE_ANON_KEY`

The anon key is safe to expose (it is a public read-only key scoped by RLS policies).
