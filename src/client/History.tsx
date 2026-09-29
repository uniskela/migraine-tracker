import { useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  List,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { DateTime } from "luxon";
import type { Data } from "./api";
import type { Episode } from "../shared/validation";
import { duration, episodeDays } from "../shared/stats";
import { Empty, Field, formatDate, PageTitle } from "./ui";
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
export function Calendar({
  episodes,
  zone,
  selected,
  onSelect,
}: {
  episodes: Episode[];
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
      from: month.toISODate()!,
      to: month.endOf("month").toISODate()!,
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
          return (
            <button
              key={date}
              className={`calendar-day level-${level} ${day.month !== month.month ? "outside" : ""}`}
              aria-pressed={selected === date}
              aria-label={`${day.toFormat("d MMMM yyyy")}: ${values ? (max === null ? "migraine, severity unrecorded" : `${level} migraine, ${max} out of 10`) : "no migraine recorded"}`}
              onClick={() => onSelect(selected === date ? "" : date)}
            >
              <span>{day.day}</span>
              <small>{values ? (max === null ? "•" : max) : ""}</small>
            </button>
          );
        })}
      </div>
      <div className="calendar-legend">
        <span>1–3 Mild</span>
        <span>4–6 Moderate</span>
        <span>7–10 Severe</span>
        <span>• Unrated</span>
      </div>
      <p className="small muted">Blank days mean no migraine recorded.</p>
    </section>
  );
}
export function History({
  data,
  edit,
}: {
  data: Data;
  edit: (e: Episode) => void;
}) {
  const [view, setView] = useState("list"),
    [search, setSearch] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [severity, setSeverity] = useState(""),
    [medication, setMedication] = useState(""),
    [factor, setFactor] = useState(""),
    [impact, setImpact] = useState(""),
    [hours, setHours] = useState(""),
    [day, setDay] = useState(""),
    [preventive, setPreventive] = useState("");
  const filtered = data.episodes.filter((e) => {
    const days = episodeDays(e, data.settings.timezone);
    const activeMed = data.medications.find((m) => m.id === preventive);
    const names = data.doses
      .filter((d) => d.episodeId === e.id)
      .map(
        (d) =>
          data.medications.find((m) => m.id === d.medicationId)?.name || "",
      );
    return (
      (!from || days.some((d) => d >= from)) &&
      (!to || days.some((d) => d <= to)) &&
      (!day || days.includes(day)) &&
      (!severity || (e.severity !== null && e.severity >= Number(severity))) &&
      (!impact || (e.impact !== null && e.impact >= Number(impact))) &&
      (!factor || e.factors.includes(factor)) &&
      (!medication ||
        data.doses.some(
          (d) => d.episodeId === e.id && d.medicationId === medication,
        )) &&
      (!hours ||
        (Date.parse(e.endedAt || new Date().toISOString()) -
          Date.parse(e.startedAt)) /
          3600000 >=
          Number(hours)) &&
      (!activeMed ||
        (!!activeMed.startDate &&
          days.some(
            (d) =>
              d >= activeMed.startDate! &&
              (!activeMed.endDate || d <= activeMed.endDate),
          ))) &&
      [e.notes, ...e.symptoms, ...e.factors, ...names]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  });
  return (
    <>
      <PageTitle
        eyebrow="Your journal"
        title="History"
        text="Your days, in your own words."
        action={
          <div className="segmented">
            <button
              aria-pressed={view === "list"}
              onClick={() => {
                setView("list");
                setDay("");
              }}
            >
              <List size={17} />
              List
            </button>
            <button
              aria-pressed={view === "calendar"}
              onClick={() => setView("calendar")}
            >
              <CalendarDays size={17} />
              Calendar
            </button>
          </div>
        }
      />
      <div className="search-field">
        <Search size={19} />
        <input
          aria-label="Search history"
          placeholder="Search notes, symptoms or medications…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <details className="card filters">
        <summary>
          <SlidersHorizontal size={17} />
          Filter entries
        </summary>
        <div className="form-grid">
          <Field label="From date">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="To date">
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
          <Field label="Minimum severity">
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option value="">Any</option>
              {[1, 4, 7, 10].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </Field>
          <Field label="Medication taken">
            <select
              value={medication}
              onChange={(e) => setMedication(e.target.value)}
            >
              <option value="">Any</option>
              {data.medications.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Associated factor">
            <select value={factor} onChange={(e) => setFactor(e.target.value)}>
              <option value="">Any</option>
              {[...new Set(data.episodes.flatMap((e) => e.factors))].map(
                (f) => (
                  <option key={f}>{f}</option>
                ),
              )}
            </select>
          </Field>
          <Field label="Minimum impact">
            <select value={impact} onChange={(e) => setImpact(e.target.value)}>
              <option value="">Any</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </Field>
          <Field label="Minimum duration (hours)">
            <input
              type="number"
              min="0"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </Field>
          <Field label="During preventive medication">
            <select
              value={preventive}
              onChange={(e) => setPreventive(e.target.value)}
            >
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
        <button
          className="text-button"
          onClick={() => {
            setFrom("");
            setTo("");
            setSeverity("");
            setMedication("");
            setFactor("");
            setImpact("");
            setHours("");
            setPreventive("");
            setSearch("");
            setDay("");
          }}
        >
          Clear all filters
        </button>
      </details>
      {view === "calendar" && (
        <Calendar
          episodes={data.episodes}
          zone={data.settings.timezone}
          selected={day}
          onSelect={setDay}
        />
      )}
      <section className="card">
        <div className="card-title">
          <h2>{day ? formatDate(day, data.settings) : "All entries"}</h2>
          <span className="muted small">
            {filtered.length} {filtered.length === 1 ? "episode" : "episodes"}
          </span>
        </div>
        {filtered.length ? (
          filtered.map((e) => (
            <EpisodeRow
              key={e.id}
              episode={e}
              data={data}
              open={() => edit(e)}
            />
          ))
        ) : (
          <Empty
            title="Nothing recorded here yet"
            text="Your entries will appear here. Try adjusting the filters if you expected to see more."
          />
        )}
      </section>
    </>
  );
}
