#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

if command -v docker >/dev/null 2>&1; then
  docker compose up --build
else
  echo "Docker is required but was not found in PATH." >&2
  exit 1
fi
