import { useEffect, useState } from "react";
import type { ClinicItem, Opening } from "../../shared/api";
import { OPENING_MARK_LABELS, inOrder, type OpeningMark, type OpeningOrder } from "../../shared/openings";
import { ago, api } from "../api";
import { Illustration } from "../components/Illustration";
import { WaitingLine } from "../components/WaitingPeriods";
import { Link } from "../router";

/** An Opening is new for a week after GuineaPing first sees it. */
const NEW_DAYS = 7;
const isNew = (o: Opening) => Date.now() - Date.parse(o.firstSeen) < NEW_DAYS * 24 * 60 * 60 * 1000;

type SetAside = (opening: Opening, mark: OpeningMark | null) => void;

/** What each mark means for an Opening that carries it, said where the Member sees it set aside. */
const MARK_MEANS: Record<OpeningMark, string> = {
  not_this_time: "It shows again if the Clinic lists it again, with new dates or a new group.",
  not_for_me: "Every listing of this study at this Clinic stays set aside, later groups too.",
};

/** One Opening, in the Clinic's own words, linking to its page on the Clinic's site. */
function OpeningCard({ opening, onMark, clinic }: { opening: Opening; onMark: SetAside; clinic?: ClinicItem }) {
  const facts = [opening.pay, opening.when, opening.stay].filter(Boolean);
  return (
    <article className={opening.mark ? "trial aside" : "trial"}>
      <a href={opening.url} target="_blank" rel="noreferrer" className="trial-title">
        {opening.title}
      </a>
      {isNew(opening) && !opening.mark && <span className="tag">New</span>}
      {clinic && (
        <p className="where">
          {clinic.name} · {clinic.place}
          {clinic.miles !== null && ` · ${clinic.miles} miles`}
        </p>
      )}
      {facts.length > 0 && <p className="facts">{facts.join(" · ")}</p>}
      {opening.who && <p className="where">{opening.who}</p>}
      <p className="meta">
        First seen {opening.firstSeen}
        {opening.code && ` · ${opening.code}`}
      </p>
      {opening.mark ? (
        <p className="muted small">
          Set aside: {OPENING_MARK_LABELS[opening.mark]}. {MARK_MEANS[opening.mark]}{" "}
          <button type="button" className="link" onClick={() => onMark(opening, null)}>
            Put back
          </button>
        </p>
      ) : (
        <p className="actions small">
          <button type="button" className="link" onClick={() => onMark(opening, "not_this_time")}>
            {OPENING_MARK_LABELS.not_this_time}
          </button>
          {opening.canMarkStudy && (
            <button type="button" className="link" onClick={() => onMark(opening, "not_for_me")}>
              {OPENING_MARK_LABELS.not_for_me}
            </button>
          )}
        </p>
      )}
    </article>
  );
}

function ClinicSection({ clinic, onMark, onPush }: { clinic: ClinicItem; onMark: SetAside; onPush: (clinic: ClinicItem, on: boolean) => void }) {
  const [showAside, setShowAside] = useState(false);
  const listed = clinic.openings.filter((o) => !o.mark);
  const aside = clinic.openings.filter((o) => o.mark);
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
      {clinic.read && !clinic.refused && (
        <label className="check small">
          <input type="checkbox" checked={clinic.pushNew} onChange={(e) => onPush(clinic, e.target.checked)} />
          Push me new Openings here
        </label>
      )}
      {listed.length > 0 && (
        <div className="stack">
          {listed.map((o) => (
            <OpeningCard key={o.id} opening={o} onMark={onMark} />
          ))}
        </div>
      )}
      {aside.length > 0 && (
        <p className="muted small">
          {aside.length} set aside by you.{" "}
          <button type="button" className="link" onClick={() => setShowAside(!showAside)}>
            {showAside ? "Hide" : "Show"}
          </button>
        </p>
      )}
      {showAside && aside.length > 0 && (
        <div className="stack">
          {aside.map((o) => (
            <OpeningCard key={o.id} opening={o} onMark={onMark} />
          ))}
        </div>
      )}
      {clinic.read && !clinic.refused && clinic.lastReadAt && !clinic.openings.length && <p className="muted small">Nothing on its list right now.</p>}
    </section>
  );
}

type View = "clinics" | OpeningOrder;

const VIEWS: { view: View; label: string; says: string }[] = [
  { view: "clinics", label: "Nearest Clinic", says: "" },
  { view: "pay", label: "Highest pay", says: "Every Opening from every Clinic that is read, highest pay first. Where a Clinic gives a range or several figures, the highest is used for ordering; Openings that name no figure come last." },
  { view: "newest", label: "Newest listed", says: "Every Opening from every Clinic that is read, the most recently listed first. Clinics give no listing date, so this is the day GuineaPing first saw each one." },
];

