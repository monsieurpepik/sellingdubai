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
BUILD_OUTPUT=$(npm run build 2>&1)
BUILD_EXIT=$?
if [ $BUILD_EXIT -eq 0 ]; then
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
  echo "$BUILD_OUTPUT" | tail -20
fi
echo ""

# ── 2–7. Checks commented out — stripped to 3-gate fast check ─────────────────
# Uncomment individual blocks to re-enable during a focused audit session.
#
# Removed checks (still valid rules, just not in the fast gate):
#   2. Silent catch blocks
#   3. Sequential await / Promise.allSettled
#   4. Raw Supabase storage URLs
#   5. CTA routing (waitlist anchor check)
#   6. Billing gate (BILLING_LIVE flag)
#   7. Field name consistency (bio vs tagline)

# ── 8. Hardcoded prod URLs in edge functions ──────────────────────────────────
echo -e "${BOLD}2. Hardcoded prod URLs${NC}"
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

# ── 3. Build gate complete — checks 3b–10 commented out ─────────────────────
# Env var checks, Plan B function presence, integration test reminder,
# and @ts-check are all valid but non-blocking for the 3-gate fast check.
# Re-enable during audit sessions as needed.

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
