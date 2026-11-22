import { useEffect, useState } from "react";
import type { CheckStatus, Me } from "../shared/api";
import { ago, api } from "./api";
import { Illustration } from "./components/Illustration";
import { AlertPage } from "./pages/AlertPage";
import { AlertsPage } from "./pages/AlertsPage";
import { WatchEditorPage } from "./pages/WatchEditorPage";
import { WatchesPage } from "./pages/WatchesPage";
import { WatchPage } from "./pages/WatchPage";
import { Link, usePath } from "./router";

function route(path: string) {
  let m: RegExpExecArray | null;
  if ((m = /^\/alerts\/([\w-]+)$/.exec(path))) return <AlertPage id={m[1]!} />;
  if (path === "/watches") return <WatchesPage />;
  if (path === "/watches/new") return <WatchEditorPage />;
  if ((m = /^\/watches\/([\w-]+)\/edit$/.exec(path))) return <WatchEditorPage id={m[1]!} />;
  if ((m = /^\/watches\/([\w-]+)$/.exec(path))) return <WatchPage id={m[1]!} />;
  if (path === "/" || path === "/alerts") return <AlertsPage />;
  return <NotFound />;
}

function NotFound() {
  return (
    <div className="empty">
      <Illustration name="lost" />
      <p className="empty-title">There's no page here</p>
      <p className="muted">
        The link may be old or mistyped. <Link to="/">Go to your Alerts</Link>.
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

  useEffect(() => {
    api<Me>("/api/me").then(setMe, () => setSignedOut(true));
    api<CheckStatus>("/api/status").then(setStatus, () => {});
  }, []);

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

  const section = path.startsWith("/watches") ? "watches" : "alerts";
  return (
    <>
      <header className="top">
        <Link to="/" className="brand">
          GuineaPing
        </Link>
        <nav>
          <Link to="/" className={section === "alerts" ? "active" : ""}>
            Alerts
          </Link>
          <Link to="/watches" className={section === "watches" ? "active" : ""}>
            Watches
          </Link>
        </nav>
        {me && <span className="who">{me.email}</span>}
      </header>
      {status?.stale && (
        <div className="banner" role="status">
          <Illustration name="errorPhone" size="xs" />
          {status.lastCheckedAt
            ? `ClinicalTrials.gov was last checked ${ago(status.lastCheckedAt)}. New trials will appear once checks work again.`
            : "Checks of ClinicalTrials.gov are failing. New trials will appear once they work again."}
        </div>
      )}
      <main className="page">{route(path)}</main>
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
