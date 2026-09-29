import { useState } from "react";
import { Activity, ArrowRight, Leaf, LockKeyhole } from "lucide-react";
import { api, setCsrf } from "./api";
import { ErrorMessage, Field, Submit, useAction } from "./ui";
export type AuthStatus = {
  setupRequired: boolean;
  localEnabled: boolean;
  oidcEnabled: boolean;
  appName: string;
  defaultTimezone: string;
};
/** Present protected first-run setup or the configured local and optional OIDC sign-in options. */
export function Login({
  status,
  signedIn,
}: {
  status: AuthStatus;
  signedIn: () => Promise<void>;
}) {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [secret, setSecret] = useState(""),
    [zone, setZone] = useState(status.defaultTimezone),
    [units, setUnits] = useState("kg");
  const action = useAction();
  return (
    <main className="auth-layout">
      <div className="auth-story">
        <div className="brand">
          <span className="brand-icon">
            <Activity size={24} />
          </span>
          {status.appName}
        </div>
        <div>
          <p className="eyebrow">A little clarity. A little care.</p>
          <h1>
            A quieter way
            <br />
            to keep track.
          </h1>
          <p>
            Your experience, in your own words.
            <br />A private journal for patterns, perspective,
            <br />
            and better conversations with your doctor.
          </p>
          <div className="auth-art" aria-hidden="true">
            <div />
            <div />
            <Leaf size={68} />
          </div>
        </div>
        <span className="privacy-line">
          <LockKeyhole size={15} />
          Private by design. Yours to keep.
        </span>
      </div>
      <section className="auth-card">
        <div className="mobile-brand">
          <Activity size={25} />
          <strong>{status.appName}</strong>
        </div>
        <p className="eyebrow">
          {status.setupRequired ? "Your private space" : "Good to see you"}
        </p>
        <h2>
          {status.setupRequired ? "Let’s get you settled." : "Welcome back."}
        </h2>
        <p className="muted">
          {status.setupRequired
            ? "Create your account. It only takes a moment."
            : "Sign in to your migraine journal."}
        </p>
        {new URLSearchParams(location.search).has("authError") && (
          <ErrorMessage error="Single sign-on was not completed. Try again or use local login." />
        )}
        {(status.localEnabled || status.setupRequired) && (
          <form
            onSubmit={action.submit(async () => {
              const result = await api<{ csrf: string }>(
                status.setupRequired ? "/auth/setup" : "/auth/login",
                "POST",
                status.setupRequired
                  ? {
                      username,
                      password,
                      setupSecret: secret,
                      timezone: zone,
                      units,
                    }
                  : { username, password },
              );
              setCsrf(result.csrf);
              await signedIn();
            })}
          >
            {status.setupRequired && (
              <Field
                label="Setup secret"
                hint="Provided in your server’s .env file. Required only for first setup."
              >
                <input
                  type="password"
                  required
                  autoComplete="off"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                />
              </Field>
            )}
            <Field label="Email or username">
              <input
                autoComplete="username"
                autoCapitalize="none"
                required
                maxLength={120}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </Field>
            <Field
              label="Password"
              hint={
                status.setupRequired
                  ? "At least 12 characters. A long passphrase works well."
                  : undefined
              }
            >
              <input
                type="password"
                required
                minLength={status.setupRequired ? 12 : 1}
                maxLength={128}
                autoComplete={
                  status.setupRequired ? "new-password" : "current-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {status.setupRequired && (
              <>
                <div className="form-grid">
                  <Field label="Timezone">
                    <input
                      required
                      value={zone}
                      onChange={(e) => setZone(e.target.value)}
                    />
                  </Field>
                  <Field label="Preferred units">
                    <select
                      value={units}
                      onChange={(e) => setUnits(e.target.value)}
                    >
                      <option>kg</option>
                      <option>lb</option>
                    </select>
                  </Field>
                </div>
                <details>
                  <summary>Optional setup</summary>
                  <p className="small muted">
                    After creating your account, add preventive medications in
                    Medications. Optional Authentik single sign-on is configured
                    in your server environment; see docs/authentik.md. Local
                    login remains available unless explicitly disabled.
                  </p>
                </details>
              </>
            )}
            <ErrorMessage error={action.error} />
            <Submit busy={action.busy}>
              {status.setupRequired ? "Create my journal" : "Sign in"}
              <ArrowRight size={18} />
            </Submit>
          </form>
        )}
        {status.oidcEnabled && !status.setupRequired && (
          <a className="button secondary sso" href="/api/auth/oidc/start">
            Continue with single sign-on
          </a>
        )}
        <p className="auth-footer">
          <LockKeyhole size={14} />
          Stored on your server. No analytics. No tracking.
        </p>
      </section>
    </main>
  );
}
