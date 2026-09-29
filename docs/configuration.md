# Configuration

Server-only environment variables are loaded from `.env` locally and by Compose. No secret variables are embedded in browser bundles. Restart/recreate the container after changes.

| Variable | Default | Purpose |
| --- | --- | --- |
| APP_NAME | Migraine Tracker | UI and manifest name; easy to rebrand |
| APP_ORIGIN | http://localhost:3000 locally | Required HTTPS origin for production; no trailing slash |
| SETUP_SECRET | none | Required random secret, at least 32 characters, used only before setup |
| DEFAULT_TIMEZONE | Australia/Sydney | Initial IANA timezone; owner can change it in settings |
| COOKIE_SECURE | true | Secure, HttpOnly cookies; must stay true in production |
| LOCAL_AUTH_ENABLED | true | Local login; disable only after testing OIDC |
| TRUSTED_PROXIES | empty | Comma-separated trusted proxy IPs/CIDRs; never blanket trust |
| LOG_LEVEL | info | error, warn, info; no request bodies, tokens or health records |
| DATA_DIR | ./app-data locally | Compose fixes this to /app-data |
| PORT | 3000 | Compose fixes internal port to 3000 |
| HOST_PORT | 3000 | Host published port |
| BIND_ADDRESS | 127.0.0.1 | Host binding; prefer loopback or no publication |
| BACKUP_RETENTION_DAYS | 30 | Successful timestamped backups older than this may be removed; newest is kept; 0 disables pruning |
| COMPOSE_PROFILES | empty | Set to `backups` to enable the scheduled backup service during startup and upgrades |
| MIGRAINE_IMAGE | pinned GHCR release in Compose | Optional image override applied to both app and backup; normally leave unset |
| OIDC_ENABLED | false | Enable OIDC authentication |
| OIDC_ISSUER_URL | empty | Exact HTTPS discovery issuer |
| OIDC_CLIENT_ID | empty | Confidential OIDC client ID |
| OIDC_CLIENT_SECRET | empty | Server-only OIDC client secret |
| OIDC_REDIRECT_URI | empty | APP_ORIGIN + /api/auth/oidc/callback |
| OIDC_ALLOWED_SUBJECT | empty | Exact immutable subject permitted to access the existing owner |
| NODE_ENV | development locally | Compose forces production |

Generate SETUP_SECRET with `openssl rand -hex 32`. Do not use the example string. Keep `.env` out of Git and back it up separately with encryption. The secret remains in configuration after setup but cannot reopen setup.

All episode/dose/session timestamps are UTC. User timezone determines display, day boundaries, daily counts and date-only context records. Medication dates, weight dates and daily check-ins are local calendar dates. Changing timezone can change which dates a timestamp belongs to; original UTC timestamps do not change.

UI preferences: timezone, date/time format, units, theme, low stimulation, optional weight, and default full-form selections. One-tap start deliberately does not infer a pain score or symptoms.

The backup container runs immediately on startup and then at 03:00 UTC. It receives only NODE_ENV, DATA_DIR, BACKUP_RETENTION_DAYS and LOG_LEVEL; it does not inherit the application’s `.env` credentials. Use host cron for a local timezone schedule; see backups documentation.
