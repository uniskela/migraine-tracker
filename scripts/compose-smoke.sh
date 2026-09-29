#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
work=$(mktemp -d /tmp/migraine-compose-XXXXXX)
name="migraine-compose-check-$$"
cleanup() { docker compose --env-file "$work/env" -f "$work/compose.yml" -p "$name" down -v >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT INT TERM
secret=$(openssl rand -hex 32)
printf "APP_ORIGIN=https://tracker.example\nSETUP_SECRET=%s\nHOST_PORT=0\nCOOKIE_SECURE=true\n" "$secret" > "$work/env"
chmod 600 "$work/env"
sed "s|env_file: .env|env_file: $work/env|" docker-compose.yml > "$work/compose.yml"
compose() { docker compose --env-file "$work/env" -f "$work/compose.yml" -p "$name" "$@"; }
compose config --quiet
compose --profile backups up -d --no-build --wait --wait-timeout 120
compose exec -T app node --input-type=module <<'JS'
const origin="https://tracker.example";const r=await fetch("http://localhost:3000/api/auth/setup",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},body:JSON.stringify({username:"compose-owner",password:"compose-test-password",setupSecret:process.env.SETUP_SECRET,timezone:"Australia/Sydney"})});if(r.status!==201)throw Error("Compose setup failed");
const {csrf}=await r.json(); const cookie=r.headers.get("set-cookie").split(";")[0];const e=await fetch("http://localhost:3000/api/episodes",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json",Cookie:cookie,"X-CSRF-Token":csrf},body:JSON.stringify({startedAt:new Date().toISOString(),severity:5,notes:"Compose persistence fixture"})});if(e.status!==201)throw Error("Compose write failed");
JS
compose exec -T app node dist/server/operations.js backup
compose up -d --no-build --force-recreate --wait --wait-timeout 120 app
compose exec -T app node --input-type=module -e 'import Database from "better-sqlite3";const db=new Database("/app-data/database/tracker.sqlite");if(db.prepare("SELECT notes FROM migraine_episodes").get().notes!=="Compose persistence fixture")throw Error("Recreation lost data");db.close();'
compose --profile backups stop app backup
compose run --rm --no-deps -T app node --input-type=module <<'JS'
import {readdirSync} from "node:fs";import Database from "better-sqlite3";import {restore} from "/app/dist/server/operations.js";
const archive=readdirSync("/app-data/backups").find(n=>n.endsWith(".tar.gz"));await restore("/app-data","/app-data/backups/"+archive,true);const db=new Database("/app-data/database/tracker.sqlite");if(db.prepare("SELECT notes FROM migraine_episodes").get().notes!=="Compose persistence fixture")throw Error("Compose restore mismatch");db.close();
JS
compose --profile backups up -d --no-build --wait --wait-timeout 120
printf "Compose verified: fresh deployment, scheduler, health, recreation, actual restore and restart.\n"
