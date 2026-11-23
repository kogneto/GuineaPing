import { useEffect, useState } from "react";
import type { Trial, Watch } from "../../shared/api";
import { criteriaRows } from "../../shared/criteria";
import { api } from "../api";
import { Illustration } from "../components/Illustration";
import { TrialList } from "../components/TrialCard";
import { Link, navigate } from "../router";
import { FollowButton } from "./WatchesPage";

/** What a Watch sends Alerts for, which depends on whether it could record every Trial it matches. */
const ALERTS_ON = {
  all: "This Watch alerts on any trial that starts to match from now on, including one posted long ago that changes, such as adding a site or reopening.",
  recent: "This Watch matches more than 1,000 trials, so it alerts only on newly posted ones. An older trial that changes and starts to match is missed; narrow the Watch to catch those.",
  unknown: "It alerts on newly posted trials. At the next hourly check GuineaPing works out whether it can also catch older trials that change.",
};

export function WatchPage({ id }: { id: string }) {
  const [watch, setWatch] = useState<Watch | null>(null);
  const [recent, setRecent] = useState<Trial[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentError, setRecentError] = useState<string | null>(null);

  useEffect(() => {
    api<Watch>(`/api/watches/${id}`).then(setWatch, (e: Error) => setError(e.message));
    api<Trial[]>(`/api/watches/${id}/recent`).then(setRecent, (e: Error) => setRecentError(e.message));
  }, [id]);

  const remove = async () => {
    if (!watch || !confirm(`Delete “${watch.name}”? Anyone following it will stop getting Alerts for it.`)) return;
    await api(`/api/watches/${id}`, "DELETE");
    navigate("/watches");
  };

  if (error) return <p className="error">{error}</p>;
  if (!watch) return <p className="muted">Loading…</p>;
  const rows = criteriaRows(watch.criteria);

  return (
    <>
      <p className="crumb">
        <Link to="/watches">← Watches</Link>
      </p>
      <div className="title-row">
        <h1>
          {watch.name} {watch.private && <span className="tag">Private</span>}
        </h1>
        <FollowButton watch={watch} onChange={setWatch} />
      </div>
      {watch.private && (
        <div className="callout">
          <Illustration name="private" size="xs" />
          <p className="muted small">This is a Private watch. Only you can see or follow it.</p>
        </div>
      )}
      {watch.failing && (
        <p className="error">
          GuineaPing hasn't been able to check this Watch for over a day. It keeps trying every hour and will catch up on anything it missed.
          {watch.isOwner && " If this goes on, try editing its conditions or keywords."}
        </p>
      )}
      <dl className="facts-table">
        {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
      {watch.isOwner && (
        <p className="actions">
          <Link to={`/watches/${id}/edit`} className="button secondary">
            Edit
          </Link>
          <button className="danger" onClick={remove}>
            Delete
          </button>
        </p>
      )}
      <h2>Recent matches</h2>
      <p className="muted small">Trials first posted in the last 30 days. These don't send Alerts. {ALERTS_ON[watch.knows ?? "unknown"]}</p>
      {recentError ? <p className="error">{recentError}</p> : <TrialList trials={recent} empty="Nothing posted in the last 30 days matches. Still watching for new ones." art="lookout" />}
    </>
  );
}
