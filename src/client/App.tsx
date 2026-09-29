import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  CalendarDays,
  ChevronRight,
  Home as HomeIcon,
  Leaf,
  Pill,
  Settings as SettingsIcon,
  TrendingUp,
  WifiOff,
} from "lucide-react";
import type { Episode } from "../shared/validation";
import { api, setCsrf, type Data } from "./api";
import { Entry, DailyEntry } from "./Entry";
import { DoseForm, Medications } from "./Medications";
import { History } from "./History";
import { Trends } from "./Trends";
import { SettingsPage } from "./Settings";
import { ErrorMessage, useAction } from "./ui";
import { Login, type AuthStatus } from "./Login";
import { Home } from "./Home";
export type Page = "home" | "history" | "trends" | "medications" | "settings";
const navigation = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "history", label: "History", icon: CalendarDays },
  { id: "trends", label: "Trends", icon: TrendingUp },
  { id: "medications", label: "Medications", icon: Pill },
  { id: "settings", label: "Settings", icon: SettingsIcon },
] as const;
/** Coordinate session state, journal refreshes, navigation and global display preferences. */
export default function App() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [session, setSession] = useState<{ username: string } | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page>(() =>
    navigation.some((n) => n.id === location.hash.slice(1))
      ? (location.hash.slice(1) as Page)
      : "home",
  );
  const [entry, setEntry] = useState<Episode | "new" | null>(null);
  const [dose, setDose] = useState<{ episodeId?: string } | null>(null);
  const [daily, setDaily] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [notice, setNotice] = useState("");
  const action = useAction();
  const [, tick] = useState(0);
  const refresh = useCallback(async () => {
    setData(await api<Data>("/data"));
  }, []);
  const bootstrap = useCallback(async () => {
    setLoading(true);
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
    void bootstrap().catch((e) => setNotice(e.message));
    const update = () => setOffline(!navigator.onLine);
    const hash = () => {
      const value = location.hash.slice(1);
      if (navigation.some((n) => n.id === value)) setPage(value as Page);
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("hashchange", hash);
    const timer = setInterval(() => tick((v) => v + 1), 60000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("hashchange", hash);
    };
  }, [bootstrap]);
  useEffect(() => {
    if (!data) return;
    document.documentElement.dataset.theme = data.settings.theme;
    document.documentElement.dataset.stimulation = data.settings.lowStimulation
      ? "low"
      : "normal";
  }, [data]);
  const navigate = (page: Page) => {
    setPage(page);
    location.hash = page;
    window.scrollTo({ top: 0 });
  };
  const saved = async () => {
    await refresh();
    setNotice("Saved to your journal.");
  };
  const logout = () =>
    void action.run(async () => {
      await api("/auth/logout", "POST", {});
      setData(null);
      setSession(null);
      setCsrf("");
      setNotice("");
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
          onClick={() => void bootstrap().catch((e) => setNotice(e.message))}
        >
          Try again
        </button>
        <ErrorMessage error={notice} />
      </main>
    );
  if (!session) return <Login status={status} signedIn={bootstrap} />;
  if (!data)
    return (
      <main className="offline-screen">
        <h1>Unable to load your journal</h1>
        <p>{notice}</p>
        <button className="button primary" onClick={() => void bootstrap()}>
          Retry
        </button>
      </main>
    );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <a className="brand" href="#home" onClick={() => navigate("home")}>
          <span className="brand-icon">
            <Activity size={23} />
          </span>
          <span>{status.appName}</span>
        </a>
        <div className="sidebar-label">YOUR SPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map((n) => (
            <button
              key={n.id}
              aria-current={page === n.id ? "page" : undefined}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={20} />
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Leaf size={21} />
            <p>One day at a time.</p>
            <small>A little more understanding.</small>
          </div>
          <button
            className="account-button"
            onClick={() => navigate("settings")}
          >
            <span className="avatar">
              {session.username.charAt(0).toUpperCase()}
            </span>
            <span>
              My journal<small>Personal account</small>
            </span>
            <ChevronRight size={16} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="breadcrumb">
            My journal <ChevronRight size={13} />{" "}
            {navigation.find((n) => n.id === page)?.label}
          </span>
          <span className="mobile-brand">
            <Activity size={22} />
            {status.appName}
          </span>
          <button
            className="comfort-toggle"
            aria-label="Low stimulation"
            aria-pressed={data.settings.lowStimulation}
            onClick={() =>
              void action.run(async () => {
                await api("/settings", "PUT", {
                  ...data.settings,
                  lowStimulation: !data.settings.lowStimulation,
                });
                await refresh();
              })
            }
          >
            <Leaf size={16} />
            <span>Low stimulation</span>
          </button>
        </header>
        <main id="main-content" tabIndex={-1}>
          {offline && (
            <div className="offline-banner" role="status">
              <WifiOff size={18} />
              Offline. Reconnect to load or save changes.
            </div>
          )}
          {notice && (
            <div className="toast" role="status">
              {notice}
              <button
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                ×
              </button>
            </div>
          )}
          <ErrorMessage error={action.error} />
          {page === "home" && (
            <Home
              data={data}
              navigate={navigate}
              log={() => setEntry("new")}
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
              edit={setEntry}
              end={(e) =>
                void action.run(async () => {
                  await api(`/episodes/${e.id}/end`, "POST", {});
                  await saved();
                })
              }
              takeDose={(episodeId) => setDose({ episodeId })}
              checkIn={() => setDaily(true)}
              busy={action.busy || offline}
              saved={saved}
            />
          )}{" "}
          {page === "history" && <History data={data} edit={setEntry} />}{" "}
          {page === "trends" && <Trends data={data} />}{" "}
          {page === "medications" && (
            <Medications
              data={data}
              saved={saved}
              takeDose={() => setDose({})}
            />
          )}{" "}
          {page === "settings" && (
            <SettingsPage
              data={data}
              saved={saved}
              logout={logout}
              username={session.username}
              auth={status}
            />
          )}
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {navigation.map((n) => (
          <button
            key={n.id}
            aria-current={page === n.id ? "page" : undefined}
            onClick={() => navigate(n.id)}
          >
            <n.icon size={21} />
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
      {entry && (
        <Entry
          episode={entry === "new" ? undefined : entry}
          data={data}
          close={() => setEntry(null)}
          saved={saved}
          takeDose={(episodeId) => setDose({ episodeId })}
        />
      )}{" "}
      {dose && (
        <DoseForm
          data={data}
          episodeId={dose.episodeId}
          close={() => setDose(null)}
          saved={saved}
        />
      )}{" "}
      {daily && (
        <DailyEntry data={data} close={() => setDaily(false)} saved={saved} />
      )}
    </div>
  );
}
