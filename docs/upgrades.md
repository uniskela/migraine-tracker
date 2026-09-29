# Upgrades

Read release notes and migration changes. Take and copy a verified backup off-host before schema changes. Keep your prior source revision/image for investigation, but do not automatically run old code against a migrated database.

```sh
./scripts/backup.sh
git pull --ff-only
docker compose pull
docker compose up -d --wait --wait-timeout 120
```

`./scripts/update.sh` validates Compose, backs up first, performs a fast-forward source update, pulls the pinned GHCR image, recreates enabled services, runs startup migrations and waits for health. If any command fails, the script exits with failure and does not claim success. It does not automatically reverse migrations.

Compose uses the versioned multi-arch image at `ghcr.io/uniskela/migraine-tracker` for both app and backup. Follow a published release whose image build has completed; unreleased commits may pin a version not yet available in GHCR. Release Please updates the shared image pin for each release. If you set `MIGRAINE_IMAGE`, it overrides that pin for both services; update or remove the override deliberately when upgrading.

Named volumes survive upgrades/container recreation. Never add `-v` to Compose down. Keep `COMPOSE_PROFILES=backups` in `.env` (or use `COMPOSE_PROFILES=backups ./scripts/update.sh`) so the backup service is recreated with the same image as the app.

Migrations are checked-in additive SQL applied through Drizzle at startup. Schema changes must be reviewed, tested against restored real-shaped fixtures, and included in the Docker image. No schema push, reset or destructive recreation runs automatically.

If health fails, inspect `docker compose logs --tail=100 app`, storage permissions and free disk space. Logs omit request bodies and credentials. To restore a previous data revision, stop both services and use the documented restore procedure and a compatible application version. Restoration is a deliberate operator action, not an automatic rollback.

Install updated releases regularly for Node/Debian security updates. CI scans dependencies and the built image; do not bypass a failing security gate without reviewing the advisory. For local source builds, use the explicit build and image override in [development](development.md); `scripts/update.sh` is for registry-based upgrades.
