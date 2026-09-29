#!/bin/sh
set -eu
# Dedicated worker: initial backup, then daily at 03:00 UTC.
exec node /app/dist/server/backup-worker.js
