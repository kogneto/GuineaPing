import { useEffect, useState } from "react";
import type { Trial, Watch } from "../../shared/api";
import { PHASE_LABELS, STATUS_LABELS } from "../../shared/plain";
import { api } from "../api";
import { Illustration } from "../components/Illustration";
import { TrialList } from "../components/TrialCard";
import { Link, navigate } from "../router";
import { FollowButton } from "./WatchesPage";

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
  const c = watch.criteria;
  const rows: [string, string][] = [
    ["Conditions", c.conditions.join(", ")],
    ["Keywords", c.terms.join(", ")],
    ["Where", c.near ? `Within ${c.near.miles} miles of ${c.near.zip}` : "Anywhere"],
    ["Who", [c.age !== null ? `Age ${c.age}` : "", c.sex === "FEMALE" ? "Female" : c.sex === "MALE" ? "Male" : ""].filter(Boolean).join(", ") || "Anyone"],
    ["Phases", c.phases.map((p) => PHASE_LABELS[p]).join(", ") || "Any"],
    ["Status", (c.statuses.length ? c.statuses : (Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[])).map((s) => STATUS_LABELS[s]).join(", ")],
  ];

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
      <dl className="facts-table">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
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
      <p className="muted small">Trials first posted in the last 30 days. These don't send Alerts; only trials found from now on do.</p>
      {recentError ? <p className="error">{recentError}</p> : <TrialList trials={recent} empty="Nothing posted in the last 30 days matches. Still watching for new ones." art="lookout" />}
    </>
  );
}
