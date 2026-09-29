# Restore and disaster recovery

Restore is an administrative CLI operation, never a public web endpoint.

## Existing installation

```sh
./scripts/restore.sh "/app-data/backups/migraine-tracker-2026-09-28T23-00-00-000Z-example.tar.gz"
```

Replace the example filename with your actual archive filename. The path is **inside the application volume**, not a host `/backups` path. The script warns and stops both the app and backup scheduler, then runs a disposable container sharing the volume. It:

1. Lists archive members; only regular `manifest.json` and `tracker.sqlite` are allowed. No symlinks, traversal paths, duplicate members or extra files.
2. Validates format/version, SHA-256 checksum, expected tables, SQLite integrity and foreign keys in a temporary directory before touching current data.
3. Creates a consistent safety archive if a current database exists. If this fails, replacement does not proceed.
4. Stages the replacement on the target filesystem and removes restored sessions/OIDC transactions.
5. Preserves the complete former database directory (including WAL) as `/app-data/database-before-restore-<timestamp>` and atomically renames the replacement into place.
6. Reports success only after restored integrity validation. Leaves the app stopped for your review.

Restart, sign in, and verify real records and reports:

```sh
docker compose up -d --wait
# Or, if using the backup container:
docker compose --profile backups up -d --wait
```

Never run the operations CLI restore while an app/backup process is using the database. The explicit `--confirm-stopped` CLI flag is an operator assertion, not an automatic cross-container lock. The supplied shell wrapper enforces shutdown of both Compose services.

## Total host loss / new host

1. Install Docker/Compose, clone the source revision compatible with the backup, and restore your encrypted `.env` and reverse-proxy configuration.
2. Pull the selected recovery release: `docker compose pull`. Keep the same origin or correctly update APP_ORIGIN/OIDC_REDIRECT_URI and provider settings.
3. Create the named volume with `docker compose create app` (do not start the app).
4. Copy your archive into the created container/volume: `docker compose cp "./migraine-tracker-2026-09-28T23-00-00-000Z-example.tar.gz" app:"/app-data/backups/migraine-tracker-2026-09-28T23-00-00-000Z-example.tar.gz"`.
5. Docker copy may set root ownership. Fix just the copied archive using a one-off root container: `docker compose run --rm --no-deps --user root app chown 1000:1000 "/app-data/backups/migraine-tracker-2026-09-28T23-00-00-000Z-example.tar.gz"`.
6. Run the restore wrapper with the internal path. No safety backup is necessary if there is no existing database; restore still validates everything first.
7. Start with `docker compose up -d --wait`. Startup applies any forward migrations from this revision. Never use an older application against a newer schema.
8. Sign in using the restored owner credentials. All old browser sessions are intentionally invalidated. Verify a known episode, medication dose, side effect and report; compare against retained export/backup records.
9. Enable your scheduler and make a new off-host backup.

For a bind mount, copy the archive into its backups directory and give only that file UID/GID 1000 ownership with mode 0600.

## Portable JSON migration

A full JSON export excludes credentials/session tokens but contains all health records and settings. To migrate it:

1. Initialize a new empty journal and create its owner.
2. Stop app and scheduler.
3. Copy the full export into `/app-data/exports/data.json` and ensure UID 1000 can read it.
4. Run `docker compose run --rm --no-deps app node dist/server/import-data.js /app-data/exports/data.json`.
5. Restart and inspect the data, then remove the temporary export file.

Import validates records and references and runs transactionally. It refuses a nonempty journal and never silently overwrites records. Doctor-report JSON is a report, not a full migration export. Original record IDs are retained; creation/update audit timestamps are regenerated during import.

## Failure recovery

A validation failure leaves the current database untouched. A safety-backup failure also stops restore. If a staged rename fails, the former directory is put back where possible. Retain both safety archives and preserved directories until you have inspected the restored data. Do not delete files based solely on a successful archive creation message.
