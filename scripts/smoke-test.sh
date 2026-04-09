#!/usr/bin/env bash
# Post-deploy smoke test — verifies key pages and edge function endpoints respond.
# Runs after every production deploy. Fails the CI job on any 5xx or unreachable URL.
#
# Required env:
#   SMOKE_BASE_URL       e.g. https://sellingdubai.ae
#   SMOKE_SUPABASE_URL   e.g. https://xxx.supabase.co

set -euo pipefail

BASE="${SMOKE_BASE_URL:?SMOKE_BASE_URL not set}"
SB="${SMOKE_SUPABASE_URL:?SMOKE_SUPABASE_URL not set}"
PASS=0
FAIL=0

check() {
  local label="$1"
  local url="$2"
  local expected_range="${3:-2}"   # first digit of expected HTTP status (2 = 2xx)

  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$url")
  local first="${status:0:1}"

  if [[ "$first" == "$expected_range" ]]; then
    echo "  PASS  [$status] $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  [$status] $label — expected ${expected_range}xx  ($url)"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "=== Smoke Test: $BASE ==="
echo ""

echo "-- Static pages --"
check "Homepage"         "$BASE/"
check "Join page"        "$BASE/join.html"
check "Dashboard"        "$BASE/dashboard.html"
check "Pricing"          "$BASE/pricing.html"

echo ""
echo "-- Edge functions (expect 4xx — no auth provided) --"
# These should return 400/401/405, not 500/502. A 5xx here means the function
# crashed on startup (bad deploy, missing env var, syntax error, etc.).
check "capture-lead-v4"       "$SB/functions/v1/capture-lead-v4"       "4"
check "send-magic-link"       "$SB/functions/v1/send-magic-link"        "4"
check "verify-magic-link"     "$SB/functions/v1/verify-magic-link"      "4"
check "create-checkout"       "$SB/functions/v1/create-checkout"        "4"
check "manage-properties"     "$SB/functions/v1/manage-properties"      "4"
check "get-analytics"         "$SB/functions/v1/get-analytics"          "4"
check "lead-nudger (health)"  "$SB/functions/v1/lead-nudger?secret=INVALID"               "4"
check "cobroke-discover"      "$SB/functions/v1/cobroke-discover"                          "4"

# v2.0 Phase 3 — AI Secretary + Telegram
# ai-secretary — OPTIONS should return 200
check "ai-secretary OPTIONS"         "$SB/functions/v1/ai-secretary"        "2"
# telegram-webhook — GET with no secret → 200 (Telegram always expects 200)
check "telegram-webhook GET"         "$SB/functions/v1/telegram-webhook"    "2"
# verify-telegram-init — OPTIONS should return 200
check "verify-telegram-init OPTIONS" "$SB/functions/v1/verify-telegram-init" "2"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
echo ""

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
