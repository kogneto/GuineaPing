import { useState } from "react";
import type { Trial } from "../../shared/api";
import { clinicById, clinicLabel } from "../../shared/clinics";
import { byNearest, keyFacts, locationsText } from "../../shared/plain";
import { Illustration, type ArtName } from "./Illustration";

/**
 * The Clinics this Trial's listing names, each with a link to the Clinic's own list of studies.
 * ClinicalTrials.gov doesn't say what a study pays or when it runs; the Clinic's list may.
 */
export function TrialClinics({ trial }: { trial: Trial }) {
  const clinics = (trial.clinics ?? []).map(clinicById).filter((c) => !!c);
  if (!clinics.length) return null;
  return (
    <p className="where">
      At{" "}
      {clinics.map((c, i) => (
        <span key={c.id}>
          {i > 0 && "; "}
          {clinicLabel(c)}
          {c.url && (
            <>
              {" "}
              (
              <a href={c.url} target="_blank" rel="noreferrer">
                its own list
              </a>
              )
            </>
          )}
        </span>
      ))}
      . The Clinic's list may give pay and dates, under its own name for the study.
    </p>
  );
}

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
      <TrialClinics trial={trial} />
      <p className="meta">
        First posted {trial.firstPosted} · {trial.nctId}
      </p>
    </article>
  );
}

export function TrialList({ trials, empty, art = "breakRoom" }: { trials: Trial[] | null; empty: string; art?: ArtName }) {
  const [nearestFirst, setNearestFirst] = useState(false);
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
  // Sorting by distance is offered only when there are distances to sort by.
  const measured = trials.some((t) => t.nearest);
  const shown = nearestFirst && measured ? [...trials].sort(byNearest) : trials;
  return (
    <div className="stack">
      {measured && trials.length > 1 && <SortToggle nearestFirst={nearestFirst} onChange={setNearestFirst} />}
      {shown.map((t) => (
        <TrialCard key={t.nctId} trial={t} />
      ))}
    </div>
  );
}

/** "Newest" or "Nearest": the two orders a list of Trials can be shown in. */
export function SortToggle({ nearestFirst, onChange }: { nearestFirst: boolean; onChange: (nearest: boolean) => void }) {
  return (
    <p className="views">
      <button type="button" className="chip" aria-pressed={!nearestFirst} onClick={() => onChange(false)}>
        Newest first
      </button>
      <button type="button" className="chip" aria-pressed={nearestFirst} onClick={() => onChange(true)}>
        Nearest first
      </button>
    </p>
  );
}
