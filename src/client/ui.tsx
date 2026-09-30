import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useId,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type FormEvent,
} from "react";
import { X, ArrowLeft, ArrowRight, ArrowUpRight, Leaf } from "lucide-react";
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
/** Render a labelled single choice as large buttons; with allowClear, tapping the selected option clears it. */
export function ChoiceButtons<T extends string | number>({
  label,
  options,
  value,
  onChange,
  allowClear = false,
  hint,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T | null) => void;
  allowClear?: boolean;
  hint?: string;
}) {
  return (
    <fieldset className="choice-field">
      <legend>{label}</legend>
      {hint && <p className="field-hint">{hint}</p>}
      <div className="choices">
        {options.map((option) => (
          <button
            type="button"
            key={option.value}
            aria-pressed={value === option.value}
            onClick={() =>
              onChange(
                allowClear && value === option.value ? null : option.value,
              )
            }
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
const inputFormat = "yyyy-MM-dd'T'HH:mm";
/** Pick a local date and time with separate controls and one-tap shortcuts for recent times. */
export function DateTimeField({
  label,
  value,
  onChange,
  zone,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  zone: string;
}) {
  const id = useId();
  const [date = "", time = ""] = value.split("T");
  const now = DateTime.now().setZone(zone);
  const current = DateTime.fromISO(value, { zone });
  const shortcuts: [string, () => DateTime][] = [
    ["Now", () => now],
    ["1 hour ago", () => now.minus({ hours: 1 })],
    ["3 hours ago", () => now.minus({ hours: 3 })],
    ["Yesterday", () => (current.isValid ? current : now).minus({ days: 1 })],
  ];
  return (
    <fieldset className="datetime-field">
      <legend>{label}</legend>
      <div className="datetime-inputs">
        <div className="field">
          <label htmlFor={`${id}-date`}>
            <span className="visually-hidden">{label} </span>Date
          </label>
          <input
            id={`${id}-date`}
            type="date"
            required
            max={now.toISODate()!}
            value={date}
            onChange={(e) => onChange(`${e.target.value}T${time}`)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-time`}>
            <span className="visually-hidden">{label} </span>Time
          </label>
          <input
            id={`${id}-time`}
            type="time"
            required
            value={time}
            onChange={(e) => onChange(`${date}T${e.target.value}`)}
          />
        </div>
      </div>
      <div className="quick-times">
        {shortcuts.map(([text, time]) => (
          <button
            type="button"
            key={text}
            aria-label={`${label}: ${text.toLowerCase()}`}
            onClick={() => onChange(time().toFormat(inputFormat))}
          >
            {text}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
};
type Confirm = (options: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<Confirm>((o) =>
  Promise.resolve(window.confirm(`${o.title}\n\n${o.message}`)),
);
/** Ask for confirmation in an in-app dialog; resolves true only when the user confirms. */
export const useConfirm = () => useContext(ConfirmContext);
/** Provide in-app confirmation dialogs to descendants. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);
  const confirm = useCallback<Confirm>(
    (options) => new Promise((resolve) => setRequest({ options, resolve })),
    [],
  );
  const answer = (value: boolean) => {
    request?.resolve(value);
    setRequest(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && (
        <Modal title={request.options.title} close={() => answer(false)} alert>
          <p>{request.options.message}</p>
          <div className="button-row dialog-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => answer(false)}
            >
              {request.options.cancelLabel || "Cancel"}
            </button>
            <button
              type="button"
              className={`button ${request.options.danger ? "danger-button" : "primary"}`}
              onClick={() => answer(true)}
            >
              {request.options.confirmLabel}
            </button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}
let openDialogs = 0;
/** Open a native modal dialog that focuses its first control, closes with the back gesture, asks before discarding unsaved changes and restores prior focus. */
export function Modal({
  title,
  children,
  close,
  dirty = false,
  alert = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  dirty?: boolean;
  alert?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const confirm = useConfirm();
  const previous = useRef(document.activeElement as HTMLElement | null);
  const latest = useRef({ close, dirty, confirm });
  latest.current = { close, dirty, confirm };
  const requestClose = useCallback(async () => {
    const { dirty, confirm, close } = latest.current;
    if (
      dirty &&
      !(await confirm({
        title: "Discard changes?",
        message: "What you entered here hasn’t been saved yet.",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
        danger: true,
      }))
    )
      return;
    close();
  }, []);
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    el.querySelector<HTMLElement>(
      ".modal-body :is(input, select, textarea, button):not([disabled])",
    )?.focus();
    openDialogs++;
    document.body.classList.add("modal-open");
    // A history entry lets the phone back gesture close the dialog instead of leaving the page.
    const key = Math.random().toString(36).slice(2);
    const ours = () =>
      (history.state as { modal?: string } | null)?.modal === key;
    history.pushState({ modal: key }, "");
    const onPop = () => {
      if (ours()) return;
      if (latest.current.dirty) history.pushState({ modal: key }, "");
      void requestClose();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (ours()) history.back();
      // A confirmation closing at the same moment is still removing its own entry; remove ours after it.
      else if ((history.state as { modal?: string } | null)?.modal)
        window.addEventListener(
          "popstate",
          () => {
            if (ours()) history.back();
          },
          { once: true },
        );
      if (--openDialogs === 0) document.body.classList.remove("modal-open");
      previous.current?.focus();
    };
  }, [requestClose]);
  return (
    <dialog
      ref={ref}
      role={alert ? "alertdialog" : undefined}
      onCancel={(e) => {
        e.preventDefault();
        void requestClose();
      }}
      aria-labelledby={titleId}
    >
      <div className="modal-header">
        <h2 id={titleId}>{title}</h2>
        {!alert && (
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={() => void requestClose()}
          >
            <X size={22} />
          </button>
        )}
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
/** Lay out one step of a page-by-page form with progress, step navigation and a sticky footer; Enter moves to the next step rather than saving. */
export function StepFlow({
  title,
  steps,
  step,
  onStep,
  onBack,
  onNext,
  onSave,
  onClose,
  busy,
  saveLabel,
  error,
  children,
}: {
  title: string;
  steps: string[];
  step: number;
  onStep: (index: number) => void;
  onBack: () => void;
  onNext: () => void;
  onSave: () => void;
  onClose: () => void;
  busy: boolean;
  saveLabel: string;
  error?: string;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const last = step === steps.length - 1;
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  return (
    <form
      className="flow"
      onSubmit={(e) => {
        e.preventDefault();
        if (last) onSave();
        else onNext();
      }}
    >
      <header className="flow-header">
        <p className="eyebrow">{title}</p>
        <span className="flow-count">
          Step {step + 1} of {steps.length}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={22} />
        </button>
      </header>
      <nav className="flow-steps" aria-label="Steps">
        <ol>
          {steps.map((label, i) => (
            <li key={label}>
              <button
                type="button"
                aria-current={i === step ? "step" : undefined}
                data-done={i < step || undefined}
                onClick={() => onStep(i)}
              >
                <span className="flow-step-bar" aria-hidden="true" />
                <span className="flow-step-label">
                  <span className="visually-hidden">Step {i + 1}: </span>
                  {label}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <h1 ref={heading} tabIndex={-1} className="flow-title">
        {steps[step]}
      </h1>
      <div className="flow-body">{children}</div>
      <ErrorMessage error={error || ""} />
      <footer className="flow-footer">
        {step > 0 ? (
          <button type="button" className="button secondary" onClick={onBack}>
            <ArrowLeft size={17} />
            Back
          </button>
        ) : (
          <span />
        )}
        {!last && (
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onSave}
          >
            Save now
          </button>
        )}
        <button
          type="submit"
          className="button primary"
          disabled={busy}
          aria-busy={busy}
        >
          {last ? (
            busy ? (
              "Saving…"
            ) : (
              saveLabel
            )
          ) : (
            <>
              Next
              <ArrowRight size={17} />
            </>
          )}
        </button>
      </footer>
    </form>
  );
}
/** Switch between sections of a page. */
export function SubNav<T extends string>({
  label,
  items,
  current,
  onSelect,
}: {
  label: string;
  items: { id: T; label: string }[];
  current: T;
  onSelect: (id: T) => void;
}) {
  return (
    <nav className="subnav" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-current={item.id === current ? "page" : undefined}
          onClick={() => onSelect(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
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
  DateTime.now().setZone(zone).toFormat(inputFormat);
/** Convert a stored ISO timestamp to a datetime-local field in the configured timezone. */
export const localInput = (value: string, zone: string) =>
  DateTime.fromISO(value).setZone(zone).toFormat(inputFormat);
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
/** Display a stored HH:mm clock time using the account’s 12- or 24-hour preference. */
export const formatClock = (value: string, settings: Settings) =>
  settings.timeFormat === "24"
    ? value
    : DateTime.fromFormat(value, "HH:mm").toFormat("h:mm a");
