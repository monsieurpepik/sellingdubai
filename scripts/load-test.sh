#!/usr/bin/env bash
# Load test runner — SellingDubai critical endpoints
#
# Usage:
#   ./scripts/load-test.sh
#   BASE_URL=https://preview.sellingdubai.com ./scripts/load-test.sh
#
# Required:
#   k6 installed: brew install k6
#
# Optional env vars:
#   BASE_URL         Netlify frontend base URL (default: staging)
#   SUPABASE_URL     Supabase functions base URL (default: prod project, staging data)
#   TEST_AGENT_ID    UUID of seeded test agent (default: placeholder)
#   LOADTEST_TOKEN   Bearer token for send-magic-link (default: empty, skips that test)
#   JSON_OUT         Path for JSON summary output (default: load-test-results.json)
#
# Pre-run setup (one-time):
#   1. deno run --allow-env --allow-net scripts/seed-loadtest-agent.ts
#      → note the printed TEST_AGENT_ID
#   2. export TEST_AGENT_ID=<uuid from step 1>
#   3. Optionally set LOADTEST_TOKEN for send-magic-link testing

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BASE_URL="${BASE_URL:-https://staging.sellingdubai.com}"
SUPABASE_URL="${SUPABASE_URL:-https://pjyorgedaxevxophpfib.supabase.co/functions/v1}"
TEST_AGENT_ID="${TEST_AGENT_ID:-loadtest-agent-uuid-placeholder}"
LOADTEST_TOKEN="${LOADTEST_TOKEN:-}"
JSON_OUT="${JSON_OUT:-${SCRIPT_DIR}/load-test-results.json}"

# Safety guard — never allow production URL as target
if [[ "$BASE_URL" == *"sellingdubai.com"* && "$BASE_URL" != *"staging"* && "$BASE_URL" != *"preview"* && "$BASE_URL" != *"deploy-preview"* ]]; then
  echo "ERROR: BASE_URL looks like production (sellingdubai.com without staging/preview)."
  echo "  Load tests must never target production."
  echo "  Set BASE_URL to a staging or preview URL."
  exit 1
fi

if ! command -v k6 &>/dev/null; then
  echo "ERROR: k6 not found. Install with: brew install k6"
  echo "  or visit: https://k6.io/docs/get-started/installation/"
  exit 1
fi

echo ""
echo "=== SellingDubai Load Test ==="
echo "  Frontend:  $BASE_URL"
echo "  Functions: $SUPABASE_URL"
echo "  Agent ID:  $TEST_AGENT_ID"
echo "  JSON out:  $JSON_OUT"
echo ""

BASE_URL="$BASE_URL" \
SUPABASE_URL="$SUPABASE_URL" \
TEST_AGENT_ID="$TEST_AGENT_ID" \
LOADTEST_TOKEN="$LOADTEST_TOKEN" \
  k6 run \
    --out "json=${JSON_OUT}" \
    "${SCRIPT_DIR}/load-test.js"

echo ""
echo "=== Load test complete. Results written to: $JSON_OUT ==="
echo "Commit LOAD-TEST-RESULTS.md with numbers extracted from that file."
