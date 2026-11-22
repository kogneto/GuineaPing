import { useEffect, useState, type FormEvent } from "react";
import { MARKS, MAX_NOTE_CHARS, type AlertItem, type Mark } from "../../shared/api";
import { MARK_LABELS, agesText, criteriaSections, locationsText, phaseText, sexText, statusText, type CriteriaSection } from "../../shared/plain";
import { ago, api } from "../api";
import { Illustration } from "../components/Illustration";
import { Link } from "../router";

export function AlertPage({ id }: { id: string }) {
  const [alert, setAlert] = useState<AlertItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<AlertItem>(`/api/alerts/${id}`).then((a) => {
      setAlert(a);
      if (!a.read) api(`/api/alerts/${id}/read`, "POST").catch(() => {});
    }, (e: Error) => setError(e.message));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!alert) return <p className="muted">Loading…</p>;
  const t = alert.trial;
  const facts: [string, string | null][] = [
    ["Status", statusText(t.status)],
    ["Phase", phaseText(t.phases)],
    ["Who can join", [agesText(t.minimumAge, t.maximumAge), sexText(t.eligibility?.sex ?? ""), t.eligibility?.healthyVolunteers ? "Healthy volunteers welcome" : null].filter(Boolean).join(" · ") || null],
    ["Where", locationsText(t.locations, 8)],
    ["Conditions", t.conditions.join(", ") || null],
    ["Run by", t.sponsor || null],
    ["First posted", t.firstPosted],
  ];

  return (
    <article className="narrow">
      <p className="crumb">
        <Link to="/">← Alerts</Link>
      </p>
      <div className="heading-row">
        {/* Celebrate only the first time this Alert is opened. */}
        {!alert.read && <Illustration name="match" size="xs" />}
        <h1 className="trial-heading">{t.title}</h1>
      </div>
      <p className="meta">{alert.sentBy ? `Sent to you by ${alert.sentBy}` : `Matched ${alert.watchNames.join(", ")}`}</p>
      {alert.update && (
        <div className="callout update">
          <div>
            <p>
              <strong>What changed</strong> <span className="muted small">{ago(alert.update.at)}</span>
            </p>
            <ul className="criteria">
              {alert.update.changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <dl className="facts-table">
        {facts
          .filter((f): f is [string, string] => !!f[1])
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
      {t.summary && (
        <>
          <h2>What the study says about itself</h2>
          <p className="summary">{t.summary}</p>
        </>
      )}
      {t.eligibility?.criteria && <WhoCanJoin text={t.eligibility.criteria} url={t.url} />}
      <p>
        <a className="button" href={t.url} target="_blank" rel="noreferrer">
          Open {t.nctId} on ClinicalTrials.gov
        </a>
      </p>
      <Sorting alert={alert} onChange={setAlert} />
      <div className="callout">
        <Illustration name="clinician" size="xs" />
        <p className="muted small">The study team decides who can join. Use the contacts on the listing to ask, and talk to your own doctor first if you have any health concerns.</p>
      </div>
    </article>
  );
}

const SECTION_TITLES: Record<CriteriaSection["kind"], string> = {
  include: "You may be able to join if",
  exclude: "You can't join if",
  other: "What the study asks for",
};
/** How many points of each list show before "Show all". */
const SHOWN = 6;

/** The study's own entry criteria, split into lists. Its wording is never changed. */
function WhoCanJoin({ text, url }: { text: string; url: string }) {
  const [open, setOpen] = useState(false);
  const sections = criteriaSections(text);
  if (!sections.length) return null;
  const hidden = sections.reduce((n, s) => n + Math.max(0, s.items.length - SHOWN), 0);
  return (
    <section>
      <h2>Who can join</h2>
      <p className="muted small">
        In the study's own words, from{" "}
        <a href={url} target="_blank" rel="noreferrer">
          its listing
        </a>
        . Only the study team can say whether you qualify.
      </p>
      {sections.map((s, i) => (
        <div key={i}>
          <h3>{SECTION_TITLES[s.kind]}</h3>
          <ul className="criteria">
            {(open ? s.items : s.items.slice(0, SHOWN)).map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
      {hidden > 0 && !open && (
        <button className="link" onClick={() => setOpen(true)}>
          Show all ({hidden} more)
        </button>
      )}
    </section>
  );
}

/** The Member's own sorting of this Alert, a private note, and sending it to another Member. */
function Sorting({ alert, onChange }: { alert: AlertItem; onChange: (a: AlertItem) => void }) {
  const [note, setNote] = useState(alert.note);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const run = async (work: () => Promise<string | void>) => {
    setBusy(true);
    setMessage(null);
    try {
      const text = await work();
      if (text) setMessage({ kind: "ok", text });
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const mark = (m: Mark) => run(async () => onChange(await api<AlertItem>(`/api/alerts/${alert.id}`, "PUT", { mark: alert.mark === m ? null : m })));
  const saveNote = () =>
    run(async () => {
      onChange(await api<AlertItem>(`/api/alerts/${alert.id}`, "PUT", { note }));
      return "Note saved.";
    });
  const send = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      await api(`/api/alerts/${alert.id}/send`, "POST", { email });
      const to = email.trim();
      setEmail("");
      return `Sent to ${to}.`;
    });
  };

  return (
    <section className="sorting">
      <h2>Keep track</h2>
      <p className="actions">
        {MARKS.map((m) => (
          <button key={m} className={alert.mark === m ? "" : "secondary"} aria-pressed={alert.mark === m} disabled={busy} onClick={() => mark(m)}>
            {MARK_LABELS[m]}
          </button>
        ))}
      </p>
      <label>
        Your note <span className="hint">Only you see this.</span>
        <textarea value={note} maxLength={MAX_NOTE_CHARS} rows={3} onChange={(e) => setNote(e.target.value)} />
      </label>
      {note !== alert.note && (
        <p className="actions">
          <button disabled={busy} onClick={saveNote}>
            Save note
          </button>
        </p>
      )}
      <form onSubmit={send}>
        <label>
          Send to another Member
          <input type="email" value={email} placeholder="their email address" autoComplete="off" onChange={(e) => setEmail(e.target.value)} />
        </label>
        {alert.viaPrivateWatch && <p className="muted small">This came from your Private watch. Sending shares the trial, not the Watch.</p>}
        <p className="actions">
          <button className="secondary" disabled={busy || !email.trim()}>
            Send
          </button>
        </p>
      </form>
      {message && (
        <p className={message.kind === "error" ? "error" : "muted"} role="status">
          {message.text}
        </p>
      )}
    </section>
  );
}
