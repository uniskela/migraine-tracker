#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
docker compose exec -T app node dist/server/operations.js backup
