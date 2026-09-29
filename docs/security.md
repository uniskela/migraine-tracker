# Security and short threat model

## Assets and trust boundaries

Health notes, symptoms, medication/weight/sleep records, identifiers, credentials, exports and backups are private. The browser, HTTPS reverse proxy, application process, local SQLite volume and optional OIDC provider are separate trust boundaries. The host administrator is trusted and can read the database. The application is not end-to-end encrypted and cannot protect against a compromised host, malicious browser extension or an already-unlocked stolen device.

## Principal threats and controls

| Threat | Controls | Residual limits |
| --- | --- | --- |
| Claiming an uninitialized instance | Random environment bootstrap secret, rate-limited setup, single-owner transaction and permanent closure | Protect .env before first exposure |
| Password guessing | Argon2id (64 MiB, 3 passes, parallelism 1), 12-character minimum, per-IP limits, persistent per-username escalating lockout | Attackers can temporarily deny sign-in by targeting an account; OIDC provides an optional alternative |
| Session theft/fixation | 256-bit opaque tokens, SHA-256 at rest, fresh tokens on sign-in/password change, 7-day absolute expiry, HttpOnly/Secure/SameSite=Lax, __Host- prefix | An unlocked signed-in device remains trusted; use device locks and revoke sessions |
| CSRF | Exact configured Origin on every mutation, JSON content type and constant-time session CSRF token verification | Same-origin XSS would still be dangerous |
| XSS/clickjacking | React escaping, no arbitrary HTML rendering, self-only script/style CSP, no inline scripts, frame-ancestors none, Helmet headers | Keep dependencies updated |
| SQL injection/IDOR | Zod validation, Drizzle/parameterized SQL, per-owner resource checks, foreign keys | Single owner is the supported deployment model |
| Forwarded-header spoofing | No trusted proxies by default; explicit IP/CIDR allowlist; redirects use configured origin | Proxy must overwrite forwarding headers and be the only ingress |
| OIDC impersonation | Signed ID-token validation, issuer/audience/expiry validation, one-use state, browser binding, nonce and S256 PKCE, exact owner sub allowlist | Provider/CA compromise is outside application control |
| Offline disclosure | No health records/auth responses in service-worker cache; no localStorage health data | Current in-memory UI may remain visible until navigation/logout |
| Backup loss/corruption | SQLite online backup, SHA-256 manifest, integrity/foreign-key checks, safety archive, preserved pre-restore directory, tested restore | A local backup cannot survive disk loss; encrypt and copy off-host |
| Malicious archive/CSV | Strict member allowlist, regular files only, no traversal/symlinks; CSV formula neutralization | Only a trusted operator should supply restoration archives |
| Log leakage | Fixed operational event names only; no URLs, request bodies, identifiers, exception stack dumps, tokens or records | Configure reverse-proxy logs separately; OIDC callback query strings can contain codes |
| Container compromise | Non-root UID 1000, read-only root FS, dropped capabilities, no-new-privileges, bounded logs | Host patching and access control remain essential |

The backup worker receives only non-secret configuration and has no network access. It retains writable journal-volume access for SQLite online backup/WAL coordination, completion records and archive retention; host/container compromise can still expose or alter this single installation’s journal. Its own healthcheck reports failed or missed backups independently of the web UI, and should be connected to host monitoring.

## Operating guidance

Use HTTPS, a narrow proxy trust configuration, encrypted host storage, off-host encrypted backups and a strong unique passphrase. Keep OIDC client secrets out of client bundles and source control. No analytics, telemetry, advertisements, remote fonts or CDN requests are included. Optional OIDC is the only configured external application service.

Health endpoint exposes only availability. Public auth status exposes setup state and enabled methods, never account identity. Local setup is always secret protected. Local login remains enabled unless explicitly disabled; at least one login method must remain configured.

Sessions are revoked on password change and after restore. Owner can revoke all other sessions. Login failure state survives restarts, while per-IP request counters are deliberately process-local for this single-process deployment. Do not horizontally scale it without redesigning that limit and SQLite access.

A reported relief review is not a medication reminder. There are no diagnosis, dosage, treatment, emergency triage or prediction features. Reports are factual and observational.

## Dependency and image review

`npm audit --audit-level=high` runs in CI; production dependencies are also checked during review. The lockfile is required. An esbuild override patches Drizzle Kit’s legacy development-only loader dependency; regenerate and test migrations when changing it. Image builds use bounded Node/Debian versions and CI scans fixable HIGH/CRITICAL image findings with Trivy. Rebuild and update base versions when patched images become available.

## Review checklist performed during development

- Reviewed auth/setup closure, credential/session storage, CSRF, ownership checks, OIDC callback binding and configured-origin redirects.
- Tested unauthorized reads, cross-origin/missing-CSRF mutations, wrong-password backoff and protected exports.
- Checked logging paths, CSP/headers, frontend escaping and service-worker caches.
- Restored real fixture data from a consistent archive, checked original content, integrity and session invalidation.
- Browser accessibility, installability and Docker verification are recorded in verification.md.

This is a practical application review, not an independent penetration test or healthcare compliance certification.
