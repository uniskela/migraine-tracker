import { useEffect, useRef, useState } from "react";
import { Download, ShieldCheck, Database, ExternalLink } from "lucide-react";
import { api, download, setCsrf, type Data } from "./api";
import { characters, symptoms } from "../shared/options";
import type { Settings } from "../shared/validation";
import {
  ChoiceButtons,
  Chips,
  ErrorMessage,
  Field,
  formatDate,
  PageTitle,
  SubNav,
  Submit,
  useAction,
} from "./ui";
/** Every timezone the browser knows, falling back to a short list on older browsers. */
export const timezones = (() => {
  try {
    return [...Intl.supportedValuesOf("timeZone"), "UTC"];
  } catch {
    return [
      "Australia/Sydney",
      "Australia/Melbourne",
      "Australia/Brisbane",
      "Australia/Adelaide",
      "Australia/Perth",
      "Pacific/Auckland",
      "Europe/London",
      "America/New_York",
      "America/Los_Angeles",
      "UTC",
    ];
  }
})();
/** The timezone this device reports, if any. */
export const deviceTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
};
/** Choose a timezone from a list, with a shortcut to this device’s timezone. */
export function TimezoneField({
  value,
  onChange,
}: {
  value: string;
  onChange: (zone: string) => void;
}) {
  const device = deviceTimezone();
  const options = timezones.includes(value) ? timezones : [value, ...timezones];
  return (
    <>
      <Field
        label="Timezone"
        hint="Used to decide which day a migraine falls on."
      >
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </Field>
      {device && device !== value && timezones.includes(device) && (
        <button
          type="button"
          className="text-button"
          onClick={() => onChange(device)}
        >
          Use this device’s timezone ({device.replace(/_/g, " ")})
        </button>
      )}
    </>
  );
}
/** Save preference changes as they are made, one request at a time, keeping the newest values on screen. */
function usePreferences(data: Data, refresh: () => Promise<void>) {
  const [value, setValue] = useState(data.settings);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const latest = useRef(data.settings);
  const pending = useRef(0);
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    // Follow changes made elsewhere, such as the Low stimulation button, unless a save is in flight.
    if (pending.current) return;
    latest.current = data.settings;
    setValue(data.settings);
  }, [data.settings]);
  const update = (patch: Partial<Settings>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setValue(next);
    pending.current++;
    setStatus("Saving…");
    setError("");
    queue.current = queue.current
      .then(() => api("/settings", "PUT", next))
      .then(
        () => undefined,
        (e: unknown) =>
          setError(e instanceof Error ? e.message : "Couldn’t save."),
      )
      .then(async () => {
        if (--pending.current) return;
        await refresh().catch(() => undefined);
        setStatus("Saved");
      });
  };
  return { value, update, status, error };
}
type Section = "general" | "defaults" | "data" | "account";
/** Preferences, migraine defaults, data and account settings, each on its own page. */
export function SettingsPage({
  data,
  refresh,
  logout,
  username,
  auth,
  section,
  setSection,
}: {
  data: Data;
  refresh: () => Promise<void>;
  logout: () => void;
  username: string;
  auth: { oidcEnabled: boolean; localEnabled: boolean };
  section: string;
  setSection: (section: Section) => void;
}) {
  const prefs = usePreferences(data, refresh);
  const v = prefs.value;
  const sections: { id: Section; label: string }[] = [
    { id: "general", label: "Display" },
    { id: "defaults", label: "Defaults" },
    { id: "data", label: "Data" },
    { id: "account", label: "Account" },
  ];
  const current = sections.find((s) => s.id === section)?.id ?? "general";
  return (
    <>
      <PageTitle
        eyebrow="Make it yours"
        title="Settings"
        text="Changes save as soon as you make them."
      />
      <SubNav
        label="Settings sections"
        items={sections}
        current={current}
        onSelect={setSection}
      />
      {(current === "general" || current === "defaults") && (
        <p className="save-status" role="status">
          {prefs.status}
        </p>
      )}
      <ErrorMessage error={prefs.error} />
      {current === "general" && (
        <section className="card">
          <h2>Display & comfort</h2>
          <label className="setting-toggle">
            <div>
              <strong>Low-stimulation mode</strong>
              <p className="muted small">
                Softer colours, no movement, and a shorter migraine form.
              </p>
            </div>
            <input
              type="checkbox"
              role="switch"
              checked={v.lowStimulation}
              onChange={(e) =>
                prefs.update({ lowStimulation: e.target.checked })
              }
            />
          </label>
          <ChoiceButtons
            label="Theme"
            options={[
              { value: "system", label: "Match device" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
            value={v.theme}
            onChange={(theme) => prefs.update({ theme: theme ?? v.theme })}
          />
          <div className="form-grid">
            <Field label="Date format">
              <select
                value={v.dateFormat}
                onChange={(e) =>
                  prefs.update({
                    dateFormat: e.target.value as Settings["dateFormat"],
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
                  prefs.update({ timeFormat: e.target.value as "12" | "24" })
                }
              >
                <option value="12">12-hour (2:30 pm)</option>
                <option value="24">24-hour (14:30)</option>
              </select>
            </Field>
          </div>
          <TimezoneField
            value={v.timezone}
            onChange={(timezone) => prefs.update({ timezone })}
          />
          <label className="setting-toggle">
            <div>
              <strong>Weight journal</strong>
              <p className="muted small">
                Optional. Appears under History. Turning it off keeps existing
                records.
              </p>
            </div>
            <input
              type="checkbox"
              role="switch"
              checked={v.weightEnabled}
              onChange={(e) =>
                prefs.update({ weightEnabled: e.target.checked })
              }
            />
          </label>
          {v.weightEnabled && (
            <ChoiceButtons
              label="Weight units"
              options={[
                { value: "kg", label: "Kilograms (kg)" },
                { value: "lb", label: "Pounds (lb)" },
              ]}
              value={v.units}
              onChange={(units) => prefs.update({ units: units ?? v.units })}
            />
          )}
        </section>
      )}
      {current === "defaults" && (
        <section className="card">
          <h2>Migraine defaults</h2>
          <p className="muted">
            These are filled in when you log a migraine with details, and you
            can change them on each entry. “Migraine starting now” records only
            the time.
          </p>
          <ChoiceButtons
            label="Usual side of head"
            options={[
              { value: "Left", label: "Left" },
              { value: "Right", label: "Right" },
              { value: "Both", label: "Both" },
              { value: "Unspecified", label: "Varies" },
            ]}
            value={v.defaultSide}
            onChange={(defaultSide) =>
              prefs.update({ defaultSide: defaultSide ?? "Unspecified" })
            }
          />
          <Chips
            label="Usual pain type"
            options={characters}
            value={v.defaultCharacters}
            onChange={(defaultCharacters) =>
              prefs.update({ defaultCharacters })
            }
          />
          <Chips
            label="Usual symptoms"
            options={symptoms}
            value={v.defaultSymptoms}
            onChange={(defaultSymptoms) => prefs.update({ defaultSymptoms })}
          />
        </section>
      )}
      {current === "data" && <DataSection data={data} />}
      {current === "account" && (
        <AccountSection username={username} auth={auth} logout={logout} />
      )}
      <p className="disclaimer">
        This application records and summarises information and does not provide
        medical advice.
      </p>
    </>
  );
}
/** Backup status and full-journal downloads. */
function DataSection({ data }: { data: Data }) {
  const exportAction = useAction();
  const [backup, setBackup] = useState<string | null>(null);
  const [backupError, setBackupError] = useState("");
  useEffect(() => {
    api<{ lastSuccessful: string | null }>("/backup-status")
      .then((v) => setBackup(v.lastSuccessful))
      .catch((e) => setBackupError(e.message));
  }, []);
  const backupHours = backup
    ? Math.floor((Date.now() - Date.parse(backup)) / 3600000)
    : null;
  const exports = [
    {
      format: "zip",
      label: "Everything (ZIP)",
      text: "All records as spreadsheet files, plus a JSON copy.",
    },
    {
      format: "json",
      label: "Everything (JSON)",
      text: "For moving your journal to another server.",
    },
    {
      format: "csv",
      label: "Migraines (CSV)",
      text: "Your migraine list, to open in a spreadsheet.",
    },
  ];
  return (
    <div className="two-column">
      <section className="card">
        <div className="card-title">
          <h2>Download your data</h2>
          <Download size={21} />
        </div>
        <div className="export-list">
          {exports.map((e) => (
            <div key={e.format}>
              <div>
                <strong>{e.label}</strong>
                <p className="muted small">{e.text}</p>
              </div>
              <button
                className="button secondary"
                disabled={exportAction.busy}
                onClick={() =>
                  void exportAction.run(() =>
                    download(
                      `/export/${e.format}`,
                      `migraine-data.${e.format}`,
                    ),
                  )
                }
              >
                Download<span className="visually-hidden"> {e.label}</span>
              </button>
            </div>
          ))}
        </div>
        <ErrorMessage error={exportAction.error} />
        <p className="small muted">
          Downloads contain private health information. Keep them somewhere you
          trust. For a report to take to an appointment, use Trends → Doctor
          report.
        </p>
      </section>
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
              : backupHours < 48
                ? `${backupHours} hours ago`
                : `${Math.floor(backupHours / 24)} days ago`}
          </p>
        )}
        {(backupHours === null || backupHours > 48) && (
          <p className="gentle-notice">
            A recent backup helps keep your journal safe. Ask your server
            administrator to check the backup schedule.
          </p>
        )}
        <ErrorMessage error={backupError} />
      </section>
    </div>
  );
}
/** Sign-in details, password, sessions and installation help. */
function AccountSection({
  username,
  auth,
  logout,
}: {
  username: string;
  auth: { oidcEnabled: boolean; localEnabled: boolean };
  logout: () => void;
}) {
  const passwordAction = useAction();
  const sessionAction = useAction();
  const [passwordDone, setPasswordDone] = useState("");
  const [sessionsDone, setSessionsDone] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  return (
    <>
      <section className="card">
        <div className="card-title">
          <h2>Account</h2>
          <ShieldCheck size={21} />
        </div>
        <p>
          Signed in as <strong>{username}</strong>
        </p>
        <p className="muted small">
          Password sign-in: {auth.localEnabled ? "on" : "off"} · Single sign-on:{" "}
          {auth.oidcEnabled ? "on" : "not set up"}
        </p>
        <div className="button-row">
          <button
            className="button secondary"
            disabled={sessionAction.busy}
            onClick={() =>
              void sessionAction.run(async () => {
                const r = await api<{ csrf: string }>(
                  "/auth/revoke-sessions",
                  "POST",
                  {},
                );
                setCsrf(r.csrf);
                setSessionsDone("Other devices have been signed out.");
              })
            }
          >
            Sign out other devices
          </button>
          <button className="button secondary" onClick={logout}>
            Sign out
          </button>
        </div>
        {sessionsDone && (
          <p className="success" role="status">
            {sessionsDone}
          </p>
        )}
        <ErrorMessage error={sessionAction.error} />
      </section>
      {auth.localEnabled && (
        <section className="card">
          <h2>Change password</h2>
          <form
            onSubmit={passwordAction.submit(async () => {
              setPasswordDone("");
              const r = await api<{ csrf: string }>("/auth/password", "POST", {
                currentPassword: oldPassword,
                password: newPassword,
              });
              setCsrf(r.csrf);
              setOldPassword("");
              setNewPassword("");
              setPasswordDone(
                "Password changed. Other devices were signed out.",
              );
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
            <Field label="New password" hint="At least 12 characters.">
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
            <ErrorMessage error={passwordAction.error} />
            {passwordDone && (
              <p className="success" role="status">
                {passwordDone}
              </p>
            )}
            <Submit busy={passwordAction.busy}>Change password</Submit>
          </form>
        </section>
      )}
      <section className="card">
        <h2>Install on your phone</h2>
        <p>
          iPhone: open in Safari, tap Share, then Add to Home Screen. Android:
          open the browser menu and choose Install app or Add to Home screen.
        </p>
        <p className="small muted">
          Saving and viewing records needs a connection to your server. Sign-in
          providers, backup schedules and the app name are set by your server
          administrator.
        </p>
        <a
          className="text-button"
          href="/manifest.webmanifest"
          target="_blank"
          rel="noreferrer"
        >
          View app manifest <ExternalLink size={15} />
        </a>
      </section>
    </>
  );
}
