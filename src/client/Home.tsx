import {
  Activity,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  CirclePlus,
  Clock3,
  Heart,
  Leaf,
  LockKeyhole,
  Pill,
  Plus,
  Sun,
} from "lucide-react";
import { DateTime } from "luxon";
import type { Episode } from "../shared/validation";
import { duration, summary } from "../shared/stats";
import type { Data } from "./api";
import type { Page } from "./App";
import { DoseReview } from "./Medications";
import { EpisodeRow } from "./History";
import { MigraineChart } from "./Trends";
import { CardTitle, Empty, formatDate, PageTitle } from "./ui";
/** Show immediate migraine actions, active status and a concise summary of recent records. */
export function Home({
  data,
  navigate,
  log,
  start,
  edit,
  end,
  takeDose,
  checkIn,
  busy,
  saved,
}: {
  data: Data;
  navigate: (page: Page) => void;
  log: () => void;
  start: () => void;
  edit: (e: Episode) => void;
  end: (e: Episode) => void;
  takeDose: (id?: string) => void;
  checkIn: () => void;
  busy: boolean;
  saved: () => Promise<void>;
}) {
  const now = DateTime.now().setZone(data.settings.timezone);
  const period = {
    from: now.minus({ days: 29 }).toISODate()!,
    to: now.toISODate()!,
  };
  const metrics = summary(
    data.episodes,
    data.doses,
    data.medications,
    period,
    data.settings.timezone,
  );
  const active = data.episodes.find((e) => !e.endedAt);
  const recent = data.episodes.filter((e) => e.endedAt).slice(0, 3);
  const preventive = data.medications.filter(
    (m) => m.category === "preventive" && m.active,
  );
  const pending = data.doses.filter(
    (d) =>
      !d.effectiveness &&
      Date.parse(d.takenAt) + d.reviewAfterMinutes * 60000 <= Date.now() &&
      Date.parse(d.takenAt) > Date.now() - 2 * 86400000,
  );
  return (
    <>
      <PageTitle
        eyebrow={now.toFormat("cccc, d MMMM")}
        title={
          now.hour < 12
            ? "Good morning."
            : now.hour < 18
              ? "Good afternoon."
              : "Good evening."
        }
        text="A moment to check in with yourself."
        action={
          <span className="private-badge">
            <LockKeyhole size={14} />
            Your private journal
          </span>
        }
      />
      <section className="quick-log">
        <div className="quick-log-copy">
          <span className="quiet-icon">
            <Sun size={24} />
          </span>
          <h2>How are you feeling?</h2>
          <p>
            You don’t need to remember everything.
            <br />
            Start with what you know.
          </p>
          <div className="quick-actions">
            <button className="button primary large" onClick={log}>
              <Plus size={21} />
              Log Migraine
            </button>
            <button
              className="button quick-start"
              disabled={busy || !!active}
              onClick={start}
            >
              <CirclePlus size={20} />
              {active ? "Migraine is active" : "Migraine starting now"}
            </button>
          </div>
          <span className="small muted">
            A quick entry now. More details whenever you’re ready.
          </span>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <Leaf size={82} strokeWidth={1} />
        </div>
      </section>
      {active && (
        <section className="card active-card">
          <div className="active-top">
            <span className="status-dot" />
            <span className="eyebrow">Migraine active</span>
          </div>
          <h2>
            {duration(active.startedAt, null)}{" "}
            <span className="muted">so far</span>
          </h2>
          <p className="muted">
            Started {formatDate(active.startedAt, data.settings, true)} ·
            Severity {active.severity ?? "not recorded"}
            {active.severity ? "/10" : ""}
          </p>
          <div className="button-row">
            <button className="button primary" onClick={() => edit(active)}>
              Update
            </button>
            <button
              className="button secondary"
              onClick={() => takeDose(active.id)}
            >
              <Pill size={17} />
              Take medication
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => end(active)}
            >
              <Check size={17} />
              End Migraine
            </button>
          </div>
        </section>
      )}
      <div className="section-label">
        <h2>Your last 30 days</h2>
        <button className="text-button" onClick={() => navigate("trends")}>
          Explore trends <ArrowRight size={16} />
        </button>
      </div>
      <div className="home-metrics">
        <div className="card metric">
          <span>
            <CalendarDays size={17} />
            Migraine days
          </span>
          <strong>
            {metrics.migraineDays}
            <small> / 30 days</small>
          </strong>
          <p className="muted small">Each day counts once</p>
        </div>
        <div className="card metric">
          <span>
            <Activity size={17} />
            Average severity
          </span>
          <strong>
            {metrics.averageSeverity?.toFixed(1) ?? "—"}
            <small> / 10</small>
          </strong>
          <p className="muted small">
            From {metrics.severityRecorded} rated episodes
          </p>
        </div>
        <div className="card metric">
          <span>
            <Clock3 size={17} />
            Average duration
          </span>
          <strong>
            {metrics.averageDuration === null
              ? "—"
              : metrics.averageDuration.toFixed(1)}
            <small> hours</small>
          </strong>
          <p className="muted small">Completed episodes</p>
        </div>
      </div>
      <div className="home-columns">
        <section className="card recent-card">
          <CardTitle
            title="Recent episodes"
            action="View history"
            onClick={() => navigate("history")}
          />
          {recent.length ? (
            recent.map((e) => (
              <EpisodeRow
                key={e.id}
                episode={e}
                data={data}
                open={() => edit(e)}
              />
            ))
          ) : (
            <Empty
              title="Your story starts here"
              text="Your recent migraines will appear here once recorded."
            />
          )}
          <button className="subtle-row" onClick={checkIn}>
            <div className="round-icon">
              <Heart size={19} />
            </div>
            <div>
              <strong>A little context helps</strong>
              <p>Check in on migraine-free days, too.</p>
            </div>
            <ChevronRight size={19} />
          </button>
        </section>
        <section className="card preventive-card">
          <CardTitle
            title="Your medications"
            action="Manage"
            onClick={() => navigate("medications")}
          />
          {preventive.length ? (
            preventive.map((m) => (
              <div className="preventive-item" key={m.id}>
                <div className="round-icon">
                  <Pill size={20} />
                </div>
                <div>
                  <strong>{m.name}</strong>
                  <p className="muted small">
                    {m.dose ?? ""} {m.units} · {m.frequency || "Preventive"}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <p className="muted">
              Add your medications to keep your journal in one place.
            </p>
          )}
          <div className="soft-note">
            <Leaf size={19} />
            <p>
              Small notes can make your next doctor’s visit a little easier.
            </p>
          </div>
          <button className="text-button" onClick={() => navigate("trends")}>
            Prepare a doctor report <ArrowRight size={16} />
          </button>
        </section>
      </div>
      {pending.length > 0 && (
        <section className="card">
          <h2>How did your medication help?</h2>
          <p className="muted small">
            Add relief when you feel ready. This is a record, not a reminder to
            take another dose.
          </p>
          {pending.map((d) => (
            <DoseReview key={d.id} dose={d} data={data} saved={saved} />
          ))}
        </section>
      )}
      {data.episodes.length > 0 && <MigraineChart data={data} {...period} />}
      <p className="privacy-footer">
        <LockKeyhole size={13} />
        Your data stays on your server. Always.
      </p>
    </>
  );
}
