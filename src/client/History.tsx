import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { DateTime } from "luxon";
import { api, type Data } from "./api";
import type { Episode } from "../shared/validation";
import { duration, episodeDays } from "../shared/stats";
import { impacts } from "../shared/options";
import { formatHours } from "../shared/sleep";
import {
  Empty,
  ErrorMessage,
  Field,
  formatDate,
  Modal,
  PageTitle,
  SubNav,
  Submit,
  useAction,
  useConfirm,
} from "./ui";
/** Render a compact episode summary with severity, duration and recorded medication use. */
export function EpisodeRow({
  episode: e,
  data,
  open,
}: {
  episode: Episode;
  data: Data;
  open: () => void;
}) {
  const date = DateTime.fromISO(e.startedAt).setZone(data.settings.timezone);
  const names = [
    ...new Set(
      data.doses
        .filter((d) => d.episodeId === e.id)
        .map(
          (d) => data.medications.find((m) => m.id === d.medicationId)?.name,
        ),
    ),
  ];
  return (
    <button className="episode-row" onClick={open}>
      <div className="date-tile">
        <span>{date.toFormat("MMM")}</span>
        <strong>{date.day}</strong>
      </div>
      <div className="episode-description">
        <strong>{e.endedAt ? "Migraine" : "Migraine · ongoing"}</strong>
        <p>
          {duration(e.startedAt, e.endedAt)} ·{" "}
          {e.side === "Unspecified" ? "Side not recorded" : `${e.side} side`}
        </p>
        <small>
          {names.length ? names.join(", ") : "No medication recorded"}
          {e.impact !== null && e.impact >= 3 ? " · High impact" : ""}
        </small>
      </div>
      <span
        className={`severity-badge level-${e.severity === null ? "unknown" : e.severity < 4 ? "mild" : e.severity < 7 ? "moderate" : "severe"}`}
      >
        {e.severity ?? "–"}
        <small>/10</small>
      </span>
      <ChevronRight size={17} />
    </button>
  );
}
/** Render a local monthly calendar with labelled severity, check-in markers and selectable dates. */
export function Calendar({
  episodes,
  checkIns,
  zone,
  selected,
  onSelect,
}: {
  episodes: Episode[];
  checkIns: Set<string>;
  zone: string;
  selected: string;
  onSelect: (date: string) => void;
}) {
  const [month, setMonth] = useState(
    DateTime.now().setZone(zone).startOf("month"),
  );
  const start = month.startOf("week");
  const days = Array.from(
    { length: Math.ceil((month.weekday - 1 + month.daysInMonth!) / 7) * 7 },
    (_, i) => start.plus({ days: i }),
  );
  const dayMap = new Map<string, (number | null)[]>();
  for (const episode of episodes)
    for (const d of episodeDays(episode, zone, {
      from: start.toISODate()!,
      to: days[days.length - 1].toISODate()!,
    }))
      dayMap.set(d, [...(dayMap.get(d) || []), episode.severity]);
  return (
    <section className="card calendar">
      <div className="card-title">
        <h2>{month.toFormat("MMMM yyyy")}</h2>
        <div>
          <button
            className="icon-button"
            aria-label="Previous month"
            onClick={() => setMonth(month.minus({ months: 1 }))}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            className="icon-button"
            aria-label="Next month"
            onClick={() => setMonth(month.plus({ months: 1 }))}
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
      <div className="calendar-grid">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span className="weekday" key={d}>
            {d}
          </span>
        ))}
        {days.map((day) => {
          const date = day.toISODate()!,
            values = dayMap.get(date);
          const max = values?.some((v) => v !== null)
            ? Math.max(...values.filter((v): v is number => v !== null))
            : null;
          const level = !values
            ? "none"
            : max === null
              ? "unknown"
              : max < 4
                ? "mild"
                : max < 7
                  ? "moderate"
                  : "severe";
          const checked = checkIns.has(date);
          return (
            <button
              key={date}
              className={`calendar-day level-${level} ${day.month !== month.month ? "outside" : ""}`}
              aria-pressed={selected === date}
              aria-label={`${day.toFormat("d MMMM yyyy")}: ${values ? (max === null ? "migraine, severity unrecorded" : `${level} migraine, ${max} out of 10`) : "no migraine recorded"}${checked ? ", check-in recorded" : ""}`}
              onClick={() => onSelect(selected === date ? "" : date)}
            >
              <span>{day.day}</span>
              <small>{values ? (max === null ? "•" : max) : ""}</small>
              {checked && <i className="checkin-mark" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <div className="calendar-legend">
        <span>1–3 Mild</span>
        <span>4–6 Moderate</span>
        <span>7–10 Severe</span>
        <span>• Unrated</span>
        <span>
          <i className="checkin-mark" aria-hidden="true" /> Check-in
        </span>
      </div>
      <p className="small muted">
        A blank day means nothing was recorded, not that it was migraine-free.
      </p>
    </section>
  );
}
type Filters = {
  from: string;
  to: string;
  severity: string;
  medication: string;
  factor: string;
  impact: string;
  hours: string;
  preventive: string;
};
const noFilters: Filters = {
  from: "",
  to: "",
  severity: "",
  medication: "",
  factor: "",
  impact: "",
  hours: "",
  preventive: "",
};
/** Edit every history filter in one sheet; changes apply when the sheet is closed with Apply. */
function FilterSheet({
  data,
  value,
  apply,
  close,
}: {
  data: Data;
  value: Filters;
  apply: (value: Filters) => void;
  close: () => void;
}) {
  const [v, setV] = useState(value);
  const field = (key: keyof Filters) => ({
    value: v[key],
    onChange: (e: { target: { value: string } }) =>
      setV({ ...v, [key]: e.target.value }),
  });
  return (
    <Modal title="Filter migraines" close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply(v);
          close();
        }}
      >
        <div className="form-grid">
          <Field label="From date">
            <input type="date" {...field("from")} />
          </Field>
          <Field label="To date">
            <input type="date" {...field("to")} />
          </Field>
          <Field label="Severity at least">
            <select {...field("severity")}>
              <option value="">Any</option>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}/10
                </option>
              ))}
            </select>
          </Field>
          <Field label="Impact at least">
            <select {...field("impact")}>
              <option value="">Any</option>
              {impacts.slice(1).map((label, i) => (
                <option key={label} value={i + 1}>
                  {i + 1} · {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Lasting at least (hours)">
            <input
              type="number"
              min="0"
              inputMode="decimal"
              {...field("hours")}
            />
          </Field>
          <Field label="Medication taken">
            <select {...field("medication")}>
              <option value="">Any</option>
              {data.medications.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="What was going on">
            <select {...field("factor")}>
              <option value="">Any</option>
              {[...new Set(data.episodes.flatMap((e) => e.factors))].map(
                (f) => (
                  <option key={f}>{f}</option>
                ),
              )}
            </select>
          </Field>
          <Field label="While taking preventive">
            <select {...field("preventive")}>
              <option value="">Any</option>
              {data.medications
                .filter((m) => m.category === "preventive")
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <div className="button-row dialog-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() => setV(noFilters)}
          >
            Clear all
          </button>
          <button type="submit" className="button primary">
            Apply filters
          </button>
        </div>
      </form>
    </Modal>
  );
}
/** Group episodes under month headings. */
function byMonth(episodes: Episode[], zone: string) {
  const groups = new Map<string, Episode[]>();
  for (const e of episodes) {
    const month = DateTime.fromISO(e.startedAt)
      .setZone(zone)
      .toFormat("MMMM yyyy");
    groups.set(month, [...(groups.get(month) || []), e]);
  }
  return [...groups];
}
/** Searchable, filterable list of migraines, grouped by month and shown a page at a time. */
function Migraines({
  data,
  open,
  calendar,
}: {
  data: Data;
  open: (e: Episode) => void;
  calendar: boolean;
}) {
  const zone = data.settings.timezone;
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(noFilters);
  const [sheet, setSheet] = useState(false);
  const [selectedDay, setDay] = useState("");
  const day = calendar ? selectedDay : "";
  const [shown, setShown] = useState(40);
  const medName = (id: string) =>
    data.medications.find((m) => m.id === id)?.name ?? "";
  const labels: Record<keyof Filters, (v: string) => string> = {
    from: (v) => `From ${formatDate(v, data.settings)}`,
    to: (v) => `To ${formatDate(v, data.settings)}`,
    severity: (v) => `Severity ${v}+`,
    impact: (v) => `Impact ${v}+`,
    hours: (v) => `${v}+ hours`,
    medication: (v) => `Took ${medName(v)}`,
    factor: (v) => v,
    preventive: (v) => `While on ${medName(v)}`,
  };
  const active = (Object.keys(filters) as (keyof Filters)[]).filter(
    (k) => filters[k],
  );
  const f = filters;
  const filtered = data.episodes.filter((e) => {
    const days = episodeDays(e, zone);
    const preventive = data.medications.find((m) => m.id === f.preventive);
    const names = data.doses
      .filter((d) => d.episodeId === e.id)
      .map((d) => medName(d.medicationId));
    return (
      (!f.from || days.some((d) => d >= f.from)) &&
      (!f.to || days.some((d) => d <= f.to)) &&
      (!day || days.includes(day)) &&
      (!f.severity ||
        (e.severity !== null && e.severity >= Number(f.severity))) &&
      (!f.impact || (e.impact !== null && e.impact >= Number(f.impact))) &&
      (!f.factor || e.factors.includes(f.factor)) &&
      (!f.medication ||
        data.doses.some(
          (d) => d.episodeId === e.id && d.medicationId === f.medication,
        )) &&
      (!f.hours ||
        (Date.parse(e.endedAt || new Date().toISOString()) -
          Date.parse(e.startedAt)) /
          3600000 >=
          Number(f.hours)) &&
      (!preventive ||
        (!!preventive.startDate &&
          days.some(
            (d) =>
              d >= preventive.startDate! &&
              (!preventive.endDate || d <= preventive.endDate),
          ))) &&
      [e.notes, ...e.symptoms, ...e.factors, ...names]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  });
  return (
    <>
      <div className="search-row">
        <div className="search-field">
          <Search size={19} />
          <input
            aria-label="Search migraines"
            placeholder="Search notes, symptoms or medication…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="button secondary" onClick={() => setSheet(true)}>
          <SlidersHorizontal size={17} />
          Filters{active.length ? ` (${active.length})` : ""}
        </button>
      </div>
      {active.length > 0 && (
        <div className="active-filters" aria-label="Active filters">
          {active.map((k) => (
            <button
              key={k}
              className="filter-chip"
              onClick={() => setFilters({ ...filters, [k]: "" })}
            >
              {labels[k](filters[k])}
              <X size={14} aria-hidden="true" />
              <span className="visually-hidden"> — remove filter</span>
            </button>
          ))}
          <button className="text-button" onClick={() => setFilters(noFilters)}>
            Clear all
          </button>
        </div>
      )}
      {calendar && (
        <Calendar
          episodes={data.episodes}
          checkIns={new Set(data.daily.map((d) => d.date))}
          zone={zone}
          selected={day}
          onSelect={setDay}
        />
      )}
      <section className="card">
        <div className="card-title">
          <h2>{day ? formatDate(day, data.settings) : "Migraines"}</h2>
          <span className="muted small">
            {filtered.length} {filtered.length === 1 ? "migraine" : "migraines"}
          </span>
        </div>
        {filtered.length ? (
          byMonth(filtered.slice(0, shown), zone).map(([month, episodes]) => (
            <div key={month} className="month-group">
              {!day && <h3 className="month-heading">{month}</h3>}
              {episodes.map((e) => (
                <EpisodeRow
                  key={e.id}
                  episode={e}
                  data={data}
                  open={() => open(e)}
                />
              ))}
            </div>
          ))
        ) : (
          <Empty
            title={
              data.episodes.length
                ? "No migraines match"
                : "Nothing recorded yet"
            }
            text={
              data.episodes.length
                ? "Try removing a filter or changing your search."
                : "Migraines you log will appear here."
            }
          />
        )}
        {filtered.length > shown && (
          <button
            className="button secondary"
            onClick={() => setShown(shown + 40)}
          >
            Show more
          </button>
        )}
      </section>
      {sheet && (
        <FilterSheet
          data={data}
          value={filters}
          apply={setFilters}
          close={() => setSheet(false)}
        />
      )}
    </>
  );
}
/** List daily check-ins, newest first, each opening its check-in to edit. */
function CheckIns({
  data,
  open,
}: {
  data: Data;
  open: (date?: string) => void;
}) {
  const days = [...data.daily].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <section className="card">
      <div className="card-title">
        <h2>Daily check-ins</h2>
        <button className="button secondary" onClick={() => open()}>
          <Plus size={17} />
          New check-in
        </button>
      </div>
      {days.length ? (
        days.map((d) => (
          <button
            key={d.date}
            className="episode-row"
            onClick={() => open(d.date)}
          >
            <div className="date-tile">
              <span>{DateTime.fromISO(d.date).toFormat("MMM")}</span>
              <strong>{DateTime.fromISO(d.date).day}</strong>
            </div>
            <div className="episode-description">
              <strong>{formatDate(d.date, data.settings)}</strong>
              <p>{d.factors.length ? d.factors.join(", ") : "Nothing noted"}</p>
              <small>
                {d.sleep?.hours != null
                  ? `Slept about ${formatHours(d.sleep.hours)}`
                  : "Sleep not recorded"}
                {d.activities.length ? ` · ${d.activities.join(", ")}` : ""}
              </small>
            </div>
            <ChevronRight size={17} />
          </button>
        ))
      ) : (
        <Empty
          title="No check-ins yet"
          text="A quick check-in on any day, with or without a migraine, helps put patterns in context."
        />
      )}
    </section>
  );
}
/** Provide optional weight entries and a unit-normalized chart without health interpretations. */
function Weight({ data, saved }: { data: Data; saved: () => Promise<void> }) {
  const action = useAction();
  const confirm = useConfirm();
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
      <p className="muted">A simple record, without targets or conclusions.</p>
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
              inputMode="decimal"
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
            <span>{formatDate(points[0].date, data.settings)}</span>
            <span>
              {formatDate(points[points.length - 1].date, data.settings)}
            </span>
          </div>
          {[...points].reverse().map((p) => (
            <div className="list-row" key={p.id}>
              <span>
                {formatDate(p.date, data.settings)} · {p.value} {p.units}
              </span>
              <button
                className="text-button danger"
                onClick={async () => {
                  if (
                    await confirm({
                      title: "Delete this weight entry?",
                      message: `${p.value} ${p.units} on ${formatDate(p.date, data.settings)}. This can’t be undone.`,
                      confirmLabel: "Delete",
                      danger: true,
                    })
                  )
                    void action.run(async () => {
                      await api(`/weights/${p.id}`, "DELETE");
                      await saved();
                    });
                }}
              >
                Delete
                <span className="visually-hidden">
                  {" "}
                  weight from {formatDate(p.date, data.settings)}
                </span>
              </button>
            </div>
          ))}
        </>
      )}
      <ErrorMessage error={action.error} />
    </section>
  );
}
export type HistorySection = "migraines" | "calendar" | "checkins" | "weight";
/** Browse recorded migraines, the calendar, daily check-ins and the optional weight journal. */
export function History({
  data,
  section,
  setSection,
  open,
  openCheckIn,
  saved,
}: {
  data: Data;
  section: HistorySection;
  setSection: (section: HistorySection) => void;
  open: (e: Episode) => void;
  openCheckIn: (date?: string) => void;
  saved: () => Promise<void>;
}) {
  const sections: { id: HistorySection; label: string }[] = [
    { id: "migraines", label: "Migraines" },
    { id: "calendar", label: "Calendar" },
    { id: "checkins", label: "Check-ins" },
    ...(data.settings.weightEnabled
      ? [{ id: "weight" as const, label: "Weight" }]
      : []),
  ];
  const current = sections.some((s) => s.id === section)
    ? section
    : "migraines";
  return (
    <>
      <PageTitle
        eyebrow="Your journal"
        title="History"
        text="Everything you’ve recorded, in one place."
      />
      <SubNav
        label="History sections"
        items={sections}
        current={current}
        onSelect={setSection}
      />
      {(current === "migraines" || current === "calendar") && (
        <Migraines data={data} open={open} calendar={current === "calendar"} />
      )}
      {current === "checkins" && <CheckIns data={data} open={openCheckIn} />}
      {current === "weight" && <Weight data={data} saved={saved} />}
    </>
  );
}
