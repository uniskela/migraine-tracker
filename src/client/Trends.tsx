import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import { FileText, Download } from "lucide-react";
import { api, download, type Data } from "./api";
import {
  change,
  comparison,
  episodeDays,
  summary,
  type Summary,
} from "../shared/stats";
import { Empty, ErrorMessage, Field, Modal, PageTitle, useAction } from "./ui";
type Frequency = { name: string; count: number; percentage: number };
type TrendResult = {
  current: Summary;
  previous: Summary;
  factors: Frequency[];
  symptoms: Frequency[];
  context: {
    migraineDays: number;
    nonMigraineDays: number;
    sufficient: boolean;
    factors: {
      name: string;
      migrainePercentage: number | null;
      nonMigrainePercentage: number | null;
    }[];
  };
};
/** Format a recorded metric with its suffix, or an em dash when data is absent. */
const number = (n: number | null, suffix = "") =>
  n === null ? "—" : `${Number(n.toFixed(1))}${suffix}`;
/** Present summary metrics and mathematically defined changes from the previous period. */
export function Metrics({
  current,
  previous,
}: {
  current: Summary;
  previous?: Summary;
}) {
  const metrics: { label: string; key: keyof Summary; suffix?: string }[] = [
    { label: "Migraine days", key: "migraineDays" },
    { label: "Episodes", key: "episodes" },
    { label: "Average severity", key: "averageSeverity", suffix: "/10" },
    { label: "Average duration", key: "averageDuration", suffix: "h" },
    { label: "Migraine hours", key: "totalHours", suffix: "h" },
    { label: "Significantly impacted days", key: "impactedDays" },
    { label: "Acute medication days", key: "acuteDays" },
    { label: "Acute doses", key: "acuteDoses" },
  ];
  return (
    <div className="metrics-grid">
      {metrics.map((m) => {
        const prev = previous?.[m.key],
          val = current[m.key];
        const delta =
          typeof val === "number" && typeof prev === "number"
            ? change(val, prev)
            : null;
        return (
          <div className="metric card" key={m.key}>
            <span>{m.label}</span>
            <strong>{number(val, m.suffix)}</strong>
            {previous && (
              <small>
                {delta === null
                  ? `Previous: ${number(prev ?? null)}`
                  : `${delta > 0 ? "+" : ""}${Math.round(delta)}% · previous ${number(prev ?? null)}`}
              </small>
            )}
          </div>
        );
      })}
    </div>
  );
}
/** Display recorded symptom or factor frequencies without causal interpretations. */
function Frequencies({
  title,
  values,
}: {
  title: string;
  values: Frequency[];
}) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {!values.length ? (
        <p className="muted">No entries recorded for this period.</p>
      ) : (
        values.map((v) => (
          <div className="frequency" key={v.name}>
            <div>
              <span>{v.name}</span>
              <strong>{Math.round(v.percentage)}%</strong>
            </div>
            <progress
              max="100"
              value={v.percentage}
              aria-label={`${v.name}: ${Math.round(v.percentage)}% of episodes`}
            />
          </div>
        ))
      )}
      <p className="small muted">
        Percentage of recorded episodes. Multiple selections are possible.
      </p>
    </section>
  );
}
/** Plot migraine-day counts in calendar groups with accessible text labels. */
export function MigraineChart({
  data,
  from,
  to,
}: {
  data: Data;
  from: string;
  to: string;
}) {
  const start = DateTime.fromISO(from);
  const end = DateTime.fromISO(to);
  const count = Math.round(end.diff(start, "days").days) + 1;
  const buckets = count <= 31 ? count : Math.min(12, Math.ceil(count / 7));
  const width = Math.ceil(count / buckets);
  const values = Array.from({ length: buckets }, (_, i) => {
    const a = start.plus({ days: i * width }),
      b = DateTime.min(a.plus({ days: width - 1 }), end);
    const days = new Set(
      data.episodes.flatMap((e) =>
        episodeDays(e, data.settings.timezone, {
          from: a.toISODate()!,
          to: b.toISODate()!,
        }),
      ),
    ).size;
    return { label: a.toFormat("d MMM"), days };
  }).filter((_, i) => i * width < count);
  const max = Math.max(1, ...values.map((v) => v.days));
  return (
    <section className="card">
      <div className="card-title">
        <h2>Migraine days over time</h2>
        <span className="muted small">
          {width === 1 ? "Daily" : `${width}-day groups`}
        </span>
      </div>
      <svg
        viewBox="0 0 660 160"
        role="img"
        aria-label={`Migraine days: ${values.map((v) => `${v.label}: ${v.days}`).join(", ")}`}
        className="trend-chart"
      >
        <line x1="15" y1="125" x2="650" y2="125" className="chart-axis" />
        {values.map((v, i) => {
          const w = 630 / values.length,
            h = (v.days / max) * 90;
          return (
            <g key={i}>
              <rect
                x={20 + i * w}
                y={125 - Math.max(h, 3)}
                width={Math.max(3, w - 8)}
                height={Math.max(h, 3)}
                rx="3"
                className={v.days ? "chart-bar" : "chart-empty"}
              />
              {(values.length < 13 || i % 5 === 0) && (
                <text x={20 + i * w} y="149" className="chart-label">
                  {v.label}
                </text>
              )}
              {v.days > 0 && values.length < 13 && (
                <text x={20 + i * w} y={116 - h} className="chart-label">
                  {v.days}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="small muted">
        Blank days mean no migraine recorded, rather than confirmed
        migraine-free days.
      </p>
    </section>
  );
}
/** Compare configurable periods around a preventive medication’s recorded start date. */
function Comparison({ data }: { data: Data }) {
  const meds = data.medications.filter(
    (m) => m.category === "preventive" && m.startDate,
  );
  const [id, setId] = useState("");
  const [periods, setPeriods] = useState({
    beforeFrom: "",
    beforeTo: "",
    afterFrom: "",
    afterTo: "",
  });
  const [result, setResult] = useState<ReturnType<typeof comparison> | null>(
    null,
  );
  const action = useAction();
  const labels: Record<keyof typeof periods, string> = {
    beforeFrom: "Before: from",
    beforeTo: "Before: to",
    afterFrom: "After: from",
    afterTo: "After: to",
  };
  const rows = [
    { label: "Migraine days / 30 days", key: "migraineDaysPer30" },
    { label: "Average severity", key: "averageSeverity" },
    { label: "Migraine hours / 30 days", key: "migraineHoursPer30" },
    { label: "Impacted days / 30 days", key: "impactDaysPer30" },
    { label: "Acute medication days / 30 days", key: "acuteDaysPer30" },
  ] as const;
  return (
    <section className="card">
      <h2>Before & after preventive medication</h2>
      <p className="muted">
        Compare your recorded experience across two periods.
      </p>
      {!meds.length ? (
        <p>
          Add a preventive medication with a start date in Medications to
          compare periods.
        </p>
      ) : (
        <form
          onSubmit={action.submit(async () => {
            setResult(
              await api(
                `/comparison?${new URLSearchParams({ medicationId: id, ...periods })}`,
              ),
            );
          })}
        >
          <Field label="Preventive medication">
            <select
              required
              value={id}
              onChange={(e) => {
                setId(e.target.value);
                setResult(null);
                const med = meds.find((m) => m.id === e.target.value);
                if (!med) return;
                const start = DateTime.fromISO(med.startDate!);
                setPeriods({
                  beforeFrom: start.minus({ days: 30 }).toISODate()!,
                  beforeTo: start.minus({ days: 1 }).toISODate()!,
                  afterFrom: med.startDate!,
                  afterTo: [
                    start.plus({ days: 29 }).toISODate()!,
                    DateTime.now().setZone(data.settings.timezone).toISODate()!,
                    med.endDate || "9999-12-31",
                  ].sort()[0],
                });
              }}
            >
              <option value="">Choose a medication</option>
              {meds.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          {id && (
            <>
              <div className="form-grid">
                {(Object.keys(periods) as (keyof typeof periods)[]).map((k) => (
                  <Field key={k} label={labels[k]}>
                    <input
                      required
                      type="date"
                      value={periods[k]}
                      onChange={(e) => {
                        setResult(null);
                        setPeriods({ ...periods, [k]: e.target.value });
                      }}
                    />
                  </Field>
                ))}
              </div>
              <button className="button secondary" disabled={action.busy}>
                Compare periods
              </button>
            </>
          )}
          <ErrorMessage error={action.error} />
        </form>
      )}
      {result && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Metric</th>
                <th>Before</th>
                <th>After</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <th>{r.label}</th>
                  <td>{number(result.before[r.key])}</td>
                  <td>{number(result.after[r.key])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted">
            Before: {result.before.periodDays} days; after:{" "}
            {result.after.periodDays} days. Rates are normalized to 30 days.
            Unrecorded days are unknown; compare periods with consistent
            recording.
          </p>
        </div>
      )}
      <p className="disclaimer">
        This is observational data. Changes do not establish that a medication
        caused an improvement or worsening.
      </p>
    </section>
  );
}
/** Collect a report range and doctor note, then download the selected report format. */
function DoctorReport({
  data,
  from,
  to,
  close,
}: {
  data: Data;
  from: string;
  to: string;
  close: () => void;
}) {
  const [period, setPeriod] = useState({ from, to });
  const [note, setNote] = useState("");
  const action = useAction();
  const result = summary(
    data.episodes,
    data.doses,
    data.medications,
    period,
    data.settings.timezone,
  );
  return (
    <Modal title="Report for your doctor" close={close}>
      <p className="muted">
        A private, factual summary to support your conversation.
      </p>
      <div className="form-grid">
        <Field label="Report from">
          <input
            type="date"
            value={period.from}
            onChange={(e) => setPeriod({ ...period, from: e.target.value })}
          />
        </Field>
        <Field label="Report to">
          <input
            type="date"
            value={period.to}
            onChange={(e) => setPeriod({ ...period, to: e.target.value })}
          />
        </Field>
      </div>
      <div className="report-preview">
        <strong>
          {result.migraineDays} migraine days · {result.episodes} episodes
        </strong>
        <p>
          Includes severity, duration, impact, medication use, reported side
          effects, preventive comparisons and a chronological timeline.
        </p>
      </div>
      <Field label="Note for your doctor">
        <textarea
          rows={4}
          maxLength={5000}
          placeholder="Anything you’d like to discuss at your appointment…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <div className="button-row">
        {["pdf", "csv", "json"].map((format) => (
          <button
            key={format}
            disabled={action.busy}
            className={`button ${format === "pdf" ? "primary" : "secondary"}`}
            onClick={() =>
              void action.run(() =>
                download(`/report/${format}`, `migraine-report.${format}`, {
                  ...period,
                  note,
                }),
              )
            }
          >
            <Download size={16} />
            {format.toUpperCase()}
          </button>
        ))}
      </div>
      <ErrorMessage error={action.error} />
      <p className="small muted">
        PDF and JSON contain the full summary. CSV contains the episode
        timeline. This application records and summarises information and does
        not provide medical advice.
      </p>
    </Modal>
  );
}
/** Coordinate date-range summaries, association coverage and preventive medication comparisons. */
export function Trends({ data }: { data: Data }) {
  const today = DateTime.now().setZone(data.settings.timezone);
  const [range, setRange] = useState("30");
  const [period, setPeriod] = useState({
    from: today.minus({ days: 29 }).toISODate()!,
    to: today.toISODate()!,
  });
  const [result, setResult] = useState<TrendResult | null>(null);
  const [error, setError] = useState("");
  const [report, setReport] = useState(false);
  useEffect(() => {
    let active = true;
    setResult(null);
    setError("");
    api<TrendResult>(`/trends?${new URLSearchParams(period)}`)
      .then((v) => {
        if (active) setResult(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [period, data]);
  return (
    <>
      <PageTitle
        eyebrow="A little perspective"
        title="Your patterns"
        text="Understand your experience, one day at a time."
        action={
          <button className="button secondary" onClick={() => setReport(true)}>
            <FileText size={18} />
            Doctor report
          </button>
        }
      />
      <div className="range-row">
        <div className="segmented">
          {[
            ["7", "7 days"],
            ["30", "30 days"],
            ["90", "90 days"],
            ["6m", "6 months"],
            ["12m", "12 months"],
            ["custom", "Custom"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={range === value}
              onClick={() => {
                setRange(value);
                if (value !== "custom")
                  setPeriod({
                    from: (value.endsWith("m")
                      ? today
                          .minus({ months: Number(value.slice(0, -1)) })
                          .plus({ days: 1 })
                      : today.minus({ days: Number(value) - 1 })
                    ).toISODate()!,
                    to: today.toISODate()!,
                  });
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {range === "custom" && (
        <div className="form-grid">
          <Field label="From">
            <input
              type="date"
              value={period.from}
              onChange={(e) => setPeriod({ ...period, from: e.target.value })}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              max={today.toISODate()!}
              value={period.to}
              onChange={(e) => setPeriod({ ...period, to: e.target.value })}
            />
          </Field>
        </div>
      )}
      <ErrorMessage error={error} />
      {result ? (
        <>
          <Metrics current={result.current} previous={result.previous} />
          <p className="small muted">
            Compared with the preceding {result.current.periodDays} days.
            Average duration includes only completed episodes wholly in this
            period. Significant impact means a recorded score of 3–5.
          </p>
          <MigraineChart data={data} {...period} />
          <div className="two-column">
            <Frequencies title="Associated factors" values={result.factors} />
            <Frequencies title="Reported symptoms" values={result.symptoms} />
          </div>
          <section className="card">
            <h2>Context from daily check-ins</h2>
            <p className="muted">
              {result.context.migraineDays} recorded migraine days ·{" "}
              {result.context.nonMigraineDays} recorded non-migraine days.
            </p>
            {!result.context.sufficient ? (
              <p>
                Not enough recorded context to compare reliably. Add check-ins
                on both migraine and migraine-free days. Comparisons appear
                after at least 7 recorded days of each; this threshold does not
                imply statistical significance.
              </p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Associated factor</th>
                      <th>Migraine days</th>
                      <th>Non-migraine days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.context.factors.map((f) => (
                      <tr key={f.name}>
                        <th>{f.name}</th>
                        <td>{number(f.migrainePercentage, "%")}</td>
                        <td>{number(f.nonMigrainePercentage, "%")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="small muted">
              Only days with a check-in are compared. Association does not
              establish causation.
            </p>
          </section>
        </>
      ) : (
        !error && (
          <Empty
            title="Loading your patterns…"
            text="Reading your private journal."
          />
        )
      )}
      <Comparison data={data} />
      {report && (
        <DoctorReport data={data} {...period} close={() => setReport(false)} />
      )}
    </>
  );
}
