import { useEffect, useRef, useState } from "react";
import { Download, ShieldCheck, Database, ExternalLink } from "lucide-react";
import { DateTime } from "luxon";
import { api, download, setCsrf, type Data } from "./api";
import { characters, symptoms } from "../shared/options";
import {
  Chips,
  ErrorMessage,
  Field,
  formatDate,
  PageTitle,
  Submit,
  useAction,
} from "./ui";
/** Provide optional weight entries and a unit-normalized chart without health interpretations. */
function Weight({ data, saved }: { data: Data; saved: () => Promise<void> }) {
  const action = useAction();
  const [date, setDate] = useState(
    DateTime.now().setZone(data.settings.timezone).toISODate()!,
  );
  const [value, setValue] = useState("");
  const [units, setUnits] = useState(data.settings.units);
  const points = [...data.weights].sort((a, b) => a.date.localeCompare(b.date));
  const converted = points.map((p) =>
    p.units === data.settings.units
      ? p.value
      : p.units === "lb"
        ? p.value / 2.2046226218
        : p.value * 2.2046226218,
  );
  const min = Math.min(...converted) - 1,
    max = Math.max(...converted) + 1;
  return (
    <section className="card">
      <h2>Weight journal</h2>
      <p className="muted">
        A simple record, without targets or health conclusions.
      </p>
      <form
        onSubmit={action.submit(async () => {
          await api("/weights", "POST", { date, value: Number(value), units });
          setValue("");
          await saved();
        })}
      >
        <div className="form-grid">
          <Field label="Weight date">
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Weight">
            <input
              type="number"
              min="0.1"
              max="2000"
              step="any"
              required
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </Field>
          <Field label="Weight units">
            <select
              value={units}
              onChange={(e) => setUnits(e.target.value as "kg" | "lb")}
            >
              <option>kg</option>
              <option>lb</option>
            </select>
          </Field>
        </div>
        <Submit busy={action.busy}>Save weight</Submit>
      </form>
      {points.length > 0 && (
        <>
          <svg
            viewBox="0 0 600 150"
            className="weight-chart"
            role="img"
            aria-label={`Weight over time in ${data.settings.units}: ${points.map((p, i) => `${p.date}, ${converted[i].toFixed(1)}`).join("; ")}`}
          >
            <polyline
              points={converted
                .map(
                  (v, i) =>
                    `${30 + (i / Math.max(1, converted.length - 1)) * 540},${120 - ((v - min) / (max - min)) * 100}`,
                )
                .join(" ")}
              className="chart-line"
            />
            {converted.map((v, i) => (
              <circle
                key={i}
                cx={30 + (i / Math.max(1, converted.length - 1)) * 540}
                cy={120 - ((v - min) / (max - min)) * 100}
                r="4"
                className="chart-bar"
              />
            ))}
          </svg>
          <div className="scale-labels">
            <span>{points[0].date}</span>
            <span>{points[points.length - 1].date}</span>
          </div>
          {[...points].reverse().map((p) => (
            <div className="list-row" key={p.id}>
              <span>
                {formatDate(p.date, data.settings)} · {p.value} {p.units}
              </span>
              <button
                className="text-button danger"
                onClick={() => {
                  if (confirm("Delete this weight entry?"))
                    void action.run(async () => {
                      await api(`/weights/${p.id}`, "DELETE");
                      await saved();
                    });
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </>
      )}
      <ErrorMessage error={action.error} />
    </section>
  );
}
/** Manage preference drafts, exports and security while merging external preference changes. */
export function SettingsPage({
  data,
  saved,
  logout,
  username,
  auth,
}: {
  data: Data;
  saved: () => Promise<void>;
  logout: () => void;
  username: string;
  auth: { oidcEnabled: boolean; localEnabled: boolean };
}) {
  const [v, setV] = useState(data.settings);
  const previousSettings = useRef(data.settings);
  useEffect(() => {
    // Apply changed server fields without discarding unrelated unsaved edits.
    const changes = Object.fromEntries(
      Object.entries(data.settings).filter(
        ([key, value]) =>
          JSON.stringify(value) !==
          JSON.stringify(
            previousSettings.current[key as keyof typeof data.settings],
          ),
      ),
    );
    previousSettings.current = data.settings;
    if (Object.keys(changes).length)
      setV((draft) => ({ ...draft, ...changes }));
  }, [data.settings]);
  const action = useAction();
  const exportAction = useAction();
  const securityAction = useAction();
  const [success, setSuccess] = useState("");
  const [backup, setBackup] = useState<string | null>(null);
  const [backupError, setBackupError] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  useEffect(() => {
    api<{ lastSuccessful: string | null }>("/backup-status")
      .then((v) => setBackup(v.lastSuccessful))
      .catch((e) => setBackupError(e.message));
  }, []);
  const backupHours = backup
    ? Math.floor((Date.now() - Date.parse(backup)) / 3600000)
    : null;
  return (
    <>
      <PageTitle
        eyebrow="Make it yours"
        title="Settings"
        text="Comfort, privacy and control over your data."
      />
      <form
        className="card"
        onSubmit={action.submit(async () => {
          await api("/settings", "PUT", v);
          await saved();
          setSuccess("Preferences saved.");
        })}
      >
        <h2>Everyday preferences</h2>
        <div className="form-grid">
          <Field
            label="Timezone"
            hint="An IANA timezone, such as Australia/Sydney."
          >
            <input
              required
              list="timezones"
              value={v.timezone}
              onChange={(e) => setV({ ...v, timezone: e.target.value })}
            />
            <datalist id="timezones">
              {[
                "Australia/Sydney",
                "Australia/Melbourne",
                "Australia/Brisbane",
                "Australia/Perth",
                "Pacific/Auckland",
                "Europe/London",
                "America/New_York",
                "America/Los_Angeles",
                "UTC",
              ].map((z) => (
                <option key={z}>{z}</option>
              ))}
            </datalist>
          </Field>
          <Field label="Date format">
            <select
              value={v.dateFormat}
              onChange={(e) =>
                setV({
                  ...v,
                  dateFormat: e.target.value as typeof v.dateFormat,
                })
              }
            >
              <option value="d MMM yyyy">28 Sep 2026</option>
              <option value="dd/MM/yyyy">28/09/2026</option>
              <option value="MM/dd/yyyy">09/28/2026</option>
            </select>
          </Field>
          <Field label="Time format">
            <select
              value={v.timeFormat}
              onChange={(e) =>
                setV({ ...v, timeFormat: e.target.value as "12" | "24" })
              }
            >
              <option value="12">12-hour</option>
              <option value="24">24-hour</option>
            </select>
          </Field>
          <Field label="Theme">
            <select
              value={v.theme}
              onChange={(e) =>
                setV({ ...v, theme: e.target.value as typeof v.theme })
              }
            >
              <option value="system">Follow system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </Field>
          <Field label="Preferred weight units">
            <select
              value={v.units}
              onChange={(e) =>
                setV({ ...v, units: e.target.value as "kg" | "lb" })
              }
            >
              <option>kg</option>
              <option>lb</option>
            </select>
          </Field>
        </div>
        <label className="setting-toggle">
          <div>
            <strong>Low-stimulation mode</strong>
            <p className="muted small">
              Softer colours, no movement, fewer fields at once.
            </p>
          </div>
          <input
            type="checkbox"
            role="switch"
            checked={v.lowStimulation}
            onChange={(e) => setV({ ...v, lowStimulation: e.target.checked })}
          />
        </label>
        <label className="setting-toggle">
          <div>
            <strong>Enable weight journal</strong>
            <p className="muted small">
              Completely optional. Turning this off keeps existing records.
            </p>
          </div>
          <input
            type="checkbox"
            role="switch"
            checked={v.weightEnabled}
            onChange={(e) => setV({ ...v, weightEnabled: e.target.checked })}
          />
        </label>
        <details>
          <summary>Default migraine fields</summary>
          <p className="muted small">
            These pre-fill the full entry form. One-tap start records only the
            current time.
          </p>
          <Field label="Default side">
            <select
              value={v.defaultSide}
              onChange={(e) =>
                setV({
                  ...v,
                  defaultSide: e.target.value as typeof v.defaultSide,
                })
              }
            >
              {["Unspecified", "Left", "Right", "Both"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Chips
            label="Usual symptoms"
            options={symptoms}
            value={v.defaultSymptoms}
            onChange={(defaultSymptoms) => setV({ ...v, defaultSymptoms })}
          />
          <Chips
            label="Usual pain character"
            options={characters}
            value={v.defaultCharacters}
            onChange={(defaultCharacters) => setV({ ...v, defaultCharacters })}
          />
        </details>
        <ErrorMessage error={action.error} />
        {success && (
          <p className="success" role="status">
            {success}
          </p>
        )}
        <Submit busy={action.busy}>Save preferences</Submit>
      </form>
      {data.settings.weightEnabled && <Weight data={data} saved={saved} />}
      <div className="two-column">
        <section className="card">
          <div className="card-title">
            <h2>Backups</h2>
            <Database size={21} />
          </div>
          <p className="eyebrow">Last successful backup</p>
          <strong>
            {backup
              ? formatDate(backup, data.settings, true)
              : "No backup recorded yet"}
          </strong>
          {backupHours !== null && (
            <p className="muted">
              {backupHours < 1
                ? "Less than an hour ago"
                : `${backupHours} hours ago`}
            </p>
          )}
          {(backupHours === null || backupHours > 48) && (
            <p className="gentle-notice">
              A recent backup helps keep your journal safe. Ask your server
              administrator to check the backup schedule.
            </p>
          )}
          <ErrorMessage error={backupError} />
          <p className="small muted">
            Backups run on your server. Health information stays private.
          </p>
        </section>
        <section className="card">
          <div className="card-title">
            <h2>Your data, always yours</h2>
            <Download size={21} />
          </div>
          <p className="muted">
            Download all recorded data. JSON contains portable records; ZIP
            includes JSON and CSV files.
          </p>
          <div className="button-row">
            {["json", "csv", "zip"].map((format) => (
              <button
                className="button secondary"
                disabled={exportAction.busy}
                key={format}
                onClick={() =>
                  void exportAction.run(() =>
                    download(`/export/${format}`, `migraine-data.${format}`),
                  )
                }
              >
                {format.toUpperCase()}
              </button>
            ))}
          </div>
          <ErrorMessage error={exportAction.error} />
          <p className="small muted">
            Downloads contain private health information. Store them somewhere
            you trust.
          </p>
        </section>
      </div>
      <section className="card">
        <div className="card-title">
          <h2>Account & authentication</h2>
          <ShieldCheck size={21} />
        </div>
        <p>
          Signed in as <strong>{username}</strong>
        </p>
        <p className="muted small">
          Local login: {auth.localEnabled ? "enabled" : "disabled"} · Authentik
          / OIDC: {auth.oidcEnabled ? "enabled" : "not configured"}
        </p>
        {auth.localEnabled && (
          <details>
            <summary>Change password</summary>
            <form
              onSubmit={securityAction.submit(async () => {
                const r = await api<{ csrf: string }>(
                  "/auth/password",
                  "POST",
                  { currentPassword: oldPassword, password: newPassword },
                );
                setCsrf(r.csrf);
                setOldPassword("");
                setNewPassword("");
                setSuccess("Password changed. Other sessions signed out.");
              })}
            >
              <Field label="Current password">
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                />
              </Field>
              <Field label="New password">
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </Field>
              <Submit busy={securityAction.busy}>Change password</Submit>
            </form>
          </details>
        )}
        <div className="button-row">
          <button
            className="button secondary"
            disabled={securityAction.busy}
            onClick={() =>
              void securityAction.run(async () => {
                const r = await api<{ csrf: string }>(
                  "/auth/revoke-sessions",
                  "POST",
                  {},
                );
                setCsrf(r.csrf);
                setSuccess("Other sessions signed out.");
              })
            }
          >
            Sign out other devices
          </button>
          <button className="button secondary" onClick={logout}>
            Sign out
          </button>
        </div>
        <ErrorMessage error={securityAction.error} />
      </section>
      <details className="card">
        <summary>Advanced configuration & installation</summary>
        <p>
          Authentication providers, trusted proxies, backup schedules and the
          app name are configured by your server administrator. See the
          installation and Authentik guides included with the application.
        </p>
        <h3>Install on your phone</h3>
        <p>
          iPhone: open in Safari, tap Share, then Add to Home Screen. Android:
          open your browser menu and choose Install app or Add to Home screen.
        </p>
        <p className="small muted">
          HTTPS is required. Offline mode offers a reconnect screen; saving and
          viewing health records requires a connection. Reliable scheduled
          reminders are not available in this version.
        </p>
        <a
          className="text-button"
          href="/manifest.webmanifest"
          target="_blank"
          rel="noreferrer"
        >
          View app manifest <ExternalLink size={15} />
        </a>
      </details>
      <p className="disclaimer">
        This application records and summarises information and does not provide
        medical advice.
      </p>
    </>
  );
}
