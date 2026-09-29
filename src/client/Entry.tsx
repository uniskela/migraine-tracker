import { useState } from "react";
import { DateTime } from "luxon";
import { api, type Data } from "./api";
import {
  Chips,
  ErrorMessage,
  Field,
  localInput,
  localNow,
  Modal,
  Submit,
  toUTC,
  useAction,
} from "./ui";
import {
  activities,
  characters,
  disruptions,
  factors,
  impacts,
  locations,
  symptoms,
} from "../shared/options";
import type { Episode, EpisodeInput } from "../shared/validation";
export function SleepFields({
  value,
  onChange,
  zone,
}: {
  value: Episode["sleep"];
  onChange: (value: Episode["sleep"]) => void;
  zone: string;
}) {
  const sleep = value || {
    bedtime: null,
    wakeTime: null,
    hours: null,
    quality: null,
    unusual: false,
    wokeDuringNight: false,
  };
  const change = (key: string, next: unknown) =>
    onChange({ ...sleep, [key]: next });
  return (
    <div className="form-grid">
      <Field label="Bedtime">
        <input
          type="datetime-local"
          value={sleep.bedtime ? localInput(sleep.bedtime, zone) : ""}
          onChange={(e) =>
            change(
              "bedtime",
              e.target.value ? toUTC(e.target.value, zone) : null,
            )
          }
        />
      </Field>
      <Field label="Wake time">
        <input
          type="datetime-local"
          value={sleep.wakeTime ? localInput(sleep.wakeTime, zone) : ""}
          onChange={(e) =>
            change(
              "wakeTime",
              e.target.value ? toUTC(e.target.value, zone) : null,
            )
          }
        />
      </Field>
      <Field label="Estimated sleep (hours)">
        <input
          type="number"
          min="0"
          max="24"
          step="0.25"
          value={sleep.hours ?? ""}
          onChange={(e) =>
            change("hours", e.target.value ? Number(e.target.value) : null)
          }
        />
      </Field>
      <Field label="Sleep quality">
        <select
          value={sleep.quality ?? ""}
          onChange={(e) =>
            change("quality", e.target.value ? Number(e.target.value) : null)
          }
        >
          <option value="">Not recorded</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n} — {n === 1 ? "Very poor" : n === 5 ? "Very good" : ""}
            </option>
          ))}
        </select>
      </Field>
      <label className="check">
        <input
          type="checkbox"
          checked={sleep.unusual}
          onChange={(e) => change("unusual", e.target.checked)}
        />
        Unusual sleep
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={sleep.wokeDuringNight}
          onChange={(e) => change("wokeDuringNight", e.target.checked)}
        />
        Woke during the night
      </label>
    </div>
  );
}
export function Entry({
  episode,
  data,
  close,
  saved,
  takeDose,
}: {
  episode?: Episode;
  data: Data;
  close: () => void;
  saved: () => Promise<void>;
  takeDose: (id: string) => void;
}) {
  const s = data.settings,
    zone = s.timezone;
  const action = useAction();
  const [start, setStart] = useState(
    episode ? localInput(episode.startedAt, zone) : localNow(zone),
  );
  const [end, setEnd] = useState(
    episode?.endedAt ? localInput(episode.endedAt, zone) : localNow(zone),
  );
  const [ongoing, setOngoing] = useState(!episode?.endedAt);
  const [value, setValue] = useState<EpisodeInput>(
    episode || {
      startedAt: "",
      endedAt: null,
      severity: null,
      side: s.defaultSide,
      locations: [],
      characters: s.defaultCharacters,
      symptoms: s.defaultSymptoms,
      factors: [],
      impact: null,
      activities: [],
      disruptions: [],
      sleep: null,
      notes: "",
    },
  );
  const [custom, setCustom] = useState("");
  const set = (key: keyof EpisodeInput, next: unknown) =>
    setValue((v) => ({ ...v, [key]: next }));
  return (
    <Modal title={episode ? "Update migraine" : "Log a migraine"} close={close}>
      <form
        onSubmit={action.submit(async () => {
          await api(
            episode ? `/episodes/${episode.id}` : "/episodes",
            episode ? "PUT" : "POST",
            {
              ...value,
              startedAt: toUTC(start, zone),
              endedAt: ongoing ? null : toUTC(end, zone),
            },
          );
          await saved();
          close();
        })}
      >
        <p className="muted">A little now is enough. You can add more later.</p>
        <div className="form-grid">
          <Field label="Started">
            <input
              type="datetime-local"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <label className="check ongoing">
            <input
              type="checkbox"
              checked={ongoing}
              onChange={(e) => setOngoing(e.target.checked)}
            />
            Still ongoing
          </label>
          {!ongoing && (
            <Field label="Ended">
              <input
                type="datetime-local"
                required
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </Field>
          )}
        </div>
        <fieldset className="severity-field">
          <legend>
            Pain severity{" "}
            <span>
              {value.severity ? `${value.severity}/10` : "— optional"}
            </span>
          </legend>
          <div className="severity-buttons">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                type="button"
                key={n}
                aria-label={`Severity ${n}`}
                aria-pressed={value.severity === n}
                onClick={() => set("severity", n)}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="scale-labels">
            <span>Mild</span>
            <span>Severe</span>
          </div>
        </fieldset>
        <Field label="Side of head">
          <select
            value={value.side}
            onChange={(e) => set("side", e.target.value)}
          >
            {["Unspecified", "Left", "Right", "Both"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <details open={!s.lowStimulation}>
          <summary>Pain location & character</summary>
          <Chips
            label="Where does it hurt?"
            options={locations}
            value={value.locations}
            onChange={(v) => set("locations", v)}
          />
          <Chips
            label="What does it feel like?"
            options={characters}
            value={value.characters}
            onChange={(v) => set("characters", v)}
          />
        </details>
        <details open={!s.lowStimulation}>
          <summary>Symptoms</summary>
          <Chips
            label="What are you experiencing?"
            options={symptoms}
            value={value.symptoms}
            onChange={(v) => set("symptoms", v)}
          />
        </details>
        <details>
          <summary>Impact on your day</summary>
          <Field label="How much did this affect your day?">
            <select
              value={value.impact ?? ""}
              onChange={(e) =>
                set(
                  "impact",
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
            >
              <option value="">Not recorded</option>
              {impacts.map((v, i) => (
                <option key={v} value={i}>
                  {i} — {v}
                </option>
              ))}
            </select>
          </Field>
          <Chips
            label="Changes to your plans"
            options={disruptions}
            value={value.disruptions}
            onChange={(v) => set("disruptions", v)}
          />
          <Chips
            label="Activity"
            options={activities}
            value={value.activities}
            onChange={(v) => set("activities", v)}
          />
        </details>
        <details>
          <summary>Associated factors</summary>
          <p className="muted small">
            Context can help you spot patterns. An association does not
            establish a cause.
          </p>
          <Chips
            label="Possible context"
            options={[...new Set([...factors, ...value.factors])]}
            value={value.factors}
            onChange={(v) => set("factors", v)}
          />
          <div className="inline">
            <Field label="Custom factor">
              <input
                value={custom}
                maxLength={80}
                onChange={(e) => setCustom(e.target.value)}
              />
            </Field>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                if (custom.trim())
                  set("factors", [
                    ...new Set([...value.factors, custom.trim()]),
                  ]);
                setCustom("");
              }}
            >
              Add
            </button>
          </div>
        </details>
        <details>
          <summary>Sleep</summary>
          <SleepFields
            value={value.sleep}
            onChange={(v) => set("sleep", v)}
            zone={zone}
          />
        </details>
        <details>
          <summary>Notes</summary>
          <Field label="Anything else to remember?">
            <textarea
              rows={3}
              maxLength={5000}
              value={value.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
        </details>
        {episode && (
          <div className="button-row">
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                close();
                takeDose(episode.id);
              }}
            >
              Record medication
            </button>
            <button
              type="button"
              className="text-button danger"
              disabled={action.busy}
              onClick={() => {
                if (
                  confirm(
                    "Delete this migraine? Medication doses will be kept as standalone records.",
                  )
                )
                  void action.run(async () => {
                    await api(`/episodes/${episode.id}`, "DELETE");
                    await saved();
                    close();
                  });
              }}
            >
              Delete migraine
            </button>
          </div>
        )}
        <ErrorMessage error={action.error} />
        <div className="form-footer">
          <span className="muted small">Saved privately on your server</span>
          <Submit busy={action.busy}>Save migraine</Submit>
        </div>
      </form>
    </Modal>
  );
}
export function DailyEntry({
  data,
  close,
  saved,
}: {
  data: Data;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const today = DateTime.now().setZone(data.settings.timezone).toISODate()!;
  const action = useAction();
  const empty = (date: string) => ({
    date,
    factors: [] as string[],
    activities: [] as string[],
    sleep: null as Episode["sleep"],
    notes: "",
  });
  const [value, setValue] = useState(
    data.daily.find((d) => d.date === today) || empty(today),
  );
  return (
    <Modal title="Daily check-in" close={close}>
      <form
        onSubmit={action.submit(async () => {
          await api("/daily", "PUT", value);
          await saved();
          close();
        })}
      >
        <p className="muted">
          A check-in on any day helps put your migraine patterns in context.
          Record migraines separately.
        </p>
        <Field label="Date">
          <input
            type="date"
            required
            value={value.date}
            max={today}
            onChange={(e) =>
              setValue(
                data.daily.find((d) => d.date === e.target.value) ||
                  empty(e.target.value),
              )
            }
          />
        </Field>
        <Chips
          label="Associated factors today"
          options={factors}
          value={value.factors}
          onChange={(factors) => setValue({ ...value, factors })}
        />
        <Chips
          label="Activity"
          options={activities}
          value={value.activities}
          onChange={(activities) => setValue({ ...value, activities })}
        />
        <details>
          <summary>Sleep</summary>
          <SleepFields
            value={value.sleep}
            zone={data.settings.timezone}
            onChange={(sleep) => setValue({ ...value, sleep })}
          />
        </details>
        <Field label="Notes">
          <textarea
            maxLength={5000}
            value={value.notes}
            onChange={(e) => setValue({ ...value, notes: e.target.value })}
          />
        </Field>
        <ErrorMessage error={action.error} />
        <Submit busy={action.busy}>Save check-in</Submit>
      </form>
    </Modal>
  );
}
