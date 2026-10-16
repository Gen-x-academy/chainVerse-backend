#!/usr/bin/env bash
set -euo pipefail

REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
HOST_PORT="${REDIS_URL#redis://}"
HOST_PORT="${HOST_PORT#rediss://}"
HOST="${HOST_PORT%%:*}"
PORT="${HOST_PORT##*:}"

if ! command -v redis-cli >/dev/null 2>&1; then
  echo "redis-cli is required" >&2
  exit 1
fi

redis-cli -h "${HOST:-localhost}" -p "${PORT:-6379}" ping | grep -q PONG
echo "Redis health check passed for ${REDIS_URL}"

