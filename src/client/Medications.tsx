import { useState } from "react";
import { Plus, Pill, ArrowRight } from "lucide-react";
import { DateTime } from "luxon";
import type { Dose, Medication } from "../shared/validation";
import { medicationNames, sideEffects } from "../shared/options";
import { api, type Data } from "./api";
import {
  ChoiceButtons,
  DateTimeField,
  Empty,
  ErrorMessage,
  Field,
  formatDate,
  localNow,
  Modal,
  PageTitle,
  Submit,
  toUTC,
  useAction,
  useConfirm,
} from "./ui";
const reviewDelays = [30, 60, 120, 240, 720, 1440];
const relief = ["None", "Some", "Good", "Complete"] as const;
/** Record a medication event for the selected episode using user-entered dose and time. */
export function DoseForm({
  data,
  episodeId,
  close,
  saved,
  addMedication,
}: {
  data: Data;
  episodeId?: string;
  close: () => void;
  saved: () => Promise<void>;
  addMedication: () => void;
}) {
  const available = data.medications.filter(
    (m) => m.active && (episodeId ? m.category === "acute" : true),
  );
  const first = available[0];
  const action = useAction();
  const [initial] = useState(() => ({
    medicationId: first?.id || "",
    dose: first?.dose?.toString() || "",
    units: first?.units || "mg",
    time: localNow(data.settings.timezone),
    review: 120,
    notes: "",
  }));
  const [v, setV] = useState(initial);
  return (
    <Modal
      title="Record medication"
      close={close}
      dirty={JSON.stringify(v) !== JSON.stringify(initial)}
    >
      {!available.length ? (
        <Empty
          title={
            episodeId
              ? "Add an acute medication first"
              : "Add a medication first"
          }
          text={
            episodeId
              ? "Doses for a migraine use your acute (as-needed) medications. This app never suggests medications or doses."
              : "Add the medication you use, then record doses here. This app never suggests medications or doses."
          }
          action={
            <button className="button primary" onClick={addMedication}>
              <Plus size={17} />
              Add a medication
            </button>
          }
        />
      ) : (
        <form
          onSubmit={action.submit(async () => {
            await api("/doses", "POST", {
              medicationId: v.medicationId,
              episodeId: episodeId || null,
              dose: Number(v.dose),
              units: v.units,
              takenAt: toUTC(v.time, data.settings.timezone),
              reviewAfterMinutes: v.review,
              notes: v.notes,
            });
            await saved();
            close();
          })}
        >
          <Field label="Medication">
            <select
              value={v.medicationId}
              onChange={(e) => {
                const m = available.find((m) => m.id === e.target.value)!;
                setV({
                  ...v,
                  medicationId: m.id,
                  dose: m.dose?.toString() || "",
                  units: m.units,
                });
              }}
            >
              {available.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="form-grid">
            <Field label="Dose taken">
              <input
                type="number"
                inputMode="decimal"
                min="0.001"
                step="any"
                required
                value={v.dose}
                onChange={(e) => setV({ ...v, dose: e.target.value })}
              />
            </Field>
            <Field label="Units">
              <input
                value={v.units}
                required
                maxLength={30}
                onChange={(e) => setV({ ...v, units: e.target.value })}
              />
            </Field>
          </div>
          <DateTimeField
            label="Taken"
            value={v.time}
            zone={data.settings.timezone}
            onChange={(time) => setV({ ...v, time })}
          />
          <Field
            label="Ask how it helped after"
            hint="A prompt appears on Home when you next open the app. It isn’t a notification or a reminder to take more."
          >
            <select
              value={v.review}
              onChange={(e) => setV({ ...v, review: Number(e.target.value) })}
            >
              {reviewDelays.map((n) => (
                <option key={n} value={n}>
                  {n < 60 ? `${n} minutes` : `${n / 60} hours`}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes">
            <textarea
              maxLength={5000}
              value={v.notes}
              onChange={(e) => setV({ ...v, notes: e.target.value })}
            />
          </Field>
          <ErrorMessage error={action.error} />
          <Submit busy={action.busy}>Save dose</Submit>
        </form>
      )}
    </Modal>
  );
}
/** Edit medication details and schedules without suggesting a dose or treatment. */
function MedicationForm({
  medication,
  close,
  saved,
}: {
  medication?: Medication;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [initial] = useState(() => ({
    name: medication?.name || "",
    category: medication?.category || "acute",
    dose: medication?.dose?.toString() || "",
    units: medication?.units || "mg",
    frequency: medication?.frequency || "",
    startDate: medication?.startDate || "",
    endDate: medication?.endDate || "",
    active: medication?.active ?? true,
    notes: medication?.notes || "",
  }));
  const [v, setV] = useState(initial);
  const action = useAction();
  return (
    <Modal
      title={medication ? "Edit medication" : "Add medication"}
      close={close}
      dirty={JSON.stringify(v) !== JSON.stringify(initial)}
    >
      <form
        onSubmit={action.submit(async () => {
          await api(
            medication ? `/medications/${medication.id}` : "/medications",
            medication ? "PUT" : "POST",
            {
              ...v,
              dose: v.dose ? Number(v.dose) : null,
              startDate: v.startDate || null,
              endDate: v.endDate || null,
            },
          );
          await saved();
          close();
        })}
      >
        <Field label="Medication name">
          <input
            list="medication-names"
            required
            maxLength={120}
            value={v.name}
            onChange={(e) => setV({ ...v, name: e.target.value })}
          />
          <datalist id="medication-names">
            {medicationNames.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </datalist>
        </Field>
        <ChoiceButtons
          label="Type"
          options={[
            { value: "acute", label: "Acute (when a migraine starts)" },
            { value: "preventive", label: "Preventive (taken regularly)" },
          ]}
          value={v.category}
          onChange={(category) =>
            setV({ ...v, category: category ?? v.category })
          }
        />
        <div className="form-grid">
          <Field label="Your prescribed dose (optional)">
            <input
              type="number"
              inputMode="decimal"
              min="0.001"
              step="any"
              value={v.dose}
              onChange={(e) => setV({ ...v, dose: e.target.value })}
            />
          </Field>
          <Field label="Units">
            <input
              maxLength={30}
              value={v.units}
              onChange={(e) => setV({ ...v, units: e.target.value })}
            />
          </Field>
        </div>
        <Field label="How often (as prescribed)">
          <input
            maxLength={120}
            placeholder="e.g. Nightly"
            value={v.frequency}
            onChange={(e) => setV({ ...v, frequency: e.target.value })}
          />
        </Field>
        <div className="form-grid">
          <Field label="Start date">
            <input
              type="date"
              value={v.startDate}
              onChange={(e) => setV({ ...v, startDate: e.target.value })}
            />
          </Field>
          <Field label="End date">
            <input
              type="date"
              value={v.endDate}
              onChange={(e) => setV({ ...v, endDate: e.target.value })}
            />
          </Field>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={v.active}
            onChange={(e) => setV({ ...v, active: e.target.checked })}
          />
          I’m currently taking this
        </label>
        <Field label="Notes">
          <textarea
            maxLength={5000}
            value={v.notes}
            onChange={(e) => setV({ ...v, notes: e.target.value })}
          />
        </Field>
        <p className="muted small">
          Name suggestions only save typing. This app does not recommend
          medications or doses.
        </p>
        <ErrorMessage error={action.error} />
        <Submit busy={action.busy}>Save medication</Submit>
      </form>
    </Modal>
  );
}
/** Record a dated side effect and its user-rated severity for a medication. */
function EffectForm({
  data,
  close,
  saved,
}: {
  data: Data;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const meds = [...data.medications].sort(
    (a, b) => Number(b.active) - Number(a.active),
  );
  const action = useAction();
  const [initial] = useState(() => ({
    medicationId:
      meds.find((m) => m.category === "preventive" && m.active)?.id ||
      meds[0]?.id ||
      "",
    name: "",
    severity: 1,
    date: DateTime.now().setZone(data.settings.timezone).toISODate()!,
    notes: "",
  }));
  const [v, setV] = useState(initial);
  return (
    <Modal
      title="Record a side effect"
      close={close}
      dirty={JSON.stringify(v) !== JSON.stringify(initial)}
    >
      <form
        onSubmit={action.submit(async () => {
          await api("/effects", "POST", v);
          await saved();
          close();
        })}
      >
        <Field label="Medication">
          <select
            required
            value={v.medicationId}
            onChange={(e) => setV({ ...v, medicationId: e.target.value })}
          >
            {meds.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.active ? "" : " (not current)"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Side effect">
          <input
            list="effects"
            required
            maxLength={120}
            value={v.name}
            onChange={(e) => setV({ ...v, name: e.target.value })}
          />
          <datalist id="effects">
            {sideEffects.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </datalist>
        </Field>
        <ChoiceButtons
          label="How bad was it?"
          options={["Barely", "Mild", "Moderate", "Strong", "Severe"].map(
            (label, i) => ({ value: i + 1, label: `${i + 1} · ${label}` }),
          )}
          value={v.severity}
          onChange={(severity) => setV({ ...v, severity: severity ?? 1 })}
        />
        <Field label="Date">
          <input
            type="date"
            required
            value={v.date}
            onChange={(e) => setV({ ...v, date: e.target.value })}
          />
        </Field>
        <Field label="Notes">
          <textarea
            maxLength={5000}
            value={v.notes}
            onChange={(e) => setV({ ...v, notes: e.target.value })}
          />
        </Field>
        <ErrorMessage error={action.error} />
        <Submit busy={action.busy}>Save side effect</Submit>
      </form>
    </Modal>
  );
}
/** Collect retrospective relief ratings and notes for a recorded medication event. */
export function DoseReview({
  dose,
  data,
  saved,
  showDate = true,
}: {
  dose: Dose;
  data: Data;
  saved: () => Promise<void>;
  showDate?: boolean;
}) {
  const action = useAction();
  const confirm = useConfirm();
  const name = data.medications.find((m) => m.id === dose.medicationId)?.name;
  return (
    <div className="dose-row">
      <div>
        <strong>{name}</strong>
        <p className="muted small">
          {dose.dose} {dose.units} ·{" "}
          {showDate
            ? formatDate(dose.takenAt, data.settings, true)
            : DateTime.fromISO(dose.takenAt)
                .setZone(data.settings.timezone)
                .toFormat(
                  data.settings.timeFormat === "24" ? "HH:mm" : "h:mm a",
                )}
        </p>
      </div>
      <Field label="How much did it help?">
        <select
          aria-label={`How much ${name} helped`}
          value={dose.effectiveness || ""}
          disabled={action.busy}
          onChange={(e) =>
            void action.run(async () => {
              await api(`/doses/${dose.id}`, "PATCH", {
                effectiveness: e.target.value || null,
              });
              await saved();
            })
          }
        >
          <option value="">Not recorded</option>
          {relief.map((v) => (
            <option key={v} value={v}>
              {v === "None"
                ? "Not at all"
                : v === "Some"
                  ? "A little"
                  : v === "Good"
                    ? "A lot"
                    : "Completely"}
            </option>
          ))}
        </select>
      </Field>
      <button
        className="text-button danger"
        disabled={action.busy}
        onClick={async () => {
          if (
            await confirm({
              title: "Delete this dose?",
              message: `${name}, ${dose.dose} ${dose.units} on ${formatDate(dose.takenAt, data.settings, true)}. This can’t be undone.`,
              confirmLabel: "Delete dose",
              danger: true,
            })
          )
            void action.run(async () => {
              await api(`/doses/${dose.id}`, "DELETE");
              await saved();
            });
        }}
      >
        Delete<span className="visually-hidden"> dose of {name}</span>
      </button>
      <ErrorMessage error={action.error} />
    </div>
  );
}
/** Manage preventive and acute medications, doses and reported side effects. */
export function Medications({
  data,
  saved,
  takeDose,
  adding,
  setAdding,
}: {
  data: Data;
  saved: () => Promise<void>;
  takeDose: () => void;
  adding: boolean;
  setAdding: (open: boolean) => void;
}) {
  const [edit, setEdit] = useState<Medication | null>(null);
  const [effect, setEffect] = useState(false);
  const [shownDays, setShownDays] = useState(14);
  const action = useAction();
  const confirm = useConfirm();
  const zone = data.settings.timezone;
  const byDay = new Map<string, Dose[]>();
  for (const d of [...data.doses].sort((a, b) =>
    b.takenAt.localeCompare(a.takenAt),
  )) {
    const day = DateTime.fromISO(d.takenAt).setZone(zone).toISODate()!;
    byDay.set(day, [...(byDay.get(day) || []), d]);
  }
  const days = [...byDay];
  return (
    <>
      <PageTitle
        eyebrow="Your journal"
        title="Medications"
        text="What you take, and how it helps."
        action={
          <button className="button primary" onClick={() => setAdding(true)}>
            <Plus size={18} />
            Add medication
          </button>
        }
      />
      <div className="two-column">
        {(["acute", "preventive"] as const).map((category) => (
          <section className="card" key={category}>
            <div className="card-title">
              <h2>
                {category === "preventive"
                  ? "Preventive · taken regularly"
                  : "Acute · when a migraine starts"}
              </h2>
              <Pill size={20} />
            </div>
            {data.medications
              .filter((m) => m.category === category)
              .sort((a, b) => Number(b.active) - Number(a.active))
              .map((m) => (
                <button
                  className="medication-card"
                  key={m.id}
                  onClick={() => setEdit(m)}
                >
                  <div className="med-icon">
                    <Pill size={21} />
                  </div>
                  <div>
                    <strong>{m.name}</strong>
                    <p>
                      {m.dose ?? ""} {m.units}{" "}
                      {m.frequency && `· ${m.frequency}`}
                    </p>
                    <small>
                      {m.active ? "Current" : "Not current"}
                      {m.startDate
                        ? ` · started ${formatDate(m.startDate, data.settings)}`
                        : ""}
                    </small>
                  </div>
                  <ArrowRight size={18} />
                </button>
              ))}
            {!data.medications.some((m) => m.category === category) && (
              <p className="muted">No {category} medications yet.</p>
            )}
          </section>
        ))}
      </div>
      <section className="card">
        <div className="card-title">
          <h2>Doses you’ve recorded</h2>
          <button className="button secondary" onClick={takeDose}>
            <Plus size={17} />
            Record dose
          </button>
        </div>
        {days.slice(0, shownDays).map(([day, doses]) => (
          <div className="dose-day" key={day}>
            <h3>{formatDate(day, data.settings)}</h3>
            {doses.map((d) => (
              <DoseReview
                key={d.id}
                dose={d}
                data={data}
                saved={saved}
                showDate={false}
              />
            ))}
          </div>
        ))}
        {days.length > shownDays && (
          <button
            className="button secondary"
            onClick={() => setShownDays(shownDays + 14)}
          >
            Show earlier doses
          </button>
        )}
        {!data.doses.length && (
          <p className="muted">
            Doses you record, and how much they helped, will appear here.
          </p>
        )}
      </section>
      <section className="card">
        <div className="card-title">
          <h2>Side effects</h2>
          <button
            className="text-button"
            disabled={!data.medications.length}
            onClick={() => setEffect(true)}
          >
            Add side effect <Plus size={16} />
          </button>
        </div>
        {[...data.effects]
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((e) => (
            <div className="list-row" key={e.id}>
              <div>
                <strong>{e.name}</strong>
                <p className="muted small">
                  {data.medications.find((m) => m.id === e.medicationId)?.name}{" "}
                  · {formatDate(e.date, data.settings)} · {e.severity}/5
                </p>
                {e.notes && <p>{e.notes}</p>}
              </div>
              <button
                className="text-button danger"
                onClick={async () => {
                  if (
                    await confirm({
                      title: "Delete this side effect?",
                      message: `${e.name} on ${formatDate(e.date, data.settings)}. This can’t be undone.`,
                      confirmLabel: "Delete",
                      danger: true,
                    })
                  )
                    void action.run(async () => {
                      await api(`/effects/${e.id}`, "DELETE");
                      await saved();
                    });
                }}
              >
                Delete<span className="visually-hidden"> {e.name}</span>
              </button>
            </div>
          ))}
        {!data.effects.length && (
          <p className="muted">No side effects recorded.</p>
        )}
        <ErrorMessage error={action.error} />
      </section>
      {(adding || edit) && (
        <MedicationForm
          medication={edit ?? undefined}
          close={() => {
            setEdit(null);
            setAdding(false);
          }}
          saved={saved}
        />
      )}
      {effect && (
        <EffectForm data={data} close={() => setEffect(false)} saved={saved} />
      )}
    </>
  );
}
