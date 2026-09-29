# Backups

## Manual backup

```sh
./scripts/backup.sh
```

This calls the SQLite online backup API through `better-sqlite3`; it does not copy an active WAL database file. The consistent snapshot is integrity/foreign-key checked and archived with a SHA-256 manifest. An atomic rename publishes the successful `.tar.gz`. Failure leaves no completed-looking partial archive. The result is stored under `/app-data/backups/migraine-tracker-<UTC timestamp>-<random suffix>.tar.gz`.

Archive contents: `tracker.sqlite` and `manifest.json`. SQLite contains health records, account settings, medication schedules and password hashes. v1 has no uploaded files and streams exports to the requesting browser, so there are no application-generated files required for recovery. `/app-data/exports` is reserved. Keep `.env` and any reverse-proxy/certificate configuration in a **separate encrypted configuration backup**; embedding live secrets in every data download/backup would widen exposure.

The settings page displays the last successful backup timestamp from BackupRecord. A missing backup or one over 48 hours old shows a gentle prompt. This records backup completion, not an independent guarantee of off-host storage or recoverability; rehearse restores.

## Daily backups

Separate optional container, immediately on startup and then daily at **03:00 UTC**:

```sh
docker compose --profile backups up -d
```

Alternatively, use your host cron at 03:00 in the host timezone:

```cron
0 3 * * * cd /opt/migraine-tracker && ./scripts/backup.sh >> /var/log/migraine-backup.log 2>&1
```

Choose one scheduler. If you require Australia/Sydney local time including DST, use a host configured to that timezone or a cron implementation supporting `CRON_TZ`. The container schedule intentionally states UTC. On restart, the backup container makes an immediate backup before scheduling the next future 03:00. It receives only data-directory, retention and logging configuration; application and OIDC secrets are not passed to it. Its network is disabled. Writable access to the journal volume remains necessary for SQLite WAL coordination and backup completion records.

`BACKUP_RETENTION_DAYS=30` applies to matching successful archive files. The newest archive is never deleted, even if old; 0 disables retention. Safety backups created during restore do not run retention. Old preserved database directories are retained for operator review and are never automatically removed.

## Off-host copy

Find and copy an archive without exposing the database port:

```sh
docker compose exec -T app ls /app-data/backups
docker compose cp app:"/app-data/backups/migraine-tracker-2026-09-28T23-00-00-000Z-example.tar.gz" "./migraine-tracker-2026-09-28T23-00-00-000Z-example.tar.gz"
```

Encrypt before copying to external storage, using your established tools (e.g. age, restic, or encrypted filesystem). The app does not manage encryption keys. Health records, password hashes, session state and account identifiers are sensitive. Limit backup access to the owner/server administrator.

Also retain the source revision/image tag and encrypted `.env`. A database copied with `cp` while running is not a substitute for this backup operation.

## Verification

`npm test` creates a live WAL database, backs it up, changes its records, actually restores the archive, verifies episode/symptom/sleep contents and integrity, verifies safety preservation, and checks revoked sessions. `scripts/docker-smoke.sh` also restores inside a disposable Docker volume. See [verification evidence](verification.md) for actual run results. Rehearse your own off-host recovery periodically.

## Independent health monitoring

The backup container healthcheck fails after any unsuccessful attempt, missing/invalid worker status, or a scheduled run overdue by more than 30 minutes. Health stays failed until another successful backup. Monitor Docker health with your existing host monitoring (`docker compose --profile backups ps`) in addition to the app’s stale-backup prompt. Docker does not restart a container merely because it is unhealthy. Inspect logs/storage, correct the cause, then `docker compose --profile backups restart backup` to retry immediately. A hard worker crash exits nonzero and the restart policy applies.
