import { useEffect, useState } from "react";
import type { CheckStatus, Me } from "../shared/api";
import { ago, api, type ApiError } from "./api";
import { Illustration } from "./components/Illustration";
import { AlertPage } from "./pages/AlertPage";
import { AlertsPage } from "./pages/AlertsPage";
import { ClinicsPage } from "./pages/ClinicsPage";
import { DevicesPage } from "./pages/DevicesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { WatchEditorPage } from "./pages/WatchEditorPage";
import { WatchesPage } from "./pages/WatchesPage";
import { WatchPage } from "./pages/WatchPage";
import { TabIcon } from "./components/TabIcon";
import { Link, usePath } from "./router";

function route(path: string, me: Me | null) {
  let m: RegExpExecArray | null;
  if ((m = /^\/alerts\/([\w-]+)$/.exec(path))) return <AlertPage id={m[1]!} />;
  // The app opens on Openings: they change every hour, and are what most Members come for.
  if (path === "/" || path === "/clinics") return <ClinicsPage />;
  if (path === "/devices") return <DevicesPage />;
  // "/members" is where the group list used to live; old links and Home Screen shortcuts still land somewhere.
  if (path === "/settings" || path === "/members") return <SettingsPage me={me} />;
  if (path === "/profile") return <ProfilePage />;
  if (path === "/watches") return <WatchesPage />;
  if (path === "/watches/new") return <WatchEditorPage />;
  if ((m = /^\/watches\/([\w-]+)\/edit$/.exec(path))) return <WatchEditorPage id={m[1]!} />;
  if ((m = /^\/watches\/([\w-]+)$/.exec(path))) return <WatchPage id={m[1]!} />;
  if (path === "/alerts") return <AlertsPage />;
  return <NotFound />;
}

function NotFound() {
  return (
    <div className="empty">
      <Illustration name="lost" />
      <p className="empty-title">There's no page here</p>
      <p className="muted">
        The link may be old or mistyped. <Link to="/">Go to Openings</Link>.
      </p>
    </div>
  );
}

const isLocal = location.hostname === "localhost";

export function App() {
  const path = usePath();
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<CheckStatus | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [removed, setRemoved] = useState<string | null>(null);

  useEffect(() => {
    api<Me>("/api/me").then(setMe, (e: ApiError) => (e.status === 403 ? setRemoved(e.message) : setSignedOut(true)));
    api<CheckStatus>("/api/status").then(setStatus, () => {});
  }, []);

  if (removed) {
    return (
      <main className="page narrow">
        <div className="empty">
          <Illustration name="goodbye" />
          <h1>GuineaPing</h1>
          <p>{removed}</p>
        </div>
      </main>
    );
  }
  if (signedOut) {
    return (
      <main className="page narrow">
        <div className="empty">
          <Illustration name="welcome" />
          <h1>GuineaPing</h1>
          <p>You're not signed in. Reload the page to sign in with your email address.</p>
        </div>
      </main>
    );
  }

  const section =
    path === "/" || path === "/clinics"
      ? "clinics"
      : path.startsWith("/alerts")
        ? "alerts"
        : path.startsWith("/watches")
          ? "watches"
          : ["/settings", "/members", "/devices", "/profile"].includes(path)
            ? "settings"
            : null;
  return (
    <>
      <header className="top">
        <Link to="/" className="brand">
          GuineaPing
        </Link>
        <nav>
          <Link to="/" className={section === "clinics" ? "active" : ""}>
            <TabIcon name="clinics" />
            Openings
          </Link>
          <Link to="/alerts" className={section === "alerts" ? "active" : ""}>
            <TabIcon name="alerts" />
            Alerts
          </Link>
          <Link to="/watches" className={section === "watches" ? "active" : ""}>
            <TabIcon name="watches" />
            Watches
          </Link>
          <Link to="/settings" className={section === "settings" ? "active" : ""}>
            <TabIcon name="settings" />
            Settings
          </Link>
        </nav>
        {me && (
          <Link to="/settings" className={section === "settings" ? "who active" : "who"} aria-label="Settings">
            <span className="who-initial" aria-hidden="true">
              {me.email.slice(0, 1).toUpperCase()}
            </span>
            <span className="who-email">{me.email}</span>
          </Link>
        )}
      </header>
      {status?.stale && (
        <div className="banner" role="status">
          <Illustration name="errorPhone" size="xs" />
          {status.lastCheckedAt
            ? `ClinicalTrials.gov was last checked ${ago(status.lastCheckedAt)}. New trials will appear once checks work again.`
            : "Checks of ClinicalTrials.gov are failing. New trials will appear once they work again."}
        </div>
      )}
      <main className="page">{route(path, me)}</main>
      <footer className="foot">
        {status?.lastCheckedAt ? `Last checked ${ago(status.lastCheckedAt)}` : "Not checked yet"}
        {isLocal && <DevCheckButton onDone={setStatus} />}
      </footer>
    </>
  );
}

/** Local development only: the Worker refuses this route anywhere but localhost. */
function DevCheckButton({ onDone }: { onDone: (s: CheckStatus) => void }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await api<{ ok: boolean; alertsCreated: number; error?: string }>("/api/dev/check", "POST");
      alert(r.ok ? `Check done: ${r.alertsCreated} new Alert(s). Reload to see them.` : `Check failed: ${r.error}`);
      onDone(await api<CheckStatus>("/api/status"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className="link" onClick={run} disabled={busy}>
      {busy ? "Checking…" : "Run a Check now (dev)"}
    </button>
  );
}
