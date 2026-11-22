import { useEffect, useState } from "react";
import type { AlertItem } from "../../shared/api";
import { agesText, criteriaSections, locationsText, phaseText, sexText, statusText, type CriteriaSection } from "../../shared/plain";
import { api } from "../api";
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
      <p className="meta">Matched {alert.watchNames.join(", ")}</p>
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
      <div className="callout">
        <Illustration name="clinician" size="xs" />
        <p className="muted small">Talk to your doctor before contacting a study. The listing's contacts can say whether you might qualify.</p>
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
