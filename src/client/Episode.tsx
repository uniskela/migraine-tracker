import type { ReactNode } from "react";
import { ArrowLeft, Check, Pencil, Pill } from "lucide-react";
import { api, type Data } from "./api";
import { duration } from "../shared/stats";
import { impacts } from "../shared/options";
import { sleepSummary } from "./Entry";
import { DoseReview } from "./Medications";
import { enterFlow, goBack, navigate } from "./router";
import {
  Empty,
  ErrorMessage,
  formatDate,
  PageTitle,
  useAction,
  useConfirm,
} from "./ui";
/** One labelled group of recorded answers with a shortcut to the step that edits them. */
function Section({
  title,
  rows,
  edit,
}: {
  title: string;
  rows: [string, ReactNode][];
  edit: () => void;
}) {
  return (
    <section className="detail-section">
      <div className="card-title">
        <h2>{title}</h2>
        <button className="text-button" onClick={edit}>
          <Pencil size={14} />
          Edit<span className="visually-hidden"> {title.toLowerCase()}</span>
        </button>
      </div>
      <dl className="detail-list">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value || <span className="muted">Not recorded</span>}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
/** Show everything recorded for one migraine, with its medication and the actions that apply to it. */
export function EpisodeDetail({
  id,
  data,
  saved,
  takeDose,
}: {
  id: string;
  data: Data;
  saved: () => Promise<void>;
  takeDose: (episodeId: string) => void;
}) {
  const action = useAction();
  const confirm = useConfirm();
  const e = data.episodes.find((v) => v.id === id);
  if (!e)
    return (
      <Empty
        title="This migraine isn’t in your journal"
        text="It may have been deleted."
        action={
          <button
            className="button secondary"
            onClick={() => navigate("history", { replace: true })}
          >
            Back to history
          </button>
        }
      />
    );
  const s = data.settings;
  const edit = (step: number) =>
    enterFlow(`episode:${e.id}`, `log/${e.id}/${step}`);
  const list = (items: string[]) => (items.length ? items.join(", ") : null);
  const doses = data.doses
    .filter((d) => d.episodeId === e.id)
    .sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  return (
    <>
      <button
        className="text-button back-link"
        onClick={() => goBack("history")}
      >
        <ArrowLeft size={16} />
        Back
      </button>
      <PageTitle
        eyebrow={formatDate(e.startedAt, s)}
        title={e.endedAt ? "Migraine" : "Migraine · ongoing"}
        text={`${duration(e.startedAt, e.endedAt)}${e.endedAt ? "" : " so far"} · severity ${e.severity ? `${e.severity}/10` : "not recorded"}`}
        action={
          <button className="button primary" onClick={() => edit(0)}>
            <Pencil size={17} />
            Edit
          </button>
        }
      />
      {!e.endedAt && (
        <div className="button-row detail-actions">
          <button
            className="button secondary"
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                await api(`/episodes/${e.id}/end`, "POST", {});
                await saved();
              })
            }
          >
            <Check size={17} />
            End migraine now
          </button>
        </div>
      )}
      <div className="card detail-card">
        <Section
          title="When and how bad"
          edit={() => edit(0)}
          rows={[
            ["Started", formatDate(e.startedAt, s, true)],
            [
              "Ended",
              e.endedAt ? formatDate(e.endedAt, s, true) : "Still ongoing",
            ],
            ["Severity", e.severity && `${e.severity}/10`],
            ["Side of head", e.side === "Unspecified" ? null : e.side],
          ]}
        />
        <Section
          title="Pain and symptoms"
          edit={() => edit(1)}
          rows={[
            ["Where", list(e.locations)],
            ["Feels like", list(e.characters)],
            ["Symptoms", list(e.symptoms)],
          ]}
        />
        <Section
          title="Impact on your day"
          edit={() => edit(2)}
          rows={[
            [
              "Impact",
              e.impact !== null && `${e.impact} · ${impacts[e.impact]}`,
            ],
            ["Changes to plans", list(e.disruptions)],
            ["Kind of day", list(e.activities)],
          ]}
        />
        <Section
          title="What was going on"
          edit={() => edit(3)}
          rows={[["Context", list(e.factors)]]}
        />
        <Section
          title="Sleep before"
          edit={() => edit(4)}
          rows={[["Sleep", sleepSummary(e.sleep, s)]]}
        />
        <Section
          title="Notes"
          edit={() => edit(5)}
          rows={[["Notes", e.notes && <p className="notes">{e.notes}</p>]]}
        />
      </div>
      <section className="card">
        <div className="card-title">
          <h2>Medication for this migraine</h2>
          <button className="button secondary" onClick={() => takeDose(e.id)}>
            <Pill size={17} />
            Record medication
          </button>
        </div>
        {doses.length ? (
          doses.map((d) => (
            <DoseReview key={d.id} dose={d} data={data} saved={saved} />
          ))
        ) : (
          <p className="muted">No medication recorded for this migraine.</p>
        )}
      </section>
      <ErrorMessage error={action.error} />
      <button
        className="text-button danger"
        disabled={action.busy}
        onClick={async () => {
          if (
            await confirm({
              title: "Delete this migraine?",
              message:
                "This can’t be undone. Medication doses are kept as standalone records.",
              confirmLabel: "Delete migraine",
              danger: true,
            })
          )
            void action.run(async () => {
              await api(`/episodes/${e.id}`, "DELETE");
              await saved();
              navigate("history", { replace: true });
            });
        }}
      >
        Delete migraine
      </button>
    </>
  );
}
