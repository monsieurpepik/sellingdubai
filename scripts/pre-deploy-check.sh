#!/usr/bin/env bash
# scripts/pre-deploy-check.sh — SellingDubai pre-deploy gate
#
# Run this before every deploy. It enforces the load-bearing rules in CLAUDE.md.
# Exit code 0 = safe to deploy. Exit code 1 = blocked.
#
# Usage: bash scripts/pre-deploy-check.sh
# Add to CI: this script is intentionally self-contained with no extra deps.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Load SUPABASE_URL and SUPABASE_ANON_KEY from .env if present (for local builds)
# We extract only these two keys to avoid bash choking on values with < > & etc.
if [ -f "$ROOT/.env" ]; then
  _val=$(grep -E '^SUPABASE_URL=' "$ROOT/.env" | head -1 | cut -d= -f2-)
  [ -n "$_val" ] && export SUPABASE_URL="$_val"
  _val=$(grep -E '^SUPABASE_ANON_KEY=' "$ROOT/.env" | head -1 | cut -d= -f2-)
  [ -n "$_val" ] && export SUPABASE_ANON_KEY="$_val"
  unset _val
fi

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BOLD='\033[1m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

fail()  { echo -e "  ${RED}✗ FAIL${NC}  $1"; ERRORS=$((ERRORS+1)); }
warn()  { echo -e "  ${YELLOW}⚠ WARN${NC}  $1"; WARNINGS=$((WARNINGS+1)); }
pass()  { echo -e "  ${GREEN}✓ PASS${NC}  $1"; }

echo -e "${BOLD}=== SellingDubai Pre-Deploy Check ===${NC}"
echo ""

