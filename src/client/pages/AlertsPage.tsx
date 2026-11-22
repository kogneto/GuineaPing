import { useEffect, useState } from "react";
import type { AlertListItem } from "../../shared/api";
import { keyFacts } from "../../shared/plain";
import { ago, api } from "../api";
import { Illustration } from "../components/Illustration";
import { Link } from "../router";

/** The Alert list: every Alert and note, newest first. */
export function AlertsPage() {
  const [items, setItems] = useState<AlertListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<AlertListItem[]>("/api/alerts").then(setItems, (e: Error) => setError(e.message));
  }, []);

  const dismiss = async (id: string) => {
    await api(`/api/notes/${id}/read`, "POST");
    setItems((list) => list?.map((i) => (i.kind === "note" && i.id === id ? { ...i, read: true } : i)) ?? null);
  };

  if (error) return <p className="error">{error}</p>;
  if (!items) return <p className="muted">Loading…</p>;

  const unread = items.filter((i) => !i.read).length;
  return (
    <>
      <div className="heading-row">
        {unread > 0 && <Illustration name="alertExclaim" size="xs" />}
        <h1>Alerts {unread > 0 && <span className="count">{unread} new</span>}</h1>
      </div>
      {!items.length && (
        <div className="empty">
          <Illustration name="alertBell" />
          <p className="empty-title">No Alerts yet</p>
          <p className="muted">
            When a new trial matches a Watch you follow, it shows up here. <Link to="/watches">Follow or create a Watch</Link> to get started.
          </p>
        </div>
      )}
      <ul className="alerts">
        {items.map((item) =>
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
                <span className="alert-title">{item.trial.title}</span>
                <span className="facts">{keyFacts(item.trial).join(" · ")}</span>
                <span className="meta">
                  {item.watchNames.join(", ")} · {ago(item.createdAt)}
                </span>
              </Link>
            </li>
          ),
        )}
      </ul>
    </>
  );
}
