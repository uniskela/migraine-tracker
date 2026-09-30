import { useEffect, useState } from "react";
export type Route = { name: string; params: string[] };
/** Split a location hash such as #log/new/2 into a page name and parameters. */
export function parseRoute(hash: string): Route {
  const [name = "", ...params] = hash
    .replace(/^#\/?/, "")
    .split("/")
    .map((part) => {
      // A malformed escape in a typed or truncated link keeps its raw text rather than breaking the app.
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
  return { name: name || "home", params };
}
/** Run once a just-closed dialog has removed its history entry, so navigation does not land on that entry. */
function settle(action: () => void) {
  const dialogEntry = (history.state as { modal?: string } | null)?.modal;
  if (!dialogEntry || document.querySelector("dialog[open]")) {
    action();
    return;
  }
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    window.removeEventListener("popstate", run);
    action();
  };
  window.addEventListener("popstate", run);
  setTimeout(run, 300);
}
/** Change page within the app; replace keeps the current history entry. */
export function navigate(
  path: string,
  {
    replace = false,
    state = null,
  }: { replace?: boolean; state?: unknown } = {},
) {
  settle(() => {
    const url = `#${path}`;
    // Entries created here are marked so that goBack knows an in-app page precedes them.
    const inApp = replace ? inAppEntry() : true;
    const next = state ?? (inApp ? { app: true } : null);
    if (replace) history.replaceState(next, "", url);
    else history.pushState(next, "", url);
    window.dispatchEvent(new Event("routechange"));
    window.scrollTo({ top: 0 });
  });
}
/** Whether the current history entry was opened from another page of this app. */
const inAppEntry = () => {
  const state = history.state as { app?: boolean; entered?: boolean } | null;
  return !!state?.app || !!state?.entered;
};
/** Return to the previous in-app page, or to a fallback when this page was opened directly. */
export function goBack(fallback: string) {
  if (inAppEntry()) history.back();
  else navigate(fallback, { replace: true });
}
/** Follow the current route across in-app navigation and browser back/forward. */
export function useRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const update = () => setHash(location.hash);
    const events = ["popstate", "hashchange", "routechange"];
    for (const event of events) window.addEventListener(event, update);
    return () => {
      for (const event of events) window.removeEventListener(event, update);
    };
  }, []);
  return parseRoute(hash);
}
/** History bookkeeping for a step-by-step flow: how many steps deep, and whether it was opened from another page. */
type FlowState = { flow: string; depth: number; entered: boolean };
const flowState = (key: string): FlowState | null => {
  const state = history.state as FlowState | null;
  return state?.flow === key ? state : null;
};
const detached = (key: string): FlowState => ({
  flow: key,
  depth: 0,
  entered: false,
});
/** Open a flow from the current page so that leaving returns here. */
export function enterFlow(key: string, path: string) {
  navigate(path, { state: { flow: key, depth: 0, entered: true } });
}
/** Move forward a step, adding a history entry so the back gesture returns to the previous step. */
export function nextStep(key: string, path: string) {
  settle(() => {
    const state = flowState(key) ?? detached(key);
    navigate(path, { state: { ...state, depth: state.depth + 1 } });
  });
}
/** Go to the previous step, using history when the previous entry is part of this flow. */
export function previousStep(key: string, path: string) {
  settle(() => {
    const state = flowState(key);
    if (state && state.depth > 0) history.back();
    else navigate(path, { replace: true, state: state ?? detached(key) });
  });
}
/** Jump directly to a step without adding history. */
export function jumpStep(key: string, path: string) {
  settle(() =>
    navigate(path, { replace: true, state: flowState(key) ?? detached(key) }),
  );
}
/** Leave a flow, returning to the page it was opened from when possible. */
export function exitFlow(key: string, fallback: string) {
  settle(() => {
    const state = flowState(key);
    if (state?.entered) history.go(-(state.depth + 1));
    else navigate(fallback, { replace: true });
  });
}
