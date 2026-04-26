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

# ── Gate 1. Build ─────────────────────────────────────────────────────────────
echo -e "${BOLD}Gate 1. Build${NC}"
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

# ── Gate 2. Hardcoded prod URLs ───────────────────────────────────────────────
echo -e "${BOLD}Gate 2. Hardcoded prod URLs${NC}"
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

# ── Gate 2b. Broken Netlify Image CDN URLs (local path passed as url= param) ──
echo -e "${BOLD}Gate 2b. Broken CDN image URLs${NC}"
# Pattern: /.netlify/images?url=/ — means a local path was passed, not a full https:// URL.
# This results in a broken image in production. All CDN URLs must use an absolute https:// source.
BROKEN_CDN=$(grep -rn '\.netlify/images?url=/' \
  --include="*.html" --include="*.css" --include="*.js" --include="*.ts" \
  . \
  | grep -v "node_modules" | grep -v "dist/" | grep -v "\.worktrees/" | head -10 || true)
if [ -n "$BROKEN_CDN" ]; then
  fail "Broken Netlify Image CDN URL — url= param must be an absolute https:// path, not a local path:"
  echo "$BROKEN_CDN" | sed 's/^/    /'
else
  pass "No broken Netlify CDN local-path URLs found"
fi
echo ""

# ── Gate 3. Edge function coverage ───────────────────────────────────────────
# Every function in edge-functions/ must have a matching entry in supabase/functions/.
# Missing entries mean the function can't be deployed via `supabase functions deploy`.
echo -e "${BOLD}Gate 3. Edge function coverage${NC}"
MISSING_SYMLINKS=""
for fn_dir in edge-functions/*/; do
  fn_name=$(basename "$fn_dir")
  # Skip shared helpers and build artifacts
  [[ "$fn_name" == "_shared" ]] && continue
  [[ "$fn_name" == "node_modules" ]] && continue
  # Only check directories that contain an index.ts (actual deployable functions)
  [ -f "edge-functions/${fn_name}/index.ts" ] || continue
  if [ ! -d "supabase/functions/${fn_name}" ]; then
    MISSING_SYMLINKS="${MISSING_SYMLINKS}\n    ${fn_name}"
  fi
done
if [ -n "$MISSING_SYMLINKS" ]; then
  fail "Functions in edge-functions/ with no supabase/functions/ entry (cannot be deployed):$MISSING_SYMLINKS"
else
  pass "All edge functions have a supabase/functions/ entry"
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
