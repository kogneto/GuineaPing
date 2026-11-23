import { useEffect, useState } from "react";
import type { Watch } from "../../shared/api";
import { criteriaLine } from "../../shared/criteria";
import { api } from "../api";
import { Illustration } from "../components/Illustration";
import { Link } from "../router";

export function FollowButton({ watch, onChange }: { watch: Watch; onChange: (w: Watch) => void }) {
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      onChange(await api<Watch>(`/api/watches/${watch.id}/follow`, watch.following ? "DELETE" : "POST"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className={watch.following ? "secondary" : ""} onClick={toggle} disabled={busy} aria-pressed={watch.following}>
      {watch.following ? "Following" : "Follow"}
    </button>
  );
}

export function WatchesPage() {
  const [watches, setWatches] = useState<Watch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Watch[]>("/api/watches").then(setWatches, (e: Error) => setError(e.message));
  }, []);

  const replace = (w: Watch) => setWatches((list) => list?.map((x) => (x.id === w.id ? w : x)) ?? null);

  if (error) return <p className="error">{error}</p>;
  if (!watches) return <p className="muted">Loading…</p>;
  return (
    <>
      <div className="title-row">
        <h1>Watches</h1>
        <Link to="/watches/new" className="button">
          New Watch
        </Link>
      </div>
      <p className="muted">Follow the Watches you care about. You'll get an Alert when one finds a new trial.</p>
      {!watches.length && (
        <div className="empty">
          <Illustration name="bloodDraw" />
          <p className="empty-title">No Watches yet</p>
          <p className="muted">
            <Link to="/watches/new">Create the first one</Link> to start hearing about new trials.
          </p>
        </div>
      )}
      <ul className="watches">
        {watches.map((w) => (
          <li key={w.id}>
            <div>
              <Link to={`/watches/${w.id}`} className="watch-name">
                {w.name}
              </Link>
              {w.private && <span className="tag">Private</span>}
              {w.isOwner && <span className="tag">Yours</span>}
              {w.failing && <span className="tag">Not checked lately</span>}
              <div className="muted small">{criteriaLine(w.criteria)}</div>
            </div>
            <FollowButton watch={w} onChange={replace} />
          </li>
        ))}
      </ul>
    </>
  );
}
