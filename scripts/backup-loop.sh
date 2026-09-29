#!/bin/sh
set -eu
# Separate backup container, daily at 03:00 UTC.
trap 'exit 0' TERM INT
while :; do
  delay=$(node -e "const now=new Date(); const next=new Date(now); next.setUTCHours(3,0,0,0); if(next<=now)next.setUTCDate(next.getUTCDate()+1); console.log(Math.ceil((next-now)/1000))")
  sleep "$delay" & wait $! || exit 0
  node /app/dist/server/operations.js backup || printf "Backup failed; check storage and permissions.\n" >&2
done
