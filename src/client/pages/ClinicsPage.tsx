import { useEffect, useState } from "react";
import type { ClinicItem, Opening } from "../../shared/api";
import { OPENING_MARK_LABELS, inOrder, payAmount, type OpeningMark } from "../../shared/openings";
import { ago, api } from "../api";
import { Greeting } from "../components/Greeting";
import { Illustration } from "../components/Illustration";
import { TipJar } from "../components/TipJar";
import { WaitingLine } from "../components/WaitingPeriods";
import { Link } from "../router";

/** An Opening is new for a week after GuineaPing first sees it. */
const NEW_DAYS = 7;
const isNew = (o: Opening) => Date.now() - Date.parse(o.firstSeen) < NEW_DAYS * 24 * 60 * 60 * 1000;

type SetAside = (opening: Opening, mark: OpeningMark | null) => void;
type ClinicActions = { onPush: (clinic: ClinicItem, on: boolean) => void; onOffList: (clinic: ClinicItem, off: boolean) => void };

/** What each mark means for an Opening that carries it, said where the Member sees it set aside. */
const MARK_MEANS: Record<OpeningMark, string> = {
  not_this_time: "It shows again if the Clinic lists it again, with new dates or a new group.",
  not_for_me: "Every listing of this study at this Clinic stays set aside, later groups too.",
};

const where = (clinic: ClinicItem) => `${clinic.name} · ${clinic.place}${clinic.miles !== null ? ` · ${clinic.miles} miles` : ""}`;

/**
 * One Opening, in the Clinic's own words, linking to its page on the Clinic's site. The pay comes
 * first because it is what a Member scans for; it is the Clinic's wording, not a figure worked out.
 */
function OpeningCard({ opening, onMark, clinic }: { opening: Opening; onMark: SetAside; clinic?: ClinicItem }) {
  const facts = [opening.when, opening.stay].filter(Boolean);
  return (
    <article className={opening.mark ? "opening aside" : "opening"}>
      <div className="opening-head">
        {opening.pay ? <p className="pay">{opening.pay}</p> : <p className="pay none">No pay given on its list</p>}
        {isNew(opening) && !opening.mark && <span className="new">New</span>}
      </div>
      {clinic && <p className="opening-clinic">{where(clinic)}</p>}
      <p className="opening-title">{opening.title}</p>
      {facts.length > 0 && <p className="facts">{facts.join(" · ")}</p>}
      {opening.who && <p className="facts">{opening.who}</p>}
      <p className="meta">
        First seen {opening.firstSeen}
        {opening.code && ` · ${opening.code}`}
      </p>
      {opening.mark && (
        <p className="muted small">
          Set aside: {OPENING_MARK_LABELS[opening.mark]}. {MARK_MEANS[opening.mark]}
        </p>
      )}
      <p className="opening-actions">
        <a href={opening.url} target="_blank" rel="noreferrer">
          Open at Clinic
        </a>
        {opening.mark ? (
          <button type="button" className="link" onClick={() => onMark(opening, null)}>
            Put back
          </button>
        ) : (
          <>
            <button type="button" className="link quiet" onClick={() => onMark(opening, "not_this_time")}>
              {OPENING_MARK_LABELS.not_this_time}
            </button>
            {opening.canMarkStudy && (
              <button type="button" className="link quiet" onClick={() => onMark(opening, "not_for_me")}>
                {OPENING_MARK_LABELS.not_for_me}
              </button>
            )}
          </>
        )}
      </p>
    </article>
  );
}

