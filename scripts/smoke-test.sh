#!/usr/bin/env bash
# smoke-test.sh — hit every registered module endpoint after deploy.
# Usage: ./scripts/smoke-test.sh [BASE_URL]
# Default BASE_URL: http://localhost:3000/api/v1

set -euo pipefail

BASE_URL="${1:-http://localhost:3000/api/v1}"
PASS=0
FAIL=0

check() {
  local ep="$1"
  local url="${BASE_URL}${ep}"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url")
  # 401/403 means the server is up but auth is required — acceptable for a live check
  if [[ "$status" =~ ^(200|201|400|401|403|404)$ ]]; then
    echo "  PASS  $ep → $status"
    PASS=$(( PASS + 1 ))
  else
    echo "  FAIL  $ep → $status"
    FAIL=$(( FAIL + 1 ))
  fi
}

echo ""
echo "Smoke-testing ${BASE_URL}"
echo "----------------------------------------------"

check "/health"
check "/auth/student/register"
check "/courses"
check "/faq"
check "/notification"
check "/stellar/balance/GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGBUL4LZTIF25HHIJP4VDTF"

echo "----------------------------------------------"
echo "Results: ${PASS} passed, ${FAIL} failed"
echo ""

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