# ── 1. Build ──────────────────────────────────────────────────────────────────
echo -e "${BOLD}1. Build${NC}"
if npm run build --silent 2>/dev/null; then
  # Bundle size check (30KB = 30720 bytes)
  BUNDLE_BYTES=$(wc -c < dist/init.bundle.js 2>/dev/null | tr -d ' ')
  BUNDLE_KB=$(echo "scale=1; ${BUNDLE_BYTES:-0}/1024" | bc)
  if [ "${BUNDLE_BYTES:-0}" -gt 30720 ]; then
    fail "init.bundle.js is ${BUNDLE_KB}KB — exceeds 30KB budget. Split the module."
  else
    pass "init.bundle.js is ${BUNDLE_KB}KB (budget: 30KB)"
  fi

  # Check no hashed chunk exceeds 20KB (CLAUDE.md rule)
  OVERSIZED=""
  for chunk in dist/chunks/*.js; do
    [ -f "$chunk" ] || continue
    SIZE=$(wc -c < "$chunk" | tr -d ' ')
    if [ "$SIZE" -gt 20480 ]; then
      OVERSIZED="${OVERSIZED}\n    $(basename $chunk): $(echo "scale=1; $SIZE/1024" | bc)KB"
    fi
  done
  if [ -n "$OVERSIZED" ]; then
    warn "Chunks exceeding 20KB (document in DECISIONS.md if intentional):$OVERSIZED"
  else
    pass "All chunks within 20KB budget"
  fi
else
  fail "npm run build failed — fix build errors before deploying"
fi
echo ""

# ── 2. Silent catch blocks ────────────────────────────────────────────────────
echo -e "${BOLD}2. Error observability${NC}"
SILENT=$(grep -Ern 'catch\s*\([^)]*\)\s*\{\s*\}' js/ edge-functions/ \
  --include="*.js" --include="*.ts" \
  --exclude-dir=node_modules --exclude-dir=.deno 2>/dev/null || true)
if [ -n "$SILENT" ]; then
  fail "Silent catch blocks swallow errors with no log:"
  echo "$SILENT" | sed 's/^/    /'
else
  pass "No silent catch blocks"
fi
echo ""

# ── 3. Blocking / sequential awaits ──────────────────────────────────────────
echo -e "${BOLD}3. Sequential await (blocking calls)${NC}"
# CLAUDE.md rule: edge function calls on page load must use Promise.allSettled(), never await in sequence.
# Heuristic: two consecutive lines both starting with `const/let ... = await` in the same file.
BLOCKING=$(awk '
  /^\s*(const|let)\s+\S+\s*=\s*await\s/ {
    if (prev_await) { print FILENAME ":" NR ": " $0 }
    prev_await = NR
    next
  }
  # Reset if there is a blank line or non-await line between them
  /^\s*$/ { prev_await = 0; next }
  { prev_await = 0 }
' js/init.js js/app.js 2>/dev/null || true)
if [ -n "$BLOCKING" ]; then
  warn "Consecutive await expressions — confirm these are intentional and not page-load calls:"
  echo "$BLOCKING" | sed 's/^/    /'
else
  pass "No consecutive sequential awaits in init/app entry points"
fi

# Specifically look for missing Promise.allSettled in edge function calls at module scope
MISSING_SETTLED=$(grep -n "await fetch\|await supabase" js/init.js js/app.js 2>/dev/null \
  | grep -v "Promise\." | grep -v "await-ok" | head -5 || true)
if [ -n "$MISSING_SETTLED" ]; then
  warn "Direct 'await fetch/supabase' at page load — should be wrapped in Promise.allSettled():"
  echo "$MISSING_SETTLED" | sed 's/^/    /'
fi
echo ""

# ── 4. Raw Supabase storage URLs ──────────────────────────────────────────────
echo -e "${BOLD}4. Image CDN compliance${NC}"
# Only flag direct links to Supabase storage — NOT ones already wrapped in /.netlify/images?url=
RAW_STORAGE=$(grep -Ern 'src=["'"'"']https://[^"'"'"']*supabase\.co/storage|href=["'"'"']https://[^"'"'"']*supabase\.co/storage' \
  *.html js/ --include="*.html" --include="*.js" 2>/dev/null \
  | grep -v '\.netlify/images' || true)
if [ -n "$RAW_STORAGE" ]; then
  fail "Raw Supabase storage URLs found — must use Netlify Image CDN (/.netlify/images?url=...):"
  echo "$RAW_STORAGE" | sed 's/^/    /'
else
  pass "No raw Supabase storage URLs"
fi
echo ""

# ── 5. CTA routing ────────────────────────────────────────────────────────────
echo -e "${BOLD}5. CTA routing${NC}"
# Check index.html and the main CTA pages — landing.html has its own #waitlist section (valid)
WAITLIST_ANCHORS=$(grep -Ern 'href="/#hero-waitlist|href="#hero' \
  index.html join.html dashboard.html 2>/dev/null || true)
if [ -n "$WAITLIST_ANCHORS" ]; then
  fail "CTAs pointing to old waitlist anchors — must point to /join:"
  echo "$WAITLIST_ANCHORS" | sed 's/^/    /'
else
  pass "No CTAs pointing to old waitlist anchors"
fi
echo ""

# ── 6. Billing gate ───────────────────────────────────────────────────────────
echo -e "${BOLD}6. Billing gate${NC}"
BILLING_LINE=$(grep -n "const BILLING_LIVE" pricing.html 2>/dev/null || true)
if echo "$BILLING_LINE" | grep -q "= true"; then
  warn "BILLING_LIVE = true — confirm Stripe price IDs are set in Netlify env vars"
elif echo "$BILLING_LINE" | grep -q "= false"; then
  pass "BILLING_LIVE = false (billing not yet open — intentional)"
else
  warn "Could not determine BILLING_LIVE status in pricing.html"
fi
echo ""

# ── 7. Field name consistency ─────────────────────────────────────────────────
echo -e "${BOLD}7. Field name consistency${NC}"
# Check for the bio/tagline mismatch documented in CLAUDE.md
BIO_IN_JOIN=$(grep -c '"bio"' join.html 2>/dev/null || true)
TAGLINE_IN_DASH=$(grep -c '"tagline"' dashboard.html 2>/dev/null || true)
BIO_IN_JOIN=${BIO_IN_JOIN:-0}
TAGLINE_IN_DASH=${TAGLINE_IN_DASH:-0}
if [ "${BIO_IN_JOIN}" -gt 0 ] 2>/dev/null && [ "${TAGLINE_IN_DASH}" -gt 0 ] 2>/dev/null; then
  fail "Field name mismatch: join.html uses 'bio' but dashboard.html uses 'tagline' — onboarding checklist will break"
else
  pass "No bio/tagline field name mismatch detected"
fi
echo ""

# ── 8. Hardcoded prod URLs in edge functions ──────────────────────────────────
echo -e "${BOLD}8. Edge function hygiene${NC}"
HARDCODED_PROD=$(grep -rn "pjyorgedaxevxophpfib\.supabase\.co" \
  edge-functions/ --include="*.ts" js/ --include="*.js" \
  | grep -v "\.test\.\|index\.test\." | grep -v "_shared" | grep -v "__SD_SUPABASE_URL__" | head -5 || true)
if [ -n "$HARDCODED_PROD" ]; then
  warn "Hardcoded prod Supabase URL in edge functions (use Deno.env.get('SUPABASE_URL') instead):"
  echo "$HARDCODED_PROD" | sed 's/^/    /'
else
  pass "No hardcoded prod URLs in edge functions"
fi

# Check supabase/.env not set to prod (ensure dev.sh guardrail wasn't bypassed)
PROD_URL="https://pjyorgedaxevxophpfib.supabase.co"
if grep -q "SUPABASE_URL=${PROD_URL}" supabase/.env 2>/dev/null; then
  warn "supabase/.env has SUPABASE_URL pointing to PRODUCTION — local functions are hitting prod data"
fi
echo ""

# ── 9. Integration test reminder ─────────────────────────────────────────────
echo -e "${BOLD}9. Integration tests${NC}"
if grep -q "127.0.0.1" supabase/.env 2>/dev/null; then
  warn "Local env detected — run 'npm run test:functions' against the local stack before deploying"
else
  pass "Integration test reminder: run 'npm run test:functions' if local stack is running"
fi
echo ""

# ── 10. @ts-check on Category B JS files ────────────────────────────────────
echo -e "${BOLD}10. @ts-check on Category B JS files${NC}"
echo "--- Check 10: @ts-check on Category B JS files ---"
TSCHECK_FAIL=0
for js_file in js/*.js; do
  base="${js_file%.js}"
  if [ ! -f "${base}.ts" ]; then
    first_line=$(head -1 "$js_file")
    if [ "$first_line" != "// @ts-check" ]; then
      echo "FAIL: $js_file is missing '// @ts-check' on line 1"
      TSCHECK_FAIL=1
    fi
  fi
done
if [ "$TSCHECK_FAIL" -eq 0 ]; then
  echo "PASS: all Category B JS files have @ts-check"
  pass "@ts-check present on all Category B JS files"
else
  fail "One or more Category B JS files are missing '// @ts-check' on line 1"
fi
echo ""

# ── Summary ───────────────────────────────────────────────────────────────────
echo "══════════════════════════════════════"
if [ "$ERRORS" -gt 0 ]; then
  echo -e "${RED}${BOLD}BLOCKED${NC} — ${ERRORS} error(s), ${WARNINGS} warning(s). Fix errors before deploying."
  exit 1
elif [ "$WARNINGS" -gt 0 ]; then
  echo -e "${YELLOW}${BOLD}WARNINGS${NC} — ${WARNINGS} warning(s). Review before deploying."
  exit 0
else
  echo -e "${GREEN}${BOLD}ALL CHECKS PASSED${NC} — safe to deploy."
  exit 0
fi