/** Openings that are listed, then a count of those set aside, which can be shown and put back. */
function OpeningList({ openings, onMark, clinicOf, empty }: { openings: Opening[]; onMark: SetAside; clinicOf?: Map<string, ClinicItem>; empty?: string }) {
  const [showAside, setShowAside] = useState(false);
  const listed = openings.filter((o) => !o.mark);
  const aside = openings.filter((o) => o.mark);
  const cards = (list: Opening[]) => (
    <div className="stack">
      {list.map((o) => (
        <OpeningCard key={o.id} opening={o} onMark={onMark} clinic={clinicOf?.get(o.id)} />
      ))}
    </div>
  );
  return (
    <>
      {listed.length > 0 ? cards(listed) : empty && <p className="muted">{aside.length ? "You have set every Opening here aside." : empty}</p>}
      {aside.length > 0 && (
        <p className="muted small aside-count">
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

const VIEWS = [
  { view: "pay", label: "Highest pay", says: "Highest pay first. Where a Clinic gives a range or several figures, the highest is used for ordering; Openings that name no figure come last." },
  { view: "newest", label: "Newest", says: "Most recently listed first. Clinics give no listing date, so this is the day GuineaPing first saw each one." },
  { view: "nearest", label: "Nearest", says: "Nearest Clinic first, and the better paid first at each Clinic." },
  { view: "clinics", label: "By Clinic", says: "" },
] as const;
type View = (typeof VIEWS)[number]["view"];

const VIEW_KEY = "guineaping.clinics.view";
/** The view the Member last chose on this device, if the browser will say. */
function rememberedView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return VIEWS.some((x) => x.view === v) ? (v as View) : "pay";
  } catch {
    return "pay";
  }
}

/** Every Opening from every Clinic on the Member's list as one list, each naming its Clinic. */
function AllOpenings({ clinics, by, onMark }: { clinics: ClinicItem[]; by: Exclude<View, "clinics">; onMark: SetAside }) {
  const clinicOf = new Map(clinics.flatMap((c) => c.openings.map((o) => [o.id, c] as const)));
  const all = clinics.flatMap((c) => c.openings);
  // `clinics` arrives nearest first, so "nearest" keeps that order and sorts only within a Clinic.
  const ordered = by === "nearest" ? clinics.flatMap((c) => inOrder(c.openings, "pay")) : inOrder(all, by);
  return <OpeningList openings={ordered} onMark={onMark} clinicOf={clinicOf} empty="No Clinic's list has been read yet." />;
}

/** One Clinic as a row that opens: its Openings, and what the Member can do about the Clinic. */
function ClinicRow({ clinic, onMark, onPush, onOffList }: { clinic: ClinicItem; onMark: SetAside } & ClinicActions) {
  const [open, setOpen] = useState(false);
  const listed = clinic.openings.filter((o) => !o.mark);
  const fresh = listed.filter(isNew).length;
  const canPush = clinic.read && !clinic.refused;
  const sub = [
    clinic.miles !== null ? `${clinic.miles} miles` : null,
    !clinic.read ? "not read by GuineaPing" : clinic.refused ? "its site stopped letting GuineaPing read it" : !clinic.lastReadAt ? "not read yet" : listed.length === 1 ? "1 Opening" : `${listed.length} Openings`,
    canPush && fresh ? `${fresh} new` : null,
  ].filter(Boolean);
  const label = `${clinic.name}, ${clinic.place}`;
  return (
    <section className={open ? "clinic-row open" : "clinic-row"}>
      <div className="clinic-row-head">
        <button type="button" className="clinic-row-main" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="clinic-row-name">
            {clinic.name} <span className="muted">· {clinic.place}</span>
          </span>
          <span className={canPush && fresh ? "clinic-row-sub fresh" : "clinic-row-sub"}>{sub.join(" · ")}</span>
        </button>
        {canPush ? (
          <label className="switch" title="Push me new Openings here">
            <input type="checkbox" role="switch" checked={clinic.pushNew} onChange={(e) => onPush(clinic, e.target.checked)} aria-label={`Push me new Openings at ${label}`} />
            <span aria-hidden="true" />
          </label>
        ) : (
          <a href={clinic.url} target="_blank" rel="noreferrer" className="clinic-row-link">
            Open list ↗
          </a>
        )}
        <button type="button" className="chevron" aria-label={open ? `Close ${label}` : `Open ${label}`} onClick={() => setOpen(!open)}>
          {open ? "⌄" : "›"}
        </button>
      </div>
      {open && (
        <div className="clinic-row-body">
          {canPush && clinic.lastReadAt && <p className="muted small">Read {ago(clinic.lastReadAt)}</p>}
          {clinic.read && <OpeningList openings={clinic.openings} onMark={onMark} empty={canPush && clinic.lastReadAt ? "Nothing on its list right now." : undefined} />}
          <p className="clinic-row-actions">
            <a href={clinic.url} target="_blank" rel="noreferrer">
              Open its list
            </a>
            <Link to={`/watches/new?clinic=${clinic.id}`}>Watch for Trials</Link>
            <button type="button" className="link quiet" onClick={() => onOffList(clinic, true)}>
              Take off my list
            </button>
          </p>
        </div>
      )}
    </section>
  );
}

/** How many link-only Clinics show before "Show more": the nearest few are the ones worth a look. */
const LINK_ONLY_SHOWN = 3;

function ByClinic({ clinics, onMark, onPush, onOffList }: { clinics: ClinicItem[]; onMark: SetAside } & ClinicActions) {
  const [allLinkOnly, setAllLinkOnly] = useState(false);
  const read = clinics.filter((c) => c.read);
  const linkOnly = clinics.filter((c) => !c.read);
  const row = (c: ClinicItem) => <ClinicRow key={c.id} clinic={c} onMark={onMark} onPush={onPush} onOffList={onOffList} />;
  return (
    <>
      {read.length > 0 && (
        <>
          <h2 className="group-label">Clinics GuineaPing reads</h2>
          <div className="stack">{read.map(row)}</div>
          <p className="muted small">The switch sends a Push to your Devices when that Clinic lists a new Opening. The Push names the Clinic and gives the study's title, pay, dates and stay, so it shows on your lock screen.</p>
        </>
      )}
      {linkOnly.length > 0 && (
        <>
          <h2 className="group-label">Clinics you open yourself</h2>
          <div className="stack">{(allLinkOnly ? linkOnly : linkOnly.slice(0, LINK_ONLY_SHOWN)).map(row)}</div>
          {linkOnly.length > LINK_ONLY_SHOWN && (
            <p className="show-more">
              <button type="button" className="link" onClick={() => setAllLinkOnly(!allLinkOnly)}>
                {allLinkOnly ? "Show fewer" : `Show ${linkOnly.length - LINK_ONLY_SHOWN} more`}
              </button>
            </p>
          )}
        </>
      )}
      {!clinics.length && <p className="muted">You have taken every Clinic off your list.</p>}
    </>
  );
}

export function ClinicsPage() {
  const [view, setView] = useState<View>(rememberedView);
  const [clinics, setClinics] = useState<ClinicItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [markError, setMarkError] = useState<string | null>(null);
  const [showOff, setShowOff] = useState(false);

  useEffect(() => {
    api<ClinicItem[]>("/api/clinics").then(setClinics, (e: Error) => setError(e.message));
  }, []);

  const choose = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // The choice just isn't remembered.
    }
  };
  /** Sends one change, then shows the page as the server now has it. */
  const change = (path: string, body: object) => {
    setMarkError(null);
    api(path, "POST", body)
      .then(() => api<ClinicItem[]>("/api/clinics"))
      .then(setClinics, (e: Error) => setMarkError(e.message));
  };
  const setAside: SetAside = (opening, mark) => change("/api/openings/mark", { id: opening.id, mark });
  const setPush = (clinic: ClinicItem, on: boolean) => change("/api/clinics/push", { id: clinic.id, on });
  const setOffList = (clinic: ClinicItem, off: boolean) => change("/api/clinics/off-list", { id: clinic.id, off });

  if (error) return <p className="error">{error}</p>;
  if (!clinics)
    return (
      <div className="empty compact">
        <Illustration name="reading" size="sm" />
        <p className="muted">Loading…</p>
      </div>
    );
  const measured = clinics.some((c) => c.miles !== null);
  const mine = clinics.filter((c) => !c.offList);
  const off = clinics.filter((c) => c.offList);
  const lastRead = mine.map((c) => c.lastReadAt).filter((x): x is string => !!x).sort().pop();
  // The greeting counts what the Member would see: on their list and not set aside.
  const listed = mine.flatMap((c) => c.openings).filter((o) => !o.mark);
  const today = new Date().toISOString().slice(0, 10);
  const newToday = listed.filter((o) => o.firstSeen === today).length;
  // The highest figure in any Clinic's wording, as "Highest pay" orders them. The cards keep the Clinic's own words.
  const topPay = Math.max(0, ...listed.map((o) => payAmount(o.pay) ?? 0));
  return (
    <>
      <Greeting
        art="lookout"
        title={newToday ? `${newToday} new ${newToday === 1 ? "Opening" : "Openings"} today` : listed.length === 1 ? "1 Opening listed" : `${listed.length} Openings listed`}
        sub={[topPay ? `Top pay right now $${topPay.toLocaleString("en-US")}` : null, lastRead ? `Read ${ago(lastRead)}` : null].filter(Boolean).join(" · ")}
      />
      <WaitingLine />
      <p className="views scroll" aria-label="Sort by">
        {VIEWS.map((v) => (
          <button type="button" key={v.view} className="chip" aria-pressed={view === v.view} onClick={() => choose(v.view)}>
            {v.label}
          </button>
        ))}
      </p>
      {view !== "clinics" && <p className="muted small">{VIEWS.find((v) => v.view === view)!.says}</p>}
      {!measured && (view === "nearest" || view === "clinics") && (
        <p className="muted small">
          <Link to="/profile">Add your ZIP code</Link> to see the nearest first. Until then Clinics are in name order.
        </p>
      )}
      {markError && <p className="error">{markError}</p>}
      {view === "clinics" ? <ByClinic clinics={mine} onMark={setAside} onPush={setPush} onOffList={setOffList} /> : <AllOpenings clinics={mine} by={view} onMark={setAside} />}
      {off.length > 0 && (
        <p className="muted small aside-count">
          {off.length === 1 ? "1 Clinic" : `${off.length} Clinics`} taken off your list.{" "}
          <button type="button" className="link" onClick={() => setShowOff(!showOff)}>
            {showOff ? "Hide" : "Show"}
          </button>
        </p>
      )}
      {showOff && off.length > 0 && (
        <ul className="off-list">
          {off.map((c) => (
            <li key={c.id}>
              {c.name} <span className="muted">· {c.place}</span>{" "}
              <button type="button" className="link" onClick={() => setOffList(c, false)}>
                Put back
              </button>
            </li>
          ))}
        </ul>
      )}
      <TipJar lead="Did an Opening here work out?" />
      <details className="about">
        <summary>How this page works</summary>
        <p>Research clinics that pay healthy volunteers. What each one says about pay, dates and stays is in its own words; open it at the Clinic for the details.</p>
        <p>GuineaPing reads only some Clinics' lists, once an hour. A list can change sooner than that, so check the Clinic's own page before you plan around it. The others are under "By Clinic", as "Clinics you open yourself".</p>
        <p>
          Under "By Clinic", the switch beside a Clinic sends a Push to your Devices when its list shows a new Opening, or new dates or a new group for one it had. That Push names the Clinic and gives the study's title,
          pay, dates and stay.
        </p>
        <p>
          Set a listing aside when it isn't one you'd take. "Not this time" is for a reason that will change, such as the dates: the listing shows again if the Clinic lists the study again. "Not for me" is for a reason
          that won't: that study stays set aside at that Clinic, later groups too. Only you see what you set aside, and you can always show it and put it back.
        </p>
        <p>
          Under "By Clinic", open a Clinic to find "Take off my list". It removes the Clinic from this page for you alone, for instance one too far to travel to. Its Openings leave every list, and your Push for it is
          turned off. Clinics you took off are counted at the foot of the page, where you can put them back.
        </p>
        <p>"Watch for Trials" starts a Watch that sends an Alert when a new Trial on ClinicalTrials.gov names that Clinic. It works for every Clinic, because it never visits the Clinic's site.</p>
      </details>
    </>
  );
}
