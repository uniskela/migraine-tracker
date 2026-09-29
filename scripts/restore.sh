#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ "$#" -ne 1 ]; then echo "Usage: ./scripts/restore.sh /app-data/backups/<archive>.tar.gz (path inside the data volume)" >&2; exit 1; fi
case "$1" in /app-data/backups/*.tar.gz) ;; *) echo "Use an archive path within /app-data/backups/. See docs/restore.md for external archives." >&2; exit 1;; esac
printf "The application and backup service must be stopped. This script stops both before restoring.\n"
docker compose --profile backups stop app backup
docker compose run --rm --no-deps app node dist/server/operations.js restore "$1" --confirm-stopped
printf "Restore verified. Previous data preserved. Start with: docker compose up -d\n"
