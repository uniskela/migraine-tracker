import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  CalendarDays,
  Home as HomeIcon,
  Leaf,
  Pencil,
  Pill,
  Plus,
  Settings as SettingsIcon,
  TrendingUp,
  WifiOff,
  X,
} from "lucide-react";
import { DateTime } from "luxon";
import type { Episode } from "../shared/validation";
import { duration } from "../shared/stats";
import { api, setCsrf, type Data } from "./api";
import { CheckInFlow, EpisodeFlow } from "./Entry";
import { EpisodeDetail } from "./Episode";
import { DoseForm, Medications } from "./Medications";
import { History, type HistorySection } from "./History";
import { Trends } from "./Trends";
import { SettingsPage } from "./Settings";
import { ConfirmProvider, ErrorMessage, useAction } from "./ui";
import { Login, type AuthStatus } from "./Login";
import { Home } from "./Home";
import { clearAllDrafts } from "./drafts";
import { enterFlow, navigate, useRoute } from "./router";
const pages = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "history", label: "History", icon: CalendarDays },
  { id: "trends", label: "Trends", icon: TrendingUp },
  { id: "medications", label: "Medications", icon: Pill },
  { id: "settings", label: "Settings", icon: SettingsIcon },
] as const;
/** Coordinate session state, journal refreshes, routing and global display preferences. */
export default function App() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [session, setSession] = useState<{ username: string } | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState("");
  const route = useRoute();
  const [dose, setDose] = useState<{ episodeId?: string } | null>(null);
  const [addingMedication, setAddingMedication] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [notice, setNotice] = useState("");
  const action = useAction();
  const [, tick] = useState(0);
  const refresh = useCallback(async () => {
    setData(await api<Data>("/data"));
  }, []);
  const bootstrap = useCallback(async () => {
    setLoading(true);
    setBootError("");
    try {
      const status = await api<AuthStatus>("/auth/status");
      setStatus(status);
      document.title = status.appName;
      const current = await api<{ username: string; csrf: string }>(
        "/auth/session",
      ).catch(() => null);
      setSession(current);
      if (current) {
        setCsrf(current.csrf);
        await refresh();
      }
    } finally {
      setLoading(false);
    }
  }, [refresh]);
  useEffect(() => {
    void bootstrap().catch((e) => setBootError(e.message));
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const timer = setInterval(() => tick((v) => v + 1), 60000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [bootstrap]);
  useEffect(() => {
    if (!data) return;
    document.documentElement.dataset.theme = data.settings.theme;
    document.documentElement.dataset.stimulation = data.settings.lowStimulation
      ? "low"
      : "normal";
  }, [data]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  const saved = async () => {
    await refresh();
    setNotice("Saved to your journal.");
  };
  const logout = () =>
    void action.run(async () => {
      await api("/auth/logout", "POST", {});
      clearAllDrafts();
      setData(null);
      setSession(null);
      setCsrf("");
      setNotice("");
      navigate("home", { replace: true });
    });
  if (loading)
    return (
      <div className="loading-screen">
        <Activity size={32} />
        <p>Opening your journal…</p>
      </div>
    );
  if (!status)
    return (
      <main className="offline-screen">
        <WifiOff size={34} />
        <h1>Your journal is safe.</h1>
        <p>Reconnect to your server to open your journal.</p>
        <button
          className="button primary"
          onClick={() => void bootstrap().catch((e) => setBootError(e.message))}
        >
          Try again
        </button>
        <ErrorMessage error={bootError} />
      </main>
    );
  if (!session) return <Login status={status} signedIn={bootstrap} />;
  if (!data)
    return (
      <main className="offline-screen">
        <h1>Unable to load your journal</h1>
        <p>{bootError}</p>
        <button className="button primary" onClick={() => void bootstrap()}>
          Retry
        </button>
      </main>
    );
  const zone = data.settings.timezone;
  const today = DateTime.now().setZone(zone).toISODate()!;
  const active = data.episodes.find((e) => !e.endedAt);
  const flow = route.name === "log" || route.name === "checkin";
  const page =
    route.name === "episode"
      ? "history"
      : pages.some((p) => p.id === route.name)
        ? route.name
        : "home";
  const section = route.params[0] ?? "";
  const go = (path: string) => navigate(path);
  const logDetails = () => enterFlow("episode:new", "log/new/0");
  const edit = (e: Episode) => enterFlow(`episode:${e.id}`, `log/${e.id}/0`);
  const view = (e: Episode) => navigate(`episode/${e.id}`);
  const checkIn = (date?: string) =>
    enterFlow("checkin", `checkin/${date ?? today}/0`);
  const logButton = active
    ? {
        label: "Update migraine",
        short: "Update",
        icon: Pencil,
        run: () => edit(active),
      }
    : { label: "Log migraine", short: "Log", icon: Plus, run: logDetails };
  const toggleComfort = () =>
    void action.run(async () => {
      await api("/settings", "PUT", {
        ...data.settings,
        lowStimulation: !data.settings.lowStimulation,
      });
      await refresh();
    });
  return (
    <ConfirmProvider>
      <div className={`app-shell${flow ? " flow-mode" : ""}`}>
        <a
          className="skip-link"
          href="#main-content"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById("main-content")?.focus();
          }}
        >
          Skip to content
        </a>
        <aside className="sidebar">
          <button className="brand" onClick={() => go("home")}>
            <span className="brand-icon">
              <Activity size={23} />
            </span>
            <span>{status.appName}</span>
          </button>
          <button
            className="button primary sidebar-log"
            onClick={logButton.run}
          >
            <logButton.icon size={18} />
            {logButton.label}
          </button>
          <nav aria-label="Main navigation">
            {pages.map((n) => (
              <button
                key={n.id}
                aria-current={page === n.id && !flow ? "page" : undefined}
                onClick={() => go(n.id)}
              >
                <n.icon size={20} />
                <span>{n.label}</span>
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <button
              className="account-button"
              onClick={() => go("settings/account")}
            >
              <span className="avatar" aria-hidden="true">
                {session.username.charAt(0).toUpperCase()}
              </span>
              <span>
                {session.username}
                <small>Account</small>
              </span>
            </button>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <span className="topbar-title">
              {route.name === "log" || route.name === "episode"
                ? "Migraine"
                : route.name === "checkin"
                  ? "Daily check-in"
                  : pages.find((n) => n.id === page)?.label}
            </span>
            <span className="mobile-brand">
              <Activity size={22} />
              {status.appName}
            </span>
            <div className="topbar-actions">
              <button
                className="comfort-toggle"
                aria-label="Low stimulation"
                aria-pressed={data.settings.lowStimulation}
                onClick={toggleComfort}
              >
                <Leaf size={16} />
                <span>Low stimulation</span>
              </button>
              <button
                className="icon-button mobile-only"
                aria-label="Settings"
                aria-current={page === "settings" ? "page" : undefined}
                onClick={() => go("settings")}
              >
                <SettingsIcon size={21} />
              </button>
            </div>
          </header>
          <main id="main-content" tabIndex={-1}>
            {offline && (
              <div className="offline-banner" role="status">
                <WifiOff size={18} />
                Offline. Reconnect to load or save changes.
              </div>
            )}
            <ErrorMessage error={action.error} />
            {active &&
              !flow &&
              route.name !== "home" &&
              route.name !== "episode" && (
                <div className="active-banner">
                  <span className="status-dot" aria-hidden="true" />
                  <span>
                    Migraine active · {duration(active.startedAt, null)}
                  </span>
                  <button className="text-button" onClick={() => view(active)}>
                    View
                  </button>
                </div>
              )}
            {route.name === "log" && (
              <EpisodeFlow
                key={route.params[0] ?? "new"}
                id={route.params[0] ?? "new"}
                step={Number(route.params[1] ?? 0)}
                data={data}
                saved={saved}
              />
            )}
            {route.name === "checkin" && (
              <CheckInFlow
                date={route.params[0] ?? today}
                step={Number(route.params[1] ?? 0)}
                data={data}
                saved={saved}
              />
            )}
            {route.name === "episode" && (
              <EpisodeDetail
                id={route.params[0] ?? ""}
                data={data}
                saved={saved}
                takeDose={(episodeId) => setDose({ episodeId })}
              />
            )}
            {!flow && page === "home" && route.name !== "episode" && (
              <Home
                data={data}
                navigate={go}
                start={() =>
                  void action.run(async () => {
                    await api("/episodes", "POST", {
                      startedAt: new Date().toISOString(),
                    });
                    await refresh();
                    setNotice(
                      "Migraine started. Add details whenever you’re ready.",
                    );
                  })
                }
                logDetails={logDetails}
                resumeDraft={(step) =>
                  enterFlow("episode:new", `log/new/${step}`)
                }
                edit={edit}
                view={view}
                end={(e) =>
                  void action.run(async () => {
                    await api(`/episodes/${e.id}/end`, "POST", {});
                    await saved();
                  })
                }
                takeDose={(episodeId) => setDose({ episodeId })}
                checkIn={checkIn}
                busy={action.busy || offline}
                saved={saved}
              />
            )}
            {route.name === "history" && (
              <History
                data={data}
                section={(section || "migraines") as HistorySection}
                setSection={(s) =>
                  navigate(s === "migraines" ? "history" : `history/${s}`, {
                    replace: true,
                  })
                }
                open={view}
                openCheckIn={checkIn}
                saved={saved}
              />
            )}
            {route.name === "trends" && (
              <Trends
                data={data}
                section={section}
                setSection={(s) =>
                  navigate(s === "overview" ? "trends" : `trends/${s}`, {
                    replace: true,
                  })
                }
              />
            )}
            {route.name === "medications" && (
              <Medications
                data={data}
                saved={saved}
                takeDose={() => setDose({})}
                adding={addingMedication}
                setAdding={setAddingMedication}
              />
            )}
            {route.name === "settings" && (
              <SettingsPage
                data={data}
                refresh={refresh}
                logout={logout}
                username={session.username}
                auth={status}
                section={section}
                setSection={(s) =>
                  navigate(s === "general" ? "settings" : `settings/${s}`, {
                    replace: true,
                  })
                }
              />
            )}
          </main>
        </div>
        <nav className="bottom-nav" aria-label="Mobile navigation">
          {pages.slice(0, 2).map((n) => (
            <button
              key={n.id}
              aria-current={page === n.id && !flow ? "page" : undefined}
              onClick={() => go(n.id)}
            >
              <n.icon size={21} />
              <span>{n.label}</span>
            </button>
          ))}
          <button className="bottom-log" onClick={logButton.run}>
            <span className="bottom-log-icon">
              <logButton.icon size={22} />
            </span>
            <span>
              {logButton.short}
              <span className="visually-hidden"> migraine</span>
            </span>
          </button>
          {pages.slice(2, 4).map((n) => (
            <button
              key={n.id}
              aria-current={page === n.id && !flow ? "page" : undefined}
              onClick={() => go(n.id)}
            >
              <n.icon size={21} />
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        {notice && (
          <div className="toast" role="status">
            <span>{notice}</span>
            <button
              className="icon-button"
              aria-label="Dismiss message"
              onClick={() => setNotice("")}
            >
              <X size={18} />
            </button>
          </div>
        )}
        {dose && (
          <DoseForm
            data={data}
            episodeId={dose.episodeId}
            close={() => setDose(null)}
            saved={saved}
            addMedication={() => {
              setDose(null);
              setAddingMedication(true);
              navigate("medications");
            }}
          />
        )}
      </div>
    </ConfirmProvider>
  );
}
