import { useState } from "react";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Check,
  CircleCheck,
  CirclePlus,
  Clock3,
  Heart,
  LockKeyhole,
  NotebookPen,
  Pill,
} from "lucide-react";
import { DateTime } from "luxon";
import type { Episode } from "../shared/validation";
import { duration, summary } from "../shared/stats";
import { formatHours } from "../shared/sleep";
import type { Data } from "./api";
import { DoseReview } from "./Medications";
import { EpisodeRow } from "./History";
import { MigraineChart } from "./Trends";
import { clearDraft, readDraft } from "./drafts";
import { CardTitle, Empty, formatDate, PageTitle, useConfirm } from "./ui";
/** Show immediate migraine actions, active status and a concise summary of recent records. */
export function Home({
  data,
  navigate,
  start,
  logDetails,
  resumeDraft,
  edit,
  view,
  end,
  takeDose,
  checkIn,
  busy,
  saved,
}: {
  data: Data;
  navigate: (page: string) => void;
  start: () => void;
  logDetails: () => void;
  resumeDraft: (step: number) => void;
  edit: (e: Episode) => void;
  view: (e: Episode) => void;
  end: (e: Episode) => void;
  takeDose: (id?: string) => void;
  checkIn: (date?: string) => void;
  busy: boolean;
  saved: () => Promise<void>;
}) {
  const confirm = useConfirm();
  const [, redraw] = useState(0);
  const zone = data.settings.timezone;
  const now = DateTime.now().setZone(zone);
  const today = now.toISODate()!;
  const period = {
    from: now.minus({ days: 29 }).toISODate()!,
    to: today,
  };
  const metrics = summary(
    data.episodes,
    data.doses,
    data.medications,
    period,
    zone,
  );
  const active = data.episodes.find((e) => !e.endedAt);
  const recent = data.episodes.filter((e) => e.endedAt).slice(0, 3);
  const current = data.medications.filter((m) => m.active);
  const pending = data.doses.filter(
    (d) =>
      !d.effectiveness &&
      Date.parse(d.takenAt) + d.reviewAfterMinutes * 60000 <= Date.now() &&
      Date.parse(d.takenAt) > Date.now() - 2 * 86400000,
  );
  const draft = readDraft<{ start: string; step?: number }>("episode:new");
  const draftStart = DateTime.fromISO(draft?.start ?? "", { zone });
  const checkInDraft = readDraft<{ date: string }>("checkin");
  const checkedIn = data.daily.find((d) => d.date === today);
  return (
    <>
      <PageTitle
        eyebrow={now.toFormat("cccc, d MMMM")}
        title={
          active
            ? "You’re tracking a migraine."
            : now.hour < 12
              ? "Good morning."
              : now.hour < 18
                ? "Good afternoon."
                : "Good evening."
        }
        text={
          active
            ? "Add details when you can. Everything else can wait."
            : undefined
        }
      />
      {draft && (
        <section className="card draft-banner" aria-label="Unsaved entry">
          <NotebookPen size={20} aria-hidden="true" />
          <div>
            <strong>You have an unsaved migraine entry</strong>
            <p className="muted small">
              {draftStart.isValid &&
                `Started ${formatDate(draftStart.toISO()!, data.settings, true)}. `}
              It hasn’t been saved yet.
            </p>
          </div>
          <div className="button-row">
            <button
              className="button primary"
              onClick={() => resumeDraft(draft.step ?? 0)}
            >
              Continue
            </button>
            <button
              className="button secondary"
              onClick={async () => {
                if (
                  await confirm({
                    title: "Discard this entry?",
                    message: "The unsaved migraine entry will be removed.",
                    confirmLabel: "Discard",
                    danger: true,
                  })
                ) {
                  clearDraft("episode:new");
                  redraw((v) => v + 1);
                }
              }}
            >
              Discard
            </button>
          </div>
        </section>
      )}
      {active && (
        <section className="card active-card" aria-live="polite">
          <div className="active-top">
            <span className="status-dot" aria-hidden="true" />
            <span className="eyebrow">Migraine active</span>
          </div>
          <h2>
            {duration(active.startedAt, null)}{" "}
            <span className="muted">so far</span>
          </h2>
          <p className="muted">
            Started {formatDate(active.startedAt, data.settings, true)} ·
            severity{" "}
            {active.severity ? `${active.severity}/10` : "not recorded"}
          </p>
          <div className="button-row">
            <button
              className="button primary large"
              onClick={() => edit(active)}
            >
              Add details
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
              End migraine
            </button>
          </div>
          <button className="text-button" onClick={() => view(active)}>
            View everything recorded <ArrowRight size={16} />
          </button>
        </section>
      )}
      {pending.length > 0 && (
        <section className="card">
          <h2>How did your medication help?</h2>
          <p className="muted small">
            Add this when you feel ready. It’s a record, not a reminder to take
            more.
          </p>
          {pending.map((d) => (
            <DoseReview key={d.id} dose={d} data={data} saved={saved} />
          ))}
        </section>
      )}
      {!active && (
        <section className="quick-log">
          <h2>How are you feeling?</h2>
          <p>Start with what you know. You can add details later.</p>
          <div className="quick-actions">
            <button
              className="button primary large"
              disabled={busy}
              onClick={start}
            >
              <CirclePlus size={20} />
              Migraine starting now
            </button>
            <button className="button secondary large" onClick={logDetails}>
              Log a migraine with details
            </button>
          </div>
          <span className="small muted">
            “Starting now” saves the time in one tap.
          </span>
        </section>
      )}
      <section className="card checkin-card">
        <div className="round-icon">
          {checkedIn ? <CircleCheck size={19} /> : <Heart size={19} />}
        </div>
        <div>
          <strong>
            {checkedIn ? "You’ve checked in today" : "Daily check-in"}
          </strong>
          <p className="muted small">
            {checkedIn
              ? [
                  checkedIn.factors.length
                    ? checkedIn.factors.join(", ")
                    : "Nothing noted",
                  checkedIn.sleep?.hours != null
                    ? `slept about ${formatHours(checkedIn.sleep.hours)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "A quick note about today, with or without a migraine, helps you compare patterns."}
          </p>
        </div>
        <button
          className={`button ${checkedIn ? "secondary" : "primary"}`}
          onClick={() => checkIn(checkInDraft?.date ?? today)}
        >
          {checkInDraft ? "Continue" : checkedIn ? "Edit" : "Check in"}
        </button>
      </section>
      <div className="section-label">
        <h2>Your last 30 days</h2>
        <button className="text-button" onClick={() => navigate("trends")}>
          See trends <ArrowRight size={16} />
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
            <small> of 30</small>
          </strong>
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
          <p className="muted small">{metrics.severityRecorded} rated</p>
        </div>
        <div className="card metric">
          <span>
            <Clock3 size={17} />
            Average length
          </span>
          <strong>
            {metrics.averageDuration === null
              ? "—"
              : formatHours(metrics.averageDuration)}
          </strong>
          <p className="muted small">{metrics.completedEpisodes} finished</p>
        </div>
      </div>
      <div className="home-columns">
        <section className="card recent-card">
          <CardTitle
            title="Recent migraines"
            action="See all"
            onClick={() => navigate("history")}
          />
          {recent.length ? (
            recent.map((e) => (
              <EpisodeRow
                key={e.id}
                episode={e}
                data={data}
                open={() => view(e)}
              />
            ))
          ) : (
            <Empty
              title="Nothing recorded yet"
              text="Migraines you log will appear here."
            />
          )}
        </section>
        <section className="card preventive-card">
          <CardTitle
            title="Your medications"
            action="Manage"
            onClick={() => navigate("medications")}
          />
          {current.length ? (
            current.map((m) => (
              <div className="preventive-item" key={m.id}>
                <div className="round-icon">
                  <Pill size={20} />
                </div>
                <div>
                  <strong>{m.name}</strong>
                  <p className="muted small">
                    {m.dose ?? ""} {m.units} ·{" "}
                    {m.frequency ||
                      (m.category === "preventive"
                        ? "Preventive"
                        : "As needed")}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <p className="muted">
              Add the medications you take to record doses quickly.
            </p>
          )}
          <button className="text-button" onClick={() => navigate("trends")}>
            Prepare a doctor report <ArrowRight size={16} />
          </button>
        </section>
      </div>
      {data.episodes.length > 0 && <MigraineChart data={data} {...period} />}
      <p className="privacy-footer">
        <LockKeyhole size={13} />
        Your data stays on your server.
      </p>
    </>
  );
}
