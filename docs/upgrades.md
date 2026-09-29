# Upgrades

Read release notes and migration changes. Take and copy a verified backup off-host before schema changes. Keep your prior source revision/image for investigation, but do not automatically run old code against a migrated database.

```sh
./scripts/backup.sh
git pull --ff-only
docker compose build --pull app
docker compose up -d --build --wait --wait-timeout 120
```

`./scripts/update.sh` validates Compose, backs up first, performs a fast-forward source update, builds with fresh base layers, recreates services, runs startup migrations and waits for health. If any command fails, the script exits with failure and does not claim success. It does not automatically reverse migrations.

By default Compose builds `migraine-tracker:local` from this checkout. Release Please publishes versioned multi-arch images to `ghcr.io/uniskela/migraine-tracker` (and Docker Hub when `DOCKERHUB_*` secrets are configured). For pull-based upgrades, set `image: ghcr.io/uniskela/migraine-tracker:<version>` and remove `build:`, then `docker compose pull && docker compose up -d`. Local source installs should keep using `docker compose build --pull` to refresh the Node/Debian base layers.

Named volumes survive upgrades/container recreation. Never add `-v` to Compose down. For automatic backups use `COMPOSE_PROFILES=backups ./scripts/update.sh`, or restart that profile afterwards so the backup service uses the new image too.

Migrations are checked-in additive SQL applied through Drizzle at startup. Schema changes must be reviewed, tested against restored real-shaped fixtures, and included in the Docker image. No schema push, reset or destructive recreation runs automatically.

If health fails, inspect `docker compose logs --tail=100 app`, storage permissions and free disk space. Logs omit request bodies and credentials. To restore a previous data revision, stop both services and use the documented restore procedure and a compatible application version. Restoration is a deliberate operator action, not an automatic rollback.

Rebuild regularly for Node/Debian security updates. CI scans dependencies and the built image; do not bypass a failing security gate without reviewing the advisory.
