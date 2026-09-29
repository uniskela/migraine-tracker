# Development

Use Node 22 LTS and npm. Native SQLite/Argon2 packages may require Python 3, make and a C++ compiler where prebuilt modules are unavailable.

```sh
npm ci
cp .env.example .env
# Use a random SETUP_SECRET; for local development only:
# APP_ORIGIN=http://localhost:3000
# COOKIE_SECURE=false
# DATA_DIR=./app-data
# NODE_ENV=development
npm run dev
```

Do not use insecure local settings for a production deployment. Development uses Vite middleware; the shipped container serves the compiled static frontend. Test the built frontend for PWA/security-header behavior.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
npm audit --audit-level=high
```

Playwright starts an isolated built-server instance with a disposable temporary database. It uses a 390px iPhone viewport in Chromium, exercises setup/login, one-tap episode start, severity/symptoms, medication, ending/history/calendar/trends, PDF download, dark/low-stimulation modes, axe accessibility, Chrome installability protocol and offline service-worker navigation. A separate persistent Chromium profile checks installability outside private browsing. Test data and credentials are synthetic. Real iOS/Android installation should still be checked on your own devices.

If Chromium is preinstalled at a nonstandard path, set PLAYWRIGHT_CHROMIUM_EXECUTABLE. Do not change the production server into test mode to work around HTTPS configuration.

Vitest covers timezone boundaries, DST, migraine-day counting, averages and clipping, before/after normalization, validation, spreadsheet escaping, authentication/CSRF/authorization, recording workflows, report exports, JSON migration and a full backup/restore round trip. Run network-listening tests in an environment allowing loopback sockets.

```sh
docker build -t migraine-tracker:local .
./scripts/docker-smoke.sh migraine-tracker:local
./scripts/compose-smoke.sh
```

The Docker smoke test creates an isolated named volume and synthetic owner/record, checks health, recreates the container, verifies persistence, then restores a backup and compares actual contents. It deletes only its own uniquely named test resources.

## Database changes

Edit `src/server/schema.ts`, run `npm run db:generate`, review the SQL under migrations, add realistic forward-migration tests and take a backup before applying to a used installation. Do not use `drizzle-kit push` against production. Migration history lives in the database; startup validates connectivity and applies checked-in migrations. PostgreSQL requires a new driver/schema/migrations and replacement backup tooling; shared calculations and UI are independent of the SQLite dialect.

## Module boundaries

`shared/validation.ts`: input rules/types. `shared/stats.ts`: pure reporting calculations. `server/schema.ts` and `repository.ts`: storage. `server/auth.ts`: local/OIDC/session handling. `server/routes.ts`: protected API. `server/reports.ts`: portable exports/PDF. `server/operations.ts`: backup/restore, outside the web process. Client files are organized by workflow and reusable fields.

## Internal API

All `/api/*` routes except health/auth status and auth entry points require a session. All mutations require JSON and an exact Origin. Authenticated mutations additionally require X-CSRF-Token from `/api/auth/session`; initial setup and login do not require a session CSRF token.

GET `/data`, `/trends?from&to`, `/comparison?medicationId&beforeFrom&beforeTo&afterFrom&afterTo`, `/backup-status`, `/export/json|csv|zip`.

POST `/episodes`, `/episodes/:id/end`, `/medications`, `/doses`, `/effects`, `/weights`, `/report/pdf|csv|json`.

PUT `/episodes/:id`, `/medications/:id`, `/daily`, `/settings`; PATCH `/doses/:id`; DELETE `/episodes/:id`, `/doses/:id`, `/effects/:id`, `/weights/:id`.

POST `/auth/setup`, `/auth/login`, `/auth/logout`, `/auth/password`, `/auth/revoke-sessions`; GET `/auth/status`, `/auth/session`, `/auth/oidc/start`, `/auth/oidc/callback`.

These are internal endpoints, not a promised stable public integration API. No API keys or automation bypasses are shipped.
