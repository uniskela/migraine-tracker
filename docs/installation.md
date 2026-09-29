# Installation

## Requirements

Docker Engine with Compose v2, a Linux host with persistent local storage, and an existing HTTPS reverse proxy. Allow roughly 1 GiB RAM for runtime and more for image compilation. SQLite data should be on a local filesystem, not NFS/SMB. Do not run multiple application replicas against the same database.

1. Clone the repository and copy `.env.example` to `.env`.
2. Generate a bootstrap secret with `openssl rand -hex 32`. Replace the example SETUP_SECRET and set APP_ORIGIN to the exact browser origin, e.g. `https://migraine.example.com`, without a trailing slash.
3. Set DEFAULT_TIMEZONE if needed. Leave COOKIE_SECURE=true for production.
4. Protect `.env` with `chmod 600 .env`.
5. Run `docker compose up -d --build`. Startup creates and migrates the database. Migration failures stop startup without recreating the database.
6. Confirm `docker compose ps` reports healthy and `curl http://127.0.0.1:3000/api/health` returns `{"status":"ok","database":"ok"}`.
7. Configure HTTPS proxying, then open APP_ORIGIN. Create the owner with your setup secret, timezone and units. Add optional medication records afterwards. There are no default credentials.
8. Install from Safari’s Share → Add to Home Screen, or the Android browser’s Install app menu.
9. Set up backups and perform a restore rehearsal to a separate installation.

## Persistence and permissions

The named `app-data` volume contains `/app-data/database/tracker.sqlite`, `/app-data/backups`, and `/app-data/exports` (reserved). Exports are streamed directly to the browser; v1 has no uploaded attachments. User preferences and medication schedules are in SQLite. The image runs as UID/GID 1000, with a read-only root filesystem, no Linux capabilities, no-new-privileges, and a temporary `/tmp`.

For bind mounts, replace `app-data:/app-data` in both app and backup services with `./app-data:/app-data`. Before starting, create the database/backups/exports directories and give UID 1000 ownership and mode 0700. Do not change permissions recursively on unrelated directories. Named volumes are initialized with the correct image ownership automatically.

`docker compose down` preserves the volume. **`docker compose down -v` destroys it.** Do not use Docker volume pruning on volumes you need.

## Existing reverse proxy

Production requires HTTPS; the app intentionally refuses insecure production origins/cookies. TLS terminates at your existing proxy. For a proxy on this host, the loopback publication is enough. For a proxy in Docker, put it on the same network or an explicitly shared external network, remove the app’s `ports` publication if unnecessary, and route to `http://app:3000`.

Example Nginx location inside an existing HTTPS server:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_http_version 1.1;
    client_max_body_size 2m;
}
```

Set TRUSTED_PROXIES to the actual immediate proxy address or narrowly scoped network, e.g. an explicitly configured Docker proxy address `172.30.0.2/32`. Inspect your deployment rather than copying a guessed address. Empty trusts none: requests still work, but rate limiting groups clients under the proxy address. Never set broad global trust or accept arbitrary client-supplied forwarding chains. The proxy must overwrite forwarded headers. In multi-hop setups, explicitly trust each controlled hop and configure the edge to strip user-supplied forwarding headers.

The app validates mutating request Origin against APP_ORIGIN and never derives redirect destinations from forwarded Host. Secure cookies are explicitly configured; proxy protocol spoofing cannot disable them.

## Troubleshooting

- Startup fails: check environment validation, directory ownership, disk space and migration version. Logs omit health records and secrets.
- Sign-in works but cookies disappear: use the exact configured HTTPS origin; do not disable secure cookies in production.
- 403 when saving: APP_ORIGIN must match the browser’s scheme, host and port; reload after session changes.
- PWA does not install: verify HTTPS, `/manifest.webmanifest`, icon paths and `/sw.js`; iOS uses manual Add to Home Screen.
- All clients rate-limited together: configure the actual trusted proxy address correctly.
