import type { Trial } from "../../shared/api";
import { keyFacts, locationsText } from "../../shared/plain";
import { Illustration, type ArtName } from "./Illustration";

/** A Trial's title and plain-language key facts, as in Recent matches and the editor preview. */
export function TrialCard({ trial }: { trial: Trial }) {
  const where = locationsText(trial.locations);
  return (
    <article className="trial">
      <a href={trial.url} target="_blank" rel="noreferrer" className="trial-title">
        {trial.title}
      </a>
      <p className="facts">{keyFacts(trial).join(" · ")}</p>
      {where && <p className="where">{where}</p>}
      <p className="meta">
        First posted {trial.firstPosted} · {trial.nctId}
      </p>
    </article>
  );
}

export function TrialList({ trials, empty, art = "breakRoom" }: { trials: Trial[] | null; empty: string; art?: ArtName }) {
  if (!trials)
    return (
      <div className="empty compact">
        <Illustration name="reading" size="sm" />
        <p className="muted">Asking ClinicalTrials.gov…</p>
      </div>
    );
  if (!trials.length)
    return (
      <div className="empty compact">
        <Illustration name={art} size="sm" />
        <p className="muted">{empty}</p>
      </div>
    );
  return (
    <div className="stack">
      {trials.map((t) => (
        <TrialCard key={t.nctId} trial={t} />
      ))}
    </div>
  );
}
