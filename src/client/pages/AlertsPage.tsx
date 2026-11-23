import { useEffect, useState } from "react";
import type { AlertListItem, Mark } from "../../shared/api";
import { MARK_LABELS, byNearest, keyFacts } from "../../shared/plain";
import { ago, api } from "../api";
import { Greeting } from "../components/Greeting";
import { Illustration } from "../components/Illustration";
import { SortToggle } from "../components/TrialCard";
import { Link } from "../router";

/** The Alert list: every Alert and note, newest first. */
export function AlertsPage() {
  const [items, setItems] = useState<AlertListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "all" leaves out what the Member marked "Not for me"; that has its own view.
  const [view, setView] = useState<"all" | Mark>("all");
  const [nearestFirst, setNearestFirst] = useState(false);

  useEffect(() => {
    api<AlertListItem[]>("/api/alerts").then(setItems, (e: Error) => setError(e.message));
  }, []);

  const dismiss = async (id: string) => {
    await api(`/api/notes/${id}/read`, "POST");
    setItems((list) => list?.map((i) => (i.kind === "note" && i.id === id ? { ...i, read: true } : i)) ?? null);
  };

  if (error) return <p className="error">{error}</p>;
  if (!items) return <p className="muted">Loading…</p>;

  const counts = { interested: 0, not_for_me: 0 };
  for (const i of items) if (i.kind === "alert" && i.mark) counts[i.mark]++;
  const inView = items.filter((i) => (view === "all" ? i.kind === "note" || i.mark !== "not_for_me" : i.kind === "alert" && i.mark === view));
  const measured = inView.some((i) => i.kind === "alert" && i.trial.nearest);
  // Nearest first is about Trials, so notes step aside while it is on.
  const shown = nearestFirst && measured ? inView.filter((i) => i.kind === "alert").sort((a, b) => (a.kind === "alert" && b.kind === "alert" ? byNearest(a.trial, b.trial) : 0)) : inView;
  const unread = items.filter((i) => !i.read && (i.kind === "note" || i.mark !== "not_for_me")).length;
  return (
    <>
      {items.length > 0 ? (
        <Greeting
          art={unread > 0 ? "alertExclaim" : "alertBell"}
          title={unread > 0 ? `${unread} new ${unread === 1 ? "Alert" : "Alerts"}` : "No new Alerts"}
          sub={unread > 0 ? "Trials your Watches found, newest first." : "You've seen everything your Watches found."}
        />
      ) : (
        <h1>Alerts</h1>
      )}
      {!items.length && (
        <div className="empty">
          <Illustration name="alertBell" />
          <p className="empty-title">No Alerts yet</p>
          <p className="muted">
            When a new trial matches a Watch you follow, it shows up here. <Link to="/watches">Follow or create a Watch</Link> to get started.
          </p>
        </div>
      )}
      {(counts.interested > 0 || counts.not_for_me > 0) && (
        <p className="views">
          {(["all", "interested", "not_for_me"] as const).map((v) => (
            <button key={v} className="chip" aria-pressed={view === v} onClick={() => setView(v)}>
              {v === "all" ? "All" : `${MARK_LABELS[v]} (${counts[v]})`}
            </button>
          ))}
        </p>
      )}
      {measured && inView.length > 1 && <SortToggle nearestFirst={nearestFirst} onChange={setNearestFirst} />}
      {items.length > 0 && !shown.length && <p className="muted">Nothing here.</p>}
      <ul className="alerts">
        {shown.map((item) =>
          item.kind === "note" ? (
            <li key={item.id} className={`note ${item.read ? "read" : ""}`}>
              <Illustration name="goodbye" size="xs" />
              <span className="note-text">{item.message}</span>
              {!item.read && (
                <button className="link" onClick={() => dismiss(item.id)}>
                  OK
                </button>
              )}
            </li>
          ) : (
            <li key={item.id} className={item.read ? "read" : "unread"}>
              <Link to={`/alerts/${item.id}`} className="alert-link">
                <span className="alert-title">
                  {item.trial.title}
                  {item.mark === "interested" && <span className="tag">Interested</span>}
                </span>
                <span className="facts">{keyFacts(item.trial).join(" · ")}</span>
                <span className="meta">
                  {item.update
                    ? `Updated ${ago(item.update.at)}: ${item.update.changes.join(" · ")}`
                    : `${[item.sentBy ? `Sent by ${item.sentBy}` : "", item.watchNames.join(", ")].filter(Boolean).join(" · ")} · ${ago(item.createdAt)}`}
                </span>
              </Link>
            </li>
          ),
        )}
      </ul>
    </>
  );
}
