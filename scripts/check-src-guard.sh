#!/usr/bin/env bash
set -euo pipefail

forbidden=$(git ls-files 'src/**/*.php' 'src/**/composer.json' 'src/**/composer.lock' || true)

if [ -n "$forbidden" ]; then
  echo "Non-NestJS artifacts detected under src/:" >&2
  echo "$forbidden" >&2
  echo "This repo is TypeScript/NestJS only. Remove PHP or Symfony projects from src/." >&2
  exit 1
fi

echo "No forbidden artifacts under src/"
