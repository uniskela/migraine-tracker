#!/bin/sh
set -eu
image=${1:-migraine-tracker:local}
name="migraine-smoke-$$"
volume="$name-data"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; docker volume rm "$volume" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
secret=$(openssl rand -hex 32)
docker volume create "$volume" >/dev/null
start() {
  docker run -d --name "$name" --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges --mount "source=$volume,target=/app-data" -e APP_ORIGIN=https://tracker.example -e SETUP_SECRET="$secret" "$image" >/dev/null
  i=0
  until docker exec "$name" node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; do
    i=$((i+1)); [ "$i" -lt 30 ] || exit 1; sleep 1
  done
}
start
docker exec -i -e TEST_SETUP_SECRET="$secret" "$name" node --input-type=module <<'JS'
const r=await fetch("http://localhost:3000/api/auth/setup",{method:"POST",headers:{Origin:"https://tracker.example","Content-Type":"application/json"},body:JSON.stringify({username:"smoke",password:"isolated-smoke-password",setupSecret:process.env.TEST_SETUP_SECRET,timezone:"Australia/Sydney"})}); if(r.status!==201)throw Error("Setup failed");
const {csrf}=await r.json(); const cookie=r.headers.get("set-cookie").split(";")[0];
const e=await fetch("http://localhost:3000/api/episodes",{method:"POST",headers:{Origin:"https://tracker.example","Content-Type":"application/json",Cookie:cookie,"X-CSRF-Token":csrf},body:JSON.stringify({startedAt:new Date().toISOString(),severity:6,notes:"isolated persistence fixture"})}); if(e.status!==201)throw Error("Episode failed");
JS
docker exec "$name" node dist/server/operations.js backup
docker stop "$name" >/dev/null
docker rm "$name" >/dev/null
start
docker exec "$name" node --input-type=module -e 'import Database from "better-sqlite3";const db=new Database("/app-data/database/tracker.sqlite");if(db.prepare("SELECT count(*) AS n FROM migraine_episodes").get().n!==1)throw Error("Persistence failed");db.close();'
docker stop "$name" >/dev/null
docker rm "$name" >/dev/null
docker run --rm -i --mount "source=$volume,target=/app-data" --entrypoint node "$image" --input-type=module <<'JS'
import {readdirSync} from "node:fs";import Database from "better-sqlite3";import {restore} from "/app/dist/server/operations.js";
const archive=readdirSync("/app-data/backups").find(n=>n.endsWith(".tar.gz"));await restore("/app-data","/app-data/backups/"+archive,true);
const db=new Database("/app-data/database/tracker.sqlite");if(db.prepare("SELECT notes FROM migraine_episodes").get().notes!=="isolated persistence fixture")throw Error("Restore mismatch");if(db.pragma("integrity_check",{simple:true})!=="ok")throw Error("Integrity failed");db.close();
JS
printf "Docker smoke passed: fresh setup, health, write, recreation, backup, verified restore.\n"
