import { useEffect, useState } from "react";
import type { AlertItem } from "../../shared/api";
import { agesText, locationsText, phaseText, statusText } from "../../shared/plain";
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
    ["Who can join", agesText(t.minimumAge, t.maximumAge)],
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
