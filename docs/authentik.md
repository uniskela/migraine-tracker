# Optional Authentik single sign-on

Local authentication works without Authentik. OIDC is optional and performs no external calls when disabled.

1. Complete the tracker’s one-time owner setup first using SETUP_SECRET.
2. In Authentik create an OAuth2/OpenID Provider, confidential client, authorization-code flow. Use a signing key and the `openid` scope. Enable PKCE support (S256). Bind an application and an access policy restricting it to your account.
3. Add exactly `https://migraine.example.com/api/auth/oidc/callback` as the allowed redirect URI. Do not use wildcard redirect URIs.
4. Copy the issuer shown by Authentik, usually `https://auth.example.com/application/o/<application-slug>/`, into OIDC_ISSUER_URL. Use the issuer value from its discovery document exactly, including its trailing slash.
5. Set OIDC_CLIENT_ID, OIDC_CLIENT_SECRET and OIDC_REDIRECT_URI.
6. Obtain your own immutable `sub` claim for this provider using Authentik’s provider preview or a trusted local OIDC client. Set OIDC_ALLOWED_SUBJECT to that exact value. Do not paste tokens into public decoder websites. Authentik subject mapping options may produce identifiers other than the numeric user ID; verify the actual claim.
7. Set OIDC_ENABLED=true and recreate the app: `docker compose up -d --force-recreate app`.
8. In a fresh browser session choose Continue with single sign-on. Verify you return to the correct journal. Test a different Authentik user and confirm access is rejected.
9. Only after this acceptance test, optionally set LOCAL_AUTH_ENABLED=false. Keep a working recovery procedure and a protected configuration backup.

The first successful allowed-subject login links that subject to the existing owner. Other subjects are rejected even if their email matches. No automatic OIDC registration and no email-based account linking are allowed. Provider identity changes need an explicit administrative migration; changing only the allowlist will not silently replace an existing linked identity.

The library verifies discovery issuer, signed ID token, audience and expiry; state, nonce and PKCE bind the response to a ten-minute browser transaction. State is one-use, server stored and matched to an HttpOnly SameSite cookie. Only HTTPS issuer discovery is allowed. Tokens are not persisted and never logged. Logout ends the tracker session; it does not log out of all Authentik applications.

The redirect URI must be on APP_ORIGIN with the exact callback path. Ensure your server can resolve and reach the issuer and its signing-key/token endpoints. Use a publicly trusted certificate or install your organization’s trusted CA correctly; never disable TLS verification.

Automated tests exercise a mock provider with real RSA-signed ID tokens, PKCE, state/nonce, audience and subject validation, replay rejection and browser binding. A real Authentik tenant is required to acceptance-test your provider configuration. Automated local tests cannot establish that your actual tenant policies, certificates and subject mapping are correct.

Recovery: restore LOCAL_AUTH_ENABLED=true and restart, then use the owner’s local password. If all credentials are lost, restore a known-good protected backup or use a carefully audited administrative password reset; the public setup endpoint cannot be reopened while an owner exists.
