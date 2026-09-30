/** Unsaved entries are kept for this browser session only, so an accidental close or back gesture can be recovered without keeping health data on the device long term. */
const prefix = "tracker-draft:";
export function readDraft<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(prefix + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
export function writeDraft(key: string, value: unknown) {
  try {
    sessionStorage.setItem(prefix + key, JSON.stringify(value));
  } catch {
    /* Drafts are a convenience; storage may be unavailable. */
  }
}
export function clearDraft(key: string) {
  try {
    sessionStorage.removeItem(prefix + key);
  } catch {
    /* Nothing to clear when storage is unavailable. */
  }
}
/** Remove every unsaved entry, for example when signing out. */
export function clearAllDrafts() {
  try {
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith(prefix)) sessionStorage.removeItem(key);
  } catch {
    /* Nothing to clear when storage is unavailable. */
  }
}
