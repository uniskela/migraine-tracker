import { useEffect, useRef, useState, type ReactNode } from "react";
import { DateTime } from "luxon";
import { api, type Data } from "./api";
import {
  ChoiceButtons,
  Chips,
  DateTimeField,
  Empty,
  Field,
  formatClock,
  formatDate,
  localInput,
  localNow,
  StepFlow,
  toUTC,
  useAction,
  useConfirm,
} from "./ui";
import { clearDraft, readDraft, writeDraft } from "./drafts";
import { exitFlow, jumpStep, nextStep, previousStep } from "./router";
import {
  activities,
  characters,
  disruptions,
  factors,
  impacts,
  locations,
  symptoms,
} from "../shared/options";
import {
  emptySleep,
  formatHours,
  normalizeSleep,
  sleepHours,
  sleepQualities,
  wakeDateBefore,
  type SleepRecord,
} from "../shared/sleep";
import type { Episode, EpisodeInput, Settings } from "../shared/validation";
/** Summarise recorded sleep for review screens, or return null when nothing was recorded. */
export function sleepSummary(sleep: SleepRecord | null, settings: Settings) {
  if (!sleep) return null;
  const parts = [
    sleep.bedtime && sleep.wakeTime
      ? `${formatClock(sleep.bedtime, settings)} to ${formatClock(sleep.wakeTime, settings)}`
      : sleep.bedtime
        ? `Bed around ${formatClock(sleep.bedtime, settings)}`
        : sleep.wakeTime
          ? `Woke around ${formatClock(sleep.wakeTime, settings)}`
          : null,
    sleep.hours !== null ? `about ${formatHours(sleep.hours)}` : null,
    sleep.quality ? `${sleepQualities[sleep.quality - 1]} quality` : null,
    sleep.wokeDuringNight ? "woke during the night" : null,
    sleep.unusual ? "unusual sleep" : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
/** Record sleep as approximate clock times; hours are calculated from the times, or estimated directly when a time is unknown. */
export function SleepFields({
  value,
  onChange,
  zone,
  wakeDate,
}: {
  value: SleepRecord | null;
  onChange: (value: SleepRecord | null) => void;
  zone: string;
  wakeDate: (wakeTime: string) => string | undefined;
}) {
  const sleep = value || emptySleep;
  const date = (wake: string) => wakeDate(wake) ?? "";
  const change = (patch: Partial<SleepRecord>) =>
    onChange(normalizeSleep({ ...sleep, ...patch }, zone, date));
  const calculated = sleepHours(
    sleep.bedtime,
    sleep.wakeTime,
    sleep.wakeTime ? wakeDate(sleep.wakeTime) : undefined,
    zone,
  );
  return (
    <div className="sleep-fields">
      <p className="field-hint">Rough times are fine.</p>
      <div className="form-grid">
        <Field label="Went to bed around">
          <input
            type="time"
            value={sleep.bedtime ?? ""}
            onChange={(e) => change({ bedtime: e.target.value || null })}
          />
        </Field>
        <Field label="Woke up around">
          <input
            type="time"
            value={sleep.wakeTime ?? ""}
            onChange={(e) => change({ wakeTime: e.target.value || null })}
          />
        </Field>
      </div>
      {calculated !== null ? (
        <p className="sleep-total" role="status">
          That’s about <strong>{formatHours(calculated)}</strong> of sleep.
          {calculated > 14 && " That’s a long time — check the times."}
        </p>
      ) : (
        <Field
          label="Or estimate hours slept"
          hint="Used when you don’t know both times."
        >
          <input
            type="number"
            inputMode="decimal"
            min="0"
            max="24"
            step="0.25"
            value={sleep.hours ?? ""}
            onChange={(e) =>
              change({
                hours: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </Field>
      )}
      <ChoiceButtons
        label="Sleep quality"
        options={sleepQualities.map((label, i) => ({ value: i + 1, label }))}
        value={sleep.quality}
        allowClear
        onChange={(quality) => change({ quality })}
      />
      <label className="check">
        <input
          type="checkbox"
          checked={sleep.wokeDuringNight}
          onChange={(e) => change({ wokeDuringNight: e.target.checked })}
        />
        Woke during the night
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={sleep.unusual}
          onChange={(e) => change({ unusual: e.target.checked })}
        />
        Unusual sleep (shift, travel, very late night)
      </label>
    </div>
  );
}
/** List recorded answers with a way back to the step that holds each one. */
function Review({
  rows,
}: {
  rows: { label: string; value: ReactNode; edit: () => void }[];
}) {
  return (
    <dl className="review-list">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>
            <span>
              {row.value || <span className="muted">Not recorded</span>}
            </span>
            <button type="button" className="text-button" onClick={row.edit}>
              Edit<span className="visually-hidden"> {row.label}</span>
            </button>
          </dd>
        </div>
      ))}
    </dl>
  );
}
const episodeSteps = {
  when: "When and how bad",
  pain: "Pain and symptoms",
  impact: "Impact on your day",
  context: "What was going on",
  sleep: "Sleep before",
  review: "Notes and review",
} as const;
type EpisodeStep = keyof typeof episodeSteps;
const allSteps = Object.keys(episodeSteps) as EpisodeStep[];
const briefSteps: EpisodeStep[] = ["when", "review"];
const sides = [
  { value: "Left", label: "Left" },
  { value: "Right", label: "Right" },
  { value: "Both", label: "Both" },
  { value: "Unspecified", label: "Not sure" },
] as const;
type EpisodeDraft = {
  value: EpisodeInput;
  start: string;
  end: string;
  ongoing: boolean;
  /** The episode version the draft was started from; a draft of an older version is discarded. */
  base?: string;
};
const sameItems = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v) => b.includes(v));
/** Create or update a migraine one short page at a time; every page can save, and unsaved answers survive an accidental close. */
export function EpisodeFlow({
  id,
  step: requested,
  data,
  saved,
}: {
  id: string;
  step: number;
  data: Data;
  saved: () => Promise<void>;
}) {
  const s = data.settings,
    zone = s.timezone;
  const episode =
    id === "new" ? undefined : data.episodes.find((e) => e.id === id);
  const key = `episode:${id}`;
  const exitTo = episode ? `episode/${episode.id}` : "home";
  const otherActive = data.episodes.some(
    (e) => !e.endedAt && e.id !== episode?.id,
  );
  const action = useAction();
  const confirm = useConfirm();
  const [initial] = useState<EpisodeDraft>(() => ({
    value: episode
      ? {
          ...episode,
          sleep: episode.sleep && { ...emptySleep, ...episode.sleep },
        }
      : {
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
    start: episode ? localInput(episode.startedAt, zone) : localNow(zone),
    end: episode?.endedAt ? localInput(episode.endedAt, zone) : localNow(zone),
    ongoing: episode ? !episode.endedAt : !otherActive,
    base: episode?.updatedAt,
  }));
  const [draft, setDraft] = useState<EpisodeDraft>(() => {
    // Ignore a draft made before the episode last changed (for example, before it was ended).
    const stored = readDraft<EpisodeDraft>(key);
    return stored && stored.base === initial.base ? stored : initial;
  });
  const [brief, setBrief] = useState(s.lowStimulation && !episode);
  const [custom, setCustom] = useState("");
  const [stepError, setStepError] = useState("");
  const visible = brief ? briefSteps : allSteps;
  const index = Math.min(Math.max(0, requested || 0), visible.length - 1);
  const current = visible[index];
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const savedOnce = useRef(false);
  useEffect(() => {
    if (savedOnce.current) return;
    if (dirty) writeDraft(key, { ...draft, step: index });
    else clearDraft(key);
  }, [draft, dirty, key, index]);
  if (id !== "new" && !episode)
    return (
      <Empty
        title="This migraine isn’t in your journal"
        text="It may have been deleted."
        action={
          <button
            className="button secondary"
            onClick={() => exitFlow(key, "history")}
          >
            Back to history
          </button>
        }
      />
    );
  const value = draft.value;
  const set = <K extends keyof EpisodeInput>(k: K, next: EpisodeInput[K]) =>
    setDraft((d) => ({ ...d, value: { ...d.value, [k]: next } }));
  const path = (i: number) => `log/${id}/${i}`;
  const goTo = (step: EpisodeStep) => {
    const list = brief && !briefSteps.includes(step) ? allSteps : visible;
    if (list !== visible) setBrief(false);
    setStepError("");
    jumpStep(key, path(list.indexOf(step)));
  };
  const now = DateTime.now().setZone(zone).plus({ minutes: 1 });
  const startTime = DateTime.fromISO(draft.start, { zone });
  const endTime = DateTime.fromISO(draft.end, { zone });
  const whenError = !startTime.isValid
    ? "Enter the date and time the migraine started."
    : startTime > now
      ? "The start time can’t be in the future."
      : draft.ongoing
        ? ""
        : !endTime.isValid
          ? "Enter when the migraine ended, or mark it as still ongoing."
          : endTime < startTime
            ? "The end time needs to be after the start time."
            : endTime > now
              ? "The end time can’t be in the future."
              : "";
  const startUTC = startTime.isValid ? startTime.toUTC().toISO()! : null;
  const prefilled =
    !episode &&
    (s.defaultSymptoms.length > 0 || s.defaultCharacters.length > 0) &&
    sameItems(value.symptoms, s.defaultSymptoms) &&
    sameItems(value.characters, s.defaultCharacters);
  const save = () =>
    void action.run(async () => {
      if (whenError) {
        goTo("when");
        throw new Error(whenError);
      }
      await api(
        episode ? `/episodes/${episode.id}` : "/episodes",
        episode ? "PUT" : "POST",
        {
          ...value,
          startedAt: toUTC(draft.start, zone),
          endedAt: draft.ongoing ? null : toUTC(draft.end, zone),
        },
      );
      savedOnce.current = true;
      clearDraft(key);
      await saved();
      exitFlow(key, exitTo);
    });
  const addCustom = () => {
    const name = custom.trim();
    if (name) set("factors", [...new Set([...value.factors, name])]);
    setCustom("");
  };
  const list = (items: string[]) => (items.length ? items.join(", ") : null);
  return (
    <StepFlow
      title={episode ? "Update migraine" : "Log a migraine"}
      steps={visible.map((v) => episodeSteps[v])}
      step={index}
      busy={action.busy}
      saveLabel="Save migraine"
      error={stepError || action.error}
      onStep={(i) => goTo(visible[i])}
      onBack={() => {
        setStepError("");
        previousStep(key, path(index - 1));
      }}
      onNext={() => {
        if (current === "when" && whenError) {
          setStepError(whenError);
          return;
        }
        setStepError("");
        nextStep(key, path(index + 1));
      }}
      onSave={save}
      onClose={async () => {
        if (
          dirty &&
          !(await confirm({
            title: episode ? "Discard your changes?" : "Discard this entry?",
            message: "Nothing you entered here will be saved.",
            confirmLabel: "Discard",
            cancelLabel: "Keep editing",
            danger: true,
          }))
        )
          return;
        savedOnce.current = true;
        clearDraft(key);
        exitFlow(key, exitTo);
      }}
    >
      {current === "when" && (
        <>
          <DateTimeField
            label="Started"
            value={draft.start}
            zone={zone}
            onChange={(start) => setDraft((d) => ({ ...d, start }))}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={draft.ongoing}
              disabled={otherActive}
              onChange={(e) =>
                setDraft((d) => ({ ...d, ongoing: e.target.checked }))
              }
            />
            Still ongoing
          </label>
          {otherActive && (
            <p className="field-hint">
              Another migraine is already ongoing, so this one needs an end
              time.
            </p>
          )}
          {!draft.ongoing && (
            <DateTimeField
              label="Ended"
              value={draft.end}
              zone={zone}
              onChange={(end) => setDraft((d) => ({ ...d, end }))}
            />
          )}
          <fieldset className="severity-field">
            <legend>
              Pain severity{" "}
              <span>
                {value.severity ? `${value.severity}/10` : "optional"}
              </span>
            </legend>
            <div className="severity-buttons">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  type="button"
                  key={n}
                  aria-label={`Severity ${n}`}
                  aria-pressed={value.severity === n}
                  onClick={() =>
                    set("severity", value.severity === n ? null : n)
                  }
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="scale-labels">
              <span>1 · Mild</span>
              <span>10 · Worst</span>
            </div>
            {value.severity !== null && (
              <button
                type="button"
                className="text-button"
                onClick={() => set("severity", null)}
              >
                Clear severity
              </button>
            )}
          </fieldset>
          <ChoiceButtons
            label="Side of head"
            options={[...sides]}
            value={value.side}
            onChange={(side) => set("side", side ?? "Unspecified")}
          />
          {prefilled && (
            <p className="prefill-note">
              Your usual symptoms are filled in:{" "}
              {[...s.defaultCharacters, ...s.defaultSymptoms].join(", ")}.{" "}
              <button
                type="button"
                className="text-button"
                onClick={() => goTo("pain")}
              >
                Check them
              </button>
            </p>
          )}
        </>
      )}
      {current === "pain" && (
        <>
          {prefilled && (
            <p className="prefill-note">
              Filled in from your usual symptoms. Tap any that don’t apply
              today.
            </p>
          )}
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
          <Chips
            label="Other symptoms"
            options={symptoms}
            value={value.symptoms}
            onChange={(v) => set("symptoms", v)}
          />
        </>
      )}
      {current === "impact" && (
        <>
          <ChoiceButtons
            label="How much did this affect your day?"
            options={impacts.map((label, i) => ({
              value: i,
              label: `${i} · ${label}`,
            }))}
            value={value.impact}
            allowClear
            onChange={(v) => set("impact", v)}
          />
          <Chips
            label="Changes to your plans"
            options={disruptions}
            value={value.disruptions}
            onChange={(v) => set("disruptions", v)}
          />
          <Chips
            label="What kind of day was it?"
            options={activities}
            value={value.activities}
            onChange={(v) => set("activities", v)}
          />
        </>
      )}
      {current === "context" && (
        <>
          <p className="field-hint">
            Noting what was going on can help you spot patterns. It doesn’t mean
            it caused the migraine.
          </p>
          <Chips
            label="Did any of these apply?"
            options={[...new Set([...factors, ...value.factors])]}
            value={value.factors}
            onChange={(v) => set("factors", v)}
          />
          <div className="inline">
            <Field label="Add your own">
              <input
                value={custom}
                maxLength={80}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustom();
                  }
                }}
              />
            </Field>
            <button
              type="button"
              className="button secondary"
              onClick={addCustom}
            >
              Add
            </button>
          </div>
        </>
      )}
      {current === "sleep" && (
        <>
          <p className="muted">The night before this migraine started.</p>
          <SleepFields
            value={value.sleep}
            zone={zone}
            wakeDate={(wake) =>
              startUTC ? wakeDateBefore(startUTC, wake, zone) : undefined
            }
            onChange={(v) => set("sleep", v)}
          />
        </>
      )}
      {current === "review" && (
        <>
          <Field label="Notes">
            <textarea
              rows={4}
              maxLength={5000}
              placeholder="Anything else you want to remember?"
              value={value.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
          <h2 className="review-heading">Check before saving</h2>
          <Review
            rows={[
              {
                label: "When",
                value: startTime.isValid
                  ? `${formatDate(startTime.toISO()!, s, true)} · ${
                      draft.ongoing
                        ? "still ongoing"
                        : endTime.isValid
                          ? `ended ${formatDate(endTime.toISO()!, s, true)}`
                          : "end time missing"
                    }`
                  : null,
                edit: () => goTo("when"),
              },
              {
                label: "Severity",
                value: value.severity && `${value.severity}/10`,
                edit: () => goTo("when"),
              },
              {
                label: "Side of head",
                value: value.side === "Unspecified" ? null : value.side,
                edit: () => goTo("when"),
              },
              {
                label: "Pain",
                value: list([...value.locations, ...value.characters]),
                edit: () => goTo("pain"),
              },
              {
                label: "Symptoms",
                value: list(value.symptoms),
                edit: () => goTo("pain"),
              },
              {
                label: "Impact",
                value:
                  value.impact !== null &&
                  `${value.impact} · ${impacts[value.impact]}`,
                edit: () => goTo("impact"),
              },
              {
                label: "Plans and activity",
                value: list([...value.disruptions, ...value.activities]),
                edit: () => goTo("impact"),
              },
              {
                label: "What was going on",
                value: list(value.factors),
                edit: () => goTo("context"),
              },
              {
                label: "Sleep before",
                value: sleepSummary(value.sleep, s),
                edit: () => goTo("sleep"),
              },
            ]}
          />
          {brief && (
            <button
              type="button"
              className="button secondary"
              onClick={() => goTo("pain")}
            >
              Add more details
            </button>
          )}
        </>
      )}
    </StepFlow>
  );
}
type DailyValue = Data["daily"][number] | ReturnType<typeof emptyDay>;
const emptyDay = (date: string) => ({
  date,
  factors: [] as string[],
  activities: [] as string[],
  sleep: null as Episode["sleep"],
  notes: "",
});
const checkInSteps = ["Your day", "Last night’s sleep", "Notes"];
/** Record non-migraine daily context in three short steps, keeping edits when the date changes. */
export function CheckInFlow({
  date,
  step: requested,
  data,
  saved,
}: {
  date: string;
  step: number;
  data: Data;
  saved: () => Promise<void>;
}) {
  const zone = data.settings.timezone;
  const today = DateTime.now().setZone(zone).toISODate()!;
  const key = "checkin";
  const action = useAction();
  const confirm = useConfirm();
  const load = (d: string): DailyValue =>
    data.daily.find((v) => v.date === d) || emptyDay(d);
  const [initial, setInitial] = useState(() => load(date || today));
  const [value, setValue] = useState<DailyValue>(() => {
    const draft = readDraft<DailyValue>(key);
    return draft && (!date || draft.date === date) ? draft : initial;
  });
  const savedOnce = useRef(false);
  const dirty = JSON.stringify(value) !== JSON.stringify(initial);
  const index = Math.min(Math.max(0, requested || 0), checkInSteps.length - 1);
  useEffect(() => {
    if (savedOnce.current) return;
    if (dirty) writeDraft(key, value);
    else clearDraft(key);
  }, [value, dirty]);
  const path = (i: number, d = value.date) => `checkin/${d}/${i}`;
  const existing = data.daily.some((d) => d.date === initial.date);
  const changeDate = async (next: string) => {
    if (!next) return;
    const other = data.daily.find((d) => d.date === next);
    if (other) {
      if (
        dirty &&
        !(await confirm({
          title: "Open that day’s check-in?",
          message: `You already checked in on ${formatDate(next, data.settings)}. Opening it replaces what you’ve entered here.`,
          confirmLabel: "Open it",
          cancelLabel: "Stay here",
        }))
      )
        return;
      setInitial(other);
      setValue(other);
    } else {
      setInitial(emptyDay(next));
      setValue({ ...value, date: next });
    }
    jumpStep(key, path(index, next));
  };
  const save = () =>
    void action.run(async () => {
      await api("/daily", "PUT", {
        date: value.date,
        factors: value.factors,
        activities: value.activities,
        sleep: value.sleep,
        notes: value.notes,
      });
      savedOnce.current = true;
      clearDraft(key);
      await saved();
      exitFlow(key, "home");
    });
  return (
    <StepFlow
      title={existing ? "Update check-in" : "Daily check-in"}
      steps={checkInSteps}
      step={index}
      busy={action.busy}
      saveLabel="Save check-in"
      error={action.error}
      onStep={(i) => jumpStep(key, path(i))}
      onBack={() => previousStep(key, path(index - 1))}
      onNext={() => nextStep(key, path(index + 1))}
      onSave={save}
      onClose={async () => {
        if (
          dirty &&
          !(await confirm({
            title: "Discard this check-in?",
            message: "Nothing you entered here will be saved.",
            confirmLabel: "Discard",
            cancelLabel: "Keep editing",
            danger: true,
          }))
        )
          return;
        savedOnce.current = true;
        clearDraft(key);
        exitFlow(key, "home");
      }}
    >
      {index === 0 && (
        <>
          <p className="muted">
            Checking in on days with and without a migraine lets you compare
            patterns later.
          </p>
          <Field label="Date">
            <input
              type="date"
              required
              value={value.date}
              max={today}
              onChange={(e) => void changeDate(e.target.value)}
            />
          </Field>
          <Chips
            label="Did any of these apply today?"
            options={[...new Set([...factors, ...value.factors])]}
            value={value.factors}
            onChange={(factors) => setValue({ ...value, factors })}
          />
          <Chips
            label="What kind of day was it?"
            options={activities}
            value={value.activities}
            onChange={(activities) => setValue({ ...value, activities })}
          />
        </>
      )}
      {index === 1 && (
        <SleepFields
          value={value.sleep}
          zone={zone}
          wakeDate={() => value.date}
          onChange={(sleep) => setValue({ ...value, sleep })}
        />
      )}
      {index === 2 && (
        <Field label="Notes">
          <textarea
            rows={4}
            maxLength={5000}
            placeholder="Anything worth remembering about today?"
            value={value.notes}
            onChange={(e) => setValue({ ...value, notes: e.target.value })}
          />
        </Field>
      )}
    </StepFlow>
  );
}
