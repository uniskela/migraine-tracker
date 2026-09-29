import { useState } from "react";
import { Plus, Pill, ArrowRight } from "lucide-react";
import { DateTime } from "luxon";
import type { Dose, Medication } from "../shared/validation";
import { medicationNames, sideEffects } from "../shared/options";
import { api, type Data } from "./api";
import {
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
} from "./ui";
/** Record a medication event for the selected episode using user-entered dose and time. */
export function DoseForm({
  data,
  episodeId,
  close,
  saved,
}: {
  data: Data;
  episodeId?: string;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const available = data.medications.filter(
    (m) => m.active && (episodeId ? m.category === "acute" : true),
  );
  const first = available[0];
  const action = useAction();
  const [medicationId, setMedication] = useState(first?.id || "");
  const [dose, setDose] = useState(first?.dose?.toString() || "");
  const [units, setUnits] = useState(first?.units || "mg");
  const [time, setTime] = useState(localNow(data.settings.timezone));
  const [review, setReview] = useState(120);
  const [notes, setNotes] = useState("");
  return (
    <Modal title="Record medication" close={close}>
      {!available.length ? (
        <Empty
          title="Add a medication first"
          text="Open Medications and add the medication you use. No doses are suggested."
        />
      ) : (
        <form
          onSubmit={action.submit(async () => {
            await api("/doses", "POST", {
              medicationId,
              episodeId: episodeId || null,
              dose: Number(dose),
              units,
              takenAt: toUTC(time, data.settings.timezone),
              reviewAfterMinutes: review,
              notes,
            });
            await saved();
            close();
          })}
        >
          <Field label="Medication">
            <select
              value={medicationId}
              onChange={(e) => {
                setMedication(e.target.value);
                const m = available.find((v) => v.id === e.target.value)!;
                setDose(m.dose?.toString() || "");
                setUnits(m.units);
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
                min="0.001"
                step="any"
                required
                value={dose}
                onChange={(e) => setDose(e.target.value)}
              />
            </Field>
            <Field label="Units">
              <input
                value={units}
                required
                maxLength={30}
                onChange={(e) => setUnits(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Time taken">
            <input
              type="datetime-local"
              required
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </Field>
          <Field
            label="Review effectiveness after"
            hint="Shown in the app when you return. This is not a notification or dosing reminder."
          >
            <select
              value={review}
              onChange={(e) => setReview(Number(e.target.value))}
            >
              {[30, 60, 120, 240, 720, 1440].map((n) => (
                <option key={n} value={n}>
                  {n < 60 ? `${n} minutes` : `${n / 60} hours`}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes">
            <textarea
              maxLength={5000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
  const [v, setV] = useState({
    name: medication?.name || "",
    category: medication?.category || "acute",
    dose: medication?.dose?.toString() || "",
    units: medication?.units || "mg",
    frequency: medication?.frequency || "",
    startDate: medication?.startDate || "",
    endDate: medication?.endDate || "",
    active: medication?.active ?? true,
    notes: medication?.notes || "",
  });
  const action = useAction();
  return (
    <Modal
      title={medication ? "Edit medication" : "Add medication"}
      close={close}
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
        <Field label="Category">
          <select
            value={v.category}
            onChange={(e) =>
              setV({ ...v, category: e.target.value as "acute" | "preventive" })
            }
          >
            <option value="acute">Acute medication</option>
            <option value="preventive">Preventive medication</option>
          </select>
        </Field>
        <div className="form-grid">
          <Field label="Your prescribed dose (optional)">
            <input
              type="number"
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
        <Field label="Frequency (as prescribed)">
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
          Currently active
        </label>
        <Field label="Notes">
          <textarea
            maxLength={5000}
            value={v.notes}
            onChange={(e) => setV({ ...v, notes: e.target.value })}
          />
        </Field>
        <p className="muted small">
          Names are data-entry conveniences. This app does not recommend
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
  const meds = data.medications.filter((m) => m.category === "preventive");
  const action = useAction();
  const [v, setV] = useState({
    medicationId: meds[0]?.id || "",
    name: "",
    severity: 1,
    date: DateTime.now().setZone(data.settings.timezone).toISODate()!,
    notes: "",
  });
  return (
    <Modal title="Record a side effect" close={close}>
      <form
        onSubmit={action.submit(async () => {
          await api("/effects", "POST", v);
          await saved();
          close();
        })}
      >
        <Field label="Preventive medication">
          <select
            required
            value={v.medicationId}
            onChange={(e) => setV({ ...v, medicationId: e.target.value })}
          >
            {meds.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
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
        <div className="form-grid">
          <Field label="Severity (1–5)">
            <select
              value={v.severity}
              onChange={(e) => setV({ ...v, severity: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input
              type="date"
              required
              value={v.date}
              onChange={(e) => setV({ ...v, date: e.target.value })}
            />
          </Field>
        </div>
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
}: {
  dose: Dose;
  data: Data;
  saved: () => Promise<void>;
}) {
  const action = useAction();
  const due =
    Date.parse(dose.takenAt) + dose.reviewAfterMinutes * 60000 <= Date.now();
  return (
    <div className="dose-row">
      <div>
        <strong>
          {data.medications.find((m) => m.id === dose.medicationId)?.name}
        </strong>
        <p className="muted small">
          {dose.dose} {dose.units} ·{" "}
          {formatDate(dose.takenAt, data.settings, true)}
        </p>
      </div>
      <Field label={due ? "Recorded relief" : "Relief (review later)"}>
        <select
          aria-label={`Relief for ${data.medications.find((m) => m.id === dose.medicationId)?.name}`}
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
          {["None", "Some", "Good", "Complete"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </Field>
      <button
        className="text-button danger"
        disabled={action.busy}
        onClick={() => {
          if (confirm("Delete this recorded dose?"))
            void action.run(async () => {
              await api(`/doses/${dose.id}`, "DELETE");
              await saved();
            });
        }}
      >
        Delete
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
}: {
  data: Data;
  saved: () => Promise<void>;
  takeDose: () => void;
}) {
  const [edit, setEdit] = useState<Medication | "new" | null>(null);
  const [effect, setEffect] = useState(false);
  const action = useAction();
  return (
    <>
      <PageTitle
        eyebrow="Your journal"
        title="Medications"
        text="A simple record of what you take and how you feel."
        action={
          <button className="button primary" onClick={() => setEdit("new")}>
            <Plus size={18} />
            Add medication
          </button>
        }
      />
      <div className="two-column">
        {(["preventive", "acute"] as const).map((category) => (
          <section className="card" key={category}>
            <div className="card-title">
              <h2>{category === "preventive" ? "Preventive" : "Acute"}</h2>
              <Pill size={20} />
            </div>
            {data.medications
              .filter((m) => m.category === category)
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
                      {m.startDate
                        ? `Started ${formatDate(m.startDate, data.settings)}`
                        : "Start date not recorded"}{" "}
                      · {m.active ? "Active" : "Inactive"}
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
          <h2>Medication log</h2>
          <button
            className="button secondary"
            disabled={!data.medications.some((m) => m.active)}
            onClick={takeDose}
          >
            <Plus size={17} />
            Record dose
          </button>
        </div>
        {[...data.doses]
          .sort((a, b) => b.takenAt.localeCompare(a.takenAt))
          .map((d) => (
            <DoseReview key={d.id} dose={d} data={data} saved={saved} />
          ))}
        {!data.doses.length && (
          <p className="muted">
            Recorded doses and their reported relief will appear here.
          </p>
        )}
      </section>
      <section className="card">
        <div className="card-title">
          <h2>Reported side effects</h2>
          <button
            className="text-button"
            disabled={
              !data.medications.some((m) => m.category === "preventive")
            }
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
                onClick={() => {
                  if (confirm("Delete this side-effect entry?"))
                    void action.run(async () => {
                      await api(`/effects/${e.id}`, "DELETE");
                      await saved();
                    });
                }}
              >
                Delete
              </button>
            </div>
          ))}
        {!data.effects.length && (
          <p className="muted">No side effects recorded.</p>
        )}
        <ErrorMessage error={action.error} />
      </section>
      {edit && (
        <MedicationForm
          medication={edit === "new" ? undefined : edit}
          close={() => setEdit(null)}
          saved={saved}
        />
      )}{" "}
      {effect && (
        <EffectForm data={data} close={() => setEffect(false)} saved={saved} />
      )}
    </>
  );
}
