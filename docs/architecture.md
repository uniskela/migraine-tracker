# Architecture and implementation milestones

## Scope and decisions

A single-user, self-hosted health journal. React 19 + Vite serves a small mobile application from Express 5. TypeScript is shared across UI, validation and business logic. Drizzle ORM provides a relational SQLite schema and checked-in migrations. SQLite uses foreign keys, WAL, busy timeout and full synchronous writes. The database and exports/backups live outside the container in `/app-data`.

The server owns all health records. Cookie sessions are opaque random tokens, hashed at rest. Local passwords use Argon2id. A first-run environment secret prevents remote account claiming. OIDC optionally links one explicitly configured issuer/subject to the existing owner; email alone never grants access. Mutations require the configured public Origin and a per-session CSRF token. The offline shell does not cache authenticated responses or queue writes.

UI, validation, statistics, persistence, authentication, PDF/CSV/JSON exports and backup operations are separate modules. No external services, fonts, analytics, CDN or notifications are needed. Scheduled backup operations run outside the web process. Browser print is not the PDF implementation: the server generates a downloadable PDF.

Records use UTC instants plus a configured IANA timezone for calendar boundaries. Reports clip episodes to the selected period, count every local calendar day touched, and distinguish ongoing episodes. Preventive comparisons use equivalent exposure (days per 30 days), disclose observation coverage and never imply causation. Daily context entries enable comparison with recorded migraine-free days; unrecorded days are not treated as negative observations.

## Modules

- `src/shared`: schemas, selectable vocabulary, time and statistics calculations.
- `src/server`: configuration, database, auth, routes, reports and operations CLI.
- `src/client`: navigation, entry form, history/calendar, trends, medications, reports and settings.
- `migrations`: reviewed SQL migrations generated from the Drizzle schema.
- `scripts`: Docker-oriented backup, restore, update and scheduling commands.
- `tests`: calculation, API/security, real backup round trip and mobile browser tests.

## Milestones / local issue tracker

GitHub issues are unavailable until a repository remote and valid GitHub credentials exist. Track implementation here.

- [ ] M1 Persistence, migrations, secure bootstrap, local sessions, optional OIDC.
- [ ] M2 Episodes, daily context, medications/doses/side effects, sleep, weight and settings.
- [ ] M3 Mobile interface, calendar, accessible themes, low stimulation and PWA.
- [ ] M4 Statistics, preventive comparison, doctor PDF and portable exports/import.
- [ ] M5 Docker, consistent backups, validated restore, scheduling and upgrades.
- [ ] M6 Automated verification, security/mobile audit, evidence and operator docs.

## Migration to PostgreSQL

Keep persistence in server repository functions and schema modules, and calculations independent of SQL. A future migration requires PostgreSQL Drizzle schema/driver and new SQL migrations, plus an export/import transfer; it is deliberately not hidden behind a premature database abstraction. SQLite backup operations would be replaced with PostgreSQL-native tooling.

## Initial limits

One owner per deployment; no shared accounts or public registration. No push reminders, medical advice, offline writes, uploaded attachments or predictive analysis. Optional OIDC needs a real provider deployment for operator acceptance testing. Database archives contain sensitive information and must be protected by host permissions and encrypted off-host storage.
