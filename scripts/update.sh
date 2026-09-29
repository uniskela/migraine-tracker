#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
docker compose config --quiet
./scripts/backup.sh
git pull --ff-only
docker compose pull
docker compose up -d --wait --wait-timeout 120
printf "Update healthy. Migrations succeeded. No automatic data rollback was attempted.\n"
