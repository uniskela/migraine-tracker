import type { Episode, Medication, Dose, Settings } from "../shared/validation";
export type Data = {
  episodes: Episode[];
  medications: Medication[];
  doses: Dose[];
  effects: {
    id: string;
    medicationId: string;
    name: string;
    severity: number;
    date: string;
    notes: string;
  }[];
  weights: {
    id: string;
    date: string;
    value: number;
    units: "kg" | "lb";
    notes: string;
  }[];
  daily: {
    id: string;
    date: string;
    factors: string[];
    activities: string[];
    sleep: Episode["sleep"];
    notes: string;
  }[];
  settings: Settings;
};
let csrf = "";
/** Keep the session CSRF token in memory for subsequent authenticated writes. */
export function setCsrf(token: string) {
  csrf = token;
}
/** Send a same-origin JSON request and surface safe API errors; offline writes are never queued. */
export async function api<T = unknown>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  if (!navigator.onLine)
    throw new Error("You’re offline. Reconnect to save or load your journal.");
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    credentials: "same-origin",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const error = await res
      .json()
      .catch(() => ({ error: "The request could not be completed." }));
    throw new Error(error.error || "The request could not be completed.");
  }
  return res.json() as Promise<T>;
}
/** Fetch an authenticated export and release its temporary browser download URL afterward. */
export async function download(path: string, filename: string, body?: unknown) {
  const res = await fetch(`/api${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(
      error.error || "Export failed. Please reconnect and sign in.",
    );
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