/** Every Opening from every Clinic as one list, in the order asked for, each naming its Clinic. */
function AllOpenings({ clinics, by, onMark }: { clinics: ClinicItem[]; by: OpeningOrder; onMark: SetAside }) {
  const [showAside, setShowAside] = useState(false);
  const clinicOf = new Map(clinics.flatMap((c) => c.openings.map((o) => [o.id, c] as const)));
  const all = inOrder(clinics.flatMap((c) => c.openings), by);
  const listed = all.filter((o) => !o.mark);
  const aside = all.filter((o) => o.mark);
  const cards = (openings: Opening[]) => (
    <div className="stack">
      {openings.map((o) => (
        <OpeningCard key={o.id} opening={o} onMark={onMark} clinic={clinicOf.get(o.id)} />
      ))}
    </div>
  );
  return (
    <>
      {listed.length > 0 ? cards(listed) : <p className="muted">{all.length ? "You have set every Opening aside." : "No Clinic's list has been read yet."}</p>}
      {aside.length > 0 && (
        <p className="muted small">
          {aside.length} set aside by you.{" "}
          <button type="button" className="link" onClick={() => setShowAside(!showAside)}>
            {showAside ? "Hide" : "Show"}
          </button>
        </p>
      )}
      {showAside && aside.length > 0 && cards(aside)}
    </>
  );
}

export function ClinicsPage() {
  const [view, setView] = useState<View>("clinics");
  const [clinics, setClinics] = useState<ClinicItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyOpenings, setOnlyOpenings] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);

  useEffect(() => {
    api<ClinicItem[]>("/api/clinics").then(setClinics, (e: Error) => setError(e.message));
  }, []);

  const setAside: SetAside = (opening, mark) => {
    setMarkError(null);
    api("/api/openings/mark", "POST", { id: opening.id, mark })
      .then(() => api<ClinicItem[]>("/api/clinics"))
      .then(setClinics, (e: Error) => setMarkError(e.message));
  };

  const setPush = (clinic: ClinicItem, on: boolean) => {
    setMarkError(null);
    api("/api/clinics/push", "POST", { id: clinic.id, on })
      .then(() => api<ClinicItem[]>("/api/clinics"))
      .then(setClinics, (e: Error) => setMarkError(e.message));
  };

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
        Research clinics that pay healthy volunteers{view === "clinics" ? (measured ? ", nearest first" : ", in name order") : ""}. What each one says about pay, dates and stays is in its own words; follow the link for the details.
        {!measured && (
          <>
            {" "}
            <Link to="/profile">Add your ZIP code</Link> to see the nearest first.
          </>
        )}
      </p>
      <WaitingLine />
      <p className="views" aria-label="Sort by">
        <span className="muted small">Sort by</span>
        {VIEWS.map((v) => (
          <button type="button" key={v.view} className="chip" aria-pressed={view === v.view} onClick={() => setView(v.view)}>
            {v.label}
          </button>
        ))}
      </p>
      {view === "clinics" && (
        <p className="views">
          <button type="button" className="chip" aria-pressed={!onlyOpenings} onClick={() => setOnlyOpenings(false)}>
            All Clinics
          </button>
          <button type="button" className="chip" aria-pressed={onlyOpenings} onClick={() => setOnlyOpenings(true)}>
            With Openings
          </button>
        </p>
      )}
      {view !== "clinics" && <p className="muted small">{VIEWS.find((v) => v.view === view)!.says}</p>}
      {markError && <p className="error">{markError}</p>}
      {view === "clinics" ? shown.map((c) => <ClinicSection key={c.id} clinic={c} onMark={setAside} onPush={setPush} />) : <AllOpenings clinics={clinics} by={view} onMark={setAside} />}
      {view === "clinics" && !shown.length && <p className="muted">No Clinic's list has been read yet.</p>}
      <p className="muted small">
        "Watch for Trials" starts a Watch that sends an Alert when a new Trial on ClinicalTrials.gov names that Clinic. It works for every Clinic here, because it never visits the Clinic's site.
      </p>
      <p className="muted small">
        Set a listing aside when it isn't one you'd take. "Not this time" is for a reason that will change, such as the dates: the listing shows again if the Clinic lists the study again. "Not for me" is for a
        reason that won't: that study stays set aside at that Clinic, later groups too. Only you see what you set aside, and you can always show it and put it back.
      </p>
      <p className="muted small">GuineaPing reads only some Clinics' lists, once an hour. A list can change sooner than that, so check the Clinic's own page before you plan around it. Tick "Push me new Openings here" under a Clinic to hear on your Devices when its list shows a new one, or new dates or a new group for one it had. That Push names the Clinic and gives the study's title, pay, dates and stay.</p>
    </>
  );
}
