#!/usr/bin/env bash
set -euo pipefail

IMAGE="${IMAGE:-ghcr.io/gen-x-academy/chainverse-backend:latest}"
REMOTE_HOST="${REMOTE_HOST:-}"
REMOTE_USER="${REMOTE_USER:-ubuntu}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/opt/chainverse-backend}"
SMOKE_TEST_URL="${SMOKE_TEST_URL:-http://localhost:3000}"

if [[ -z "$REMOTE_HOST" ]]; then
  echo "REMOTE_HOST is required" >&2
  exit 1
fi

ssh "${REMOTE_USER}@${REMOTE_HOST}" <<EOF
set -euo pipefail
cd "${REMOTE_APP_DIR}"
docker pull "${IMAGE}"
docker compose up -d
bash ./scripts/smoke-test.sh "${SMOKE_TEST_URL}"
EOF
