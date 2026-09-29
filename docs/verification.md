# Verification evidence

Verification date: 29 September 2026. All fixtures are synthetic. No actual health records were used.

## Completed checks

- TypeScript type-check and ESLint passed.
- Production frontend and server build passed.
- Drizzle schema generation reports no uncommitted schema changes relative to checked-in migrations.
- 22 Vitest tests passed: local setup/login/lockout, CSRF and ownership, active episode lifecycle, medication/side-effect/sleep/context/weight records, report/export formats, JSON migration, timezones/DST and statistics, and actual backup restoration.
- OIDC tests use real RSA-signed mock-provider ID tokens and exercise PKCE, state/nonce, audience/subject allowlisting, browser binding and replay rejection.
- SQLite live-WAL backup actually restored original episode, symptom, sleep and severity records after subsequent changes; safety data preserved, integrity passed, restored sessions revoked, malformed and symlink archives rejected.
- Docker image built from a clean base. Disposable-container test passed fresh setup, health, record persistence after container recreation, and actual archive restore with content comparison.
- Actual Compose project test passed with the optional backup service, healthchecks, force recreation, persistent records, stopped-service restore, and healthy restart. Isolated test resources were removed afterwards.
- npm installation/audit of the final dependency lockfile reports zero vulnerabilities.
- Trivy scan of the exported production image passed with zero fixable HIGH/CRITICAL findings (Debian and application packages). Scan used a non-root read-only container, a read-only image archive and an isolated scanner cache; no Docker socket was exposed.
- Desktop (1440px) and phone (390px) screenshots reviewed. Input labels, mobile icon naming and dark/low-stimulation contrast defects found during review were corrected.
- Server-generated PDF visually inspected and text extracted successfully. Includes a readable vector chart, summary, medication comparison, side effects, timeline and notes. Bundled fonts avoid remote calls.
- Both Playwright browser tests passed: the complete 390px phone workflow (sign-in, start, severity, symptoms, medication, finish, history/calendar, trend update, PDF, dark/low-stimulation mode), axe WCAG AA checks with zero violations on the exercised home screen, no page errors or horizontal overflow, service-worker registration/control, no cached API records, offline navigation/reconnection, and a separate non-private profile with zero manifest/installability errors.

## PR review regressions

- Backup publication tests force metadata insertion failure and retention deletion failure. They verify cleanup of untracked archives, preservation of successful archives/records, warning logs and an actual restore after retention failure.

- OIDC tests now verify repeat login and reject an identity change between the callback read and conditional update without issuing a session.
- The phone test changes a draft theme, toggles low-stimulation mode from the top bar, saves and reloads. Both preferences persist without losing the unrelated draft.
- Repository tests verify account-scoped episode relationships and medication schedules, including constant query count as schedules grow.
- Backup worker tests cover UTC scheduling across year boundaries and failed, missing, invalid or overdue health state.
- The Compose smoke test verifies no application credentials in the worker, disabled networking, startup backup health, persistence after recreation, actual archive restoration and healthy restart. An isolated worker attempts a backup against a missing database and its health command must fail. CI runs this Compose check alongside the existing container smoke test.

## Artifacts

- [Desktop](evidence/desktop.png)
- [Phone](evidence/mobile.png)
- [Low-stimulation entry](evidence/mobile-entry.png)
- [Dark low-stimulation mode](evidence/mobile-dark.png)
- [Synthetic doctor report](evidence/doctor-report.pdf)

## Operational limits and acceptance checks

- A real Authentik tenant was not supplied. Provider protocol is tested with signed tokens; operator must verify their own issuer, certificate trust, access policy, redirect and immutable subject mapping.
- Automated mobile tests use Chromium with iPhone dimensions. Actual iOS Safari/Android installation on physical devices remains a deployment acceptance check.
- No push reminders or offline writes. Offline navigation uses a reconnect shell; API/health responses and private records are never cached by the service worker.
- Backups/exports are plaintext at the application layer. Encrypt host storage and off-host copies. Back up deployment secrets separately.
- One owner and one application process per deployment. No multi-user administration or distributed rate limiter.
- Average duration excludes ongoing and boundary-clipped episodes. Total episode hours can include overlapping entries; reports disclose this. Daily association comparison only includes days with explicit check-ins.
- PDF fonts cover common Latin/Greek/Cyrillic text; full multilingual font coverage is a future enhancement.

## Suggested next release

Physical-device Safari/Android regression coverage; optional user-defined quick templates; stronger recording-coverage visualizations; encrypted backup integration using an operator-owned key; a versioned personal integration API. Reliable offline synchronization and reminders should be separate, carefully tested features.
