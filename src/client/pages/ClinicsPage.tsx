import { useEffect, useState } from "react";
import type { ClinicItem, Opening } from "../../shared/api";
import { ago, api } from "../api";
import { Illustration } from "../components/Illustration";
import { Link } from "../router";

/** An Opening is new for a week after GuineaPing first sees it. */
const NEW_DAYS = 7;
const isNew = (o: Opening) => Date.now() - Date.parse(o.firstSeen) < NEW_DAYS * 24 * 60 * 60 * 1000;

/** One Opening, in the Clinic's own words, linking to its page on the Clinic's site. */
function OpeningCard({ opening }: { opening: Opening }) {
  const facts = [opening.pay, opening.when, opening.stay].filter(Boolean);
  return (
    <article className="trial">
      <a href={opening.url} target="_blank" rel="noreferrer" className="trial-title">
        {opening.title}
      </a>
      {isNew(opening) && <span className="tag">New</span>}
      {facts.length > 0 && <p className="facts">{facts.join(" · ")}</p>}
      {opening.who && <p className="where">{opening.who}</p>}
      <p className="meta">
        First seen {opening.firstSeen}
        {opening.code && ` · ${opening.code}`}
      </p>
    </article>
  );
}

function ClinicSection({ clinic }: { clinic: ClinicItem }) {
  const status = !clinic.read
    ? "GuineaPing doesn't read this Clinic's site. Open its list to see what it has."
    : clinic.refused
      ? "This Clinic's site has stopped letting GuineaPing read it. Open its list to see what it has."
      : clinic.lastReadAt
        ? `Read ${ago(clinic.lastReadAt)}`
        : "Not read yet";
  return (
    <section className="clinic">
      <div className="title-row">
        <h2>
          {clinic.name} <span className="muted">· {clinic.place}</span>
          {clinic.miles !== null && <span className="tag">{clinic.miles} miles</span>}
        </h2>
        <span className="actions">
          <Link to={`/watches/new?clinic=${clinic.id}`} className="button secondary">
            Watch for Trials
          </Link>
          <a href={clinic.url} target="_blank" rel="noreferrer" className="button secondary">
            Open its list
          </a>
        </span>
      </div>
      <p className="muted small">{status}</p>
      {clinic.openings.length > 0 && (
        <div className="stack">
          {clinic.openings.map((o) => (
            <OpeningCard key={o.id} opening={o} />
          ))}
        </div>
      )}
      {clinic.read && !clinic.refused && clinic.lastReadAt && !clinic.openings.length && <p className="muted small">Nothing on its list right now.</p>}
    </section>
  );
}

export function ClinicsPage() {
  const [clinics, setClinics] = useState<ClinicItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyOpenings, setOnlyOpenings] = useState(false);

  useEffect(() => {
    api<ClinicItem[]>("/api/clinics").then(setClinics, (e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!clinics)
    return (
      <div className="empty compact">
        <Illustration name="reading" size="sm" />
        <p className="muted">Loading…</p>
      </div>
    );
  const measured = clinics.some((c) => c.miles !== null);
  const shown = onlyOpenings ? clinics.filter((c) => c.openings.length) : clinics;
  return (
    <>
      <h1>Clinics</h1>
      <p className="muted">
        Research clinics that pay healthy volunteers, {measured ? "nearest first" : "in name order"}. What each one says about pay, dates and stays is in its own words; follow the link for the details.
        {!measured && (
          <>
            {" "}
            <Link to="/profile">Add your ZIP code</Link> to see the nearest first.
          </>
        )}
      </p>
      <p className="views">
        <button type="button" className="chip" aria-pressed={!onlyOpenings} onClick={() => setOnlyOpenings(false)}>
          All Clinics
        </button>
        <button type="button" className="chip" aria-pressed={onlyOpenings} onClick={() => setOnlyOpenings(true)}>
          With Openings
        </button>
      </p>
      {shown.map((c) => (
        <ClinicSection key={c.id} clinic={c} />
      ))}
      {!shown.length && <p className="muted">No Clinic's list has been read yet.</p>}
      <p className="muted small">
        "Watch for Trials" starts a Watch that sends an Alert when a new Trial on ClinicalTrials.gov names that Clinic. It works for every Clinic here, because it never visits the Clinic's site.
      </p>
      <p className="muted small">GuineaPing reads only some Clinics' lists, once a day. A list can change sooner than that, so check the Clinic's own page before you plan around it.</p>
    </>
  );
}
