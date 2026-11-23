import { useEffect, useState, type FormEvent } from "react";
import { DEFAULT_WAIT_DAYS, MAX_LABEL_CHARS, MAX_WAIT_DAYS, daysUntil, freeOn, isDay, type PastStudy } from "../../shared/waiting";
import { api } from "../api";
import { Link } from "../router";

/** Today where the Member is, as a plain day. */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** A plain day as a person reads it: "10 December 2026". */
const sayDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

/** The latest day any of these keeps the Member waiting until; null when none does. */
const waitingUntil = (studies: PastStudy[], now: string) => studies.map((s) => s.freeOn).filter((day) => day > now).sort().pop() ?? null;

const CAVEAT = "This is your own reminder, worked out from the dates you gave. Each study sets its own rule, and some ask for longer, so ask the clinic before you book a screening.";

/** One line for other pages: whether the Member is in a waiting period. Shows nothing when they aren't. */
export function WaitingLine() {
  const [studies, setStudies] = useState<PastStudy[]>([]);
  useEffect(() => {
    api<PastStudy[]>("/api/past-studies").then(setStudies, () => {});
  }, []);
  const until = waitingUntil(studies, today());
  if (!until) return null;
  return (
    <p className="callout">
      <span>
        By your own dates, your waiting period runs until <strong>{sayDay(until)}</strong>. <Link to="/profile">See your past studies</Link>
      </span>
    </p>
  );
}

/** The Member's Past studies and the waiting period each one leaves. Only they see them. */
export function WaitingPeriods() {
  const [studies, setStudies] = useState<PastStudy[] | null>(null);
  const [label, setLabel] = useState("");
  const [endedOn, setEndedOn] = useState("");
  const [lastDoseOn, setLastDoseOn] = useState("");
  const [waitDays, setWaitDays] = useState(String(DEFAULT_WAIT_DAYS));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => api<PastStudy[]>("/api/past-studies").then(setStudies, (e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api<PastStudy>("/api/past-studies", "POST", { label, endedOn, lastDoseOn: lastDoseOn || null, waitDays: waitDays.trim() });
      setLabel("");
      setEndedOn("");
      setLastDoseOn("");
      setWaitDays(String(DEFAULT_WAIT_DAYS));
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (study: PastStudy) => {
    if (!confirm("Remove this past study? Its waiting period goes with it.")) return;
    await api(`/api/past-studies/${study.id}`, "DELETE").catch((e: Error) => setError(e.message));
    await load();
  };

  const now = today();
  const until = studies ? waitingUntil(studies, now) : null;
  const days = /^\d{1,3}$/.test(waitDays.trim()) ? Number(waitDays.trim()) : null;
  const wouldBeFree = isDay(endedOn) && (!lastDoseOn || isDay(lastDoseOn)) && days !== null ? freeOn(endedOn, lastDoseOn || null, days) : null;

  return (
    <section>
      <h2>Your waiting period</h2>
      <p className="muted">
        Clinics ask you to wait between studies, often 30 days (they call it a washout). Write down a study you've done and GuineaPing works out when the wait ends. Only you see this.
      </p>
      {studies && studies.length > 0 && (
        <p className="callout">
          <span>
            {until ? (
              <>
                By your own dates you are waiting until <strong>{sayDay(until)}</strong>, {daysUntil(until, now) === 1 ? "1 more day" : `${daysUntil(until, now)} more days`}.
              </>
            ) : (
              <>By your own dates, no waiting period is running.</>
            )}{" "}
            {CAVEAT}
          </span>
        </p>
      )}
      {studies && studies.length > 0 && (
        <div className="stack">
          {studies.map((s) => (
            <article className="trial" key={s.id}>
              <div className="title-row">
                <strong>{s.label || "A study"}</strong>
                <button type="button" className="link" onClick={() => remove(s)}>
                  Remove
                </button>
              </div>
              <p className="facts">
                Ended {sayDay(s.endedOn)}
                {s.lastDoseOn && ` · Last dose ${sayDay(s.lastDoseOn)}`} · Wait {s.waitDays} days
              </p>
              <p className="where">{s.freeOn > now ? `Waiting until ${sayDay(s.freeOn)}` : `Wait over since ${sayDay(s.freeOn)}`}</p>
            </article>
          ))}
        </div>
      )}
      <form className="form" onSubmit={add}>
        <h3>Add a study you've done</h3>
        <label>
          What you call it <span className="muted">(optional)</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={MAX_LABEL_CHARS} placeholder="Celerion, October" />
        </label>
        <div className="inline-fields">
          <label>
            Day the study ended
            <input type="date" value={endedOn} onChange={(e) => setEndedOn(e.target.value)} required />
          </label>
          <label>
            Day of your last dose <span className="muted">(optional)</span>
            <input type="date" value={lastDoseOn} onChange={(e) => setLastDoseOn(e.target.value)} />
          </label>
          <label>
            Days to wait
            <input value={waitDays} onChange={(e) => setWaitDays(e.target.value)} inputMode="numeric" maxLength={3} className="short" />
          </label>
        </div>
        <span className="hint">
          The study ended on your last visit or check-out. Clinics count from that day; a study's own rules often count from your last dose. GuineaPing uses whichever is later. Change the {DEFAULT_WAIT_DAYS} days if your clinic or the next study says another number (up to {MAX_WAIT_DAYS}).
        </span>
        {wouldBeFree && <p className="muted">That wait would end on {sayDay(wouldBeFree)}.</p>}
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Add"}
        </button>
      </form>
    </section>
  );
}
