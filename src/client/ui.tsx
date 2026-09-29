import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type FormEvent,
} from "react";
import { X, ArrowUpRight, Leaf } from "lucide-react";
import { DateTime } from "luxon";
import type { Settings } from "../shared/validation";
/** Associate a visible label and optional hint with the first input child using a unique ID. */
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {Children.map(children, (child, index) =>
        index === 0 && isValidElement(child)
          ? cloneElement(
              child as ReactElement<{
                id?: string;
                "aria-describedby"?: string;
              }>,
              { id, "aria-describedby": hint ? `${id}-hint` : undefined },
            )
          : child,
      )}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
/** Render a labelled group of independently toggleable, keyboard-accessible selections. */
export function Chips({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <fieldset className="chips-field">
      <legend>{label}</legend>
      <div className="chips">
        {options.map((option) => (
          <button
            type="button"
            key={option}
            aria-pressed={value.includes(option)}
            onClick={() =>
              onChange(
                value.includes(option)
                  ? value.filter((v) => v !== option)
                  : [...value, option],
              )
            }
          >
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
/** Open a native modal dialog and restore prior focus when it closes. */
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const previous = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    document.body.classList.add("modal-open");
    return () => {
      document.body.classList.remove("modal-open");
      previous.current?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-header">
        <h2 id="modal-title">{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close"
          onClick={close}
        >
          <X size={22} />
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
/** Render a submit button that indicates and disables interaction during a save. */
export function Submit({
  busy,
  children = "Save",
}: {
  busy: boolean;
  children?: ReactNode;
}) {
  return (
    <button
      type="submit"
      className="button primary"
      disabled={busy}
      aria-busy={busy}
    >
      {busy ? "Working…" : children}
    </button>
  );
}
/** Announce a nonempty operation error to assistive technology. */
export function ErrorMessage({ error }: { error: string }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null;
}
/** Explain an empty collection with an optional next action. */
export function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-mark" aria-hidden="true">
        <Leaf size={28} strokeWidth={1.4} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}
/** Render the page’s primary heading, context and optional main action. */
export function PageTitle({
  eyebrow,
  title,
  text,
  action,
}: {
  eyebrow: string;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-title">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {text && <p className="muted">{text}</p>}
      </div>
      {action}
    </header>
  );
}
/** Render a card heading and its optional secondary action. */
export function CardTitle({
  title,
  action,
  onClick,
}: {
  title: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="card-title">
      <h2>{title}</h2>
      {action && (
        <button className="text-button" onClick={onClick}>
          {action}
          <ArrowUpRight size={16} />
        </button>
      )}
    </div>
  );
}
/** Manage pending and error state for asynchronous form actions without optimistic persistence. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** Execute an action with visible pending/error state and release pending state on failure. */
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  return {
    busy,
    error,
    setError,
    run,
    submit: (action: () => Promise<void>) => (e: FormEvent) => {
      e.preventDefault();
      void run(action);
    },
  };
}
/** Format the current time for a datetime-local field in the configured timezone. */
export const localNow = (zone: string) =>
  DateTime.now().setZone(zone).toFormat("yyyy-MM-dd\u0027T\u0027HH:mm");
/** Convert a stored ISO timestamp to a datetime-local field in the configured timezone. */
export const localInput = (value: string, zone: string) =>
  DateTime.fromISO(value)
    .setZone(zone)
    .toFormat("yyyy-MM-dd\u0027T\u0027HH:mm");
/** Convert user-entered local time to a UTC ISO timestamp, rejecting invalid dates. */
export const toUTC = (value: string, zone: string) => {
  const time = DateTime.fromISO(value, { zone });
  if (!time.isValid) throw new Error("Please enter a valid date and time.");
  return time.toUTC().toISO()!;
};
/** Display a stored date or timestamp using the account’s timezone and format preferences. */
export const formatDate = (value: string, settings: Settings, time = false) =>
  DateTime.fromISO(value, { zone: settings.timezone })
    .setZone(settings.timezone)
    .toFormat(
      `${settings.dateFormat}${time ? (settings.timeFormat === "12" ? ", h:mm a" : ", HH:mm") : ""}`,
    );
