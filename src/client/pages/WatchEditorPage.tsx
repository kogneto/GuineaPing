import { useEffect, useState, type FormEvent } from "react";
import { DISTANCES, KINDS, PHASES, STATUSES, type CriteriaInput, type Kind, type Phase, type Profile, type Sex, type Status, type Trial, type Watch } from "../../shared/api";
import { CLINICS, MAX_WATCH_CLINICS, clinicById, clinicLabel } from "../../shared/clinics";
import { PHASE_LABELS, STATUS_LABELS, kindLabel } from "../../shared/plain";
import { api } from "../api";
import { Illustration } from "../components/Illustration";
import { TrialList } from "../components/TrialCard";
import { Link, navigate } from "../router";

const split = (s: string) =>
  s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Creates a Watch, or edits one `id` the signed-in Member owns. */
export function WatchEditorPage({ id }: { id?: string }) {
  const [loaded, setLoaded] = useState(!id);
  const [name, setName] = useState(() => {
    const asked = id ? undefined : clinicById(new URLSearchParams(location.search).get("clinic") ?? "");
    return asked ? clinicLabel(asked) : "";
  });
  const [conditions, setConditions] = useState("");
  const [terms, setTerms] = useState("");
  const [phases, setPhases] = useState<Phase[]>([]);
  const [kinds, setKinds] = useState<Kind[]>([]);
  const [statuses, setStatuses] = useState<Status[]>(["RECRUITING", "NOT_YET_RECRUITING"]);
  const [isPrivate, setPrivate] = useState(false);
  const [zip, setZip] = useState("");
  const [miles, setMiles] = useState<number>(50);
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<Sex | "">("");
  // New Watches start out for healthy volunteers: that is who GuineaPing is mostly for.
  const [healthy, setHealthy] = useState(!id);
  // The Clinics page links here with ?clinic=<id> to start a Watch for one Clinic.
  const [clinics, setClinics] = useState<string[]>(() => {
    const asked = id ? null : new URLSearchParams(location.search).get("clinic");
    return asked && clinicById(asked) ? [asked] : [];
  });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [preview, setPreview] = useState<Trial[] | null>(null);
  const [previewNote, setPreviewNote] = useState<string | null>("Add a ZIP code, pick a Clinic, or type a condition or keyword, to see what it finds.");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Profile>("/api/profile").then(setProfile, () => {});
  }, []);
  const profileHasSomething = !!profile && (profile.zip !== null || profile.birthYear !== null || profile.sex !== null || profile.conditions.length > 0);
  /** Copies the Member's Profile into the form. Conditions are only filled in when none are typed yet. */
  const useProfile = () => {
    if (!profile) return;
    if (profile.zip) {
      setZip(profile.zip);
      setMiles(profile.miles ?? 50);
    }
    if (profile.birthYear !== null) setAge(String(new Date().getFullYear() - profile.birthYear));
    if (profile.sex) setSex(profile.sex);
    setHealthy(profile.healthyVolunteer);
    if (!conditions.trim() && profile.conditions.length) setConditions(profile.conditions.join(", "));
  };

  useEffect(() => {
    if (!id) return;
    api<Watch>(`/api/watches/${id}`).then((w) => {
      setName(w.name);
      setConditions(w.criteria.conditions.join(", "));
      setTerms(w.criteria.terms.join(", "));
      setPhases(w.criteria.phases);
      setKinds(w.criteria.kinds);
      setStatuses(w.criteria.statuses);
      setPrivate(w.private);
      setZip(w.criteria.near?.zip ?? "");
      setMiles(w.criteria.near?.miles ?? 50);
      setAge(w.criteria.age === null ? "" : String(w.criteria.age));
      setSex(w.criteria.sex ?? "");
      setHealthy(w.criteria.healthy);
      setClinics(w.criteria.clinics);
      setLoaded(true);
    }, (e: Error) => setError(e.message));
  }, [id]);

  // A half-typed ZIP code or age is left out of the preview rather than shown as an error.
  const ageNumber = /^\d{1,3}$/.test(age.trim()) ? Number(age.trim()) : null;
  const criteria: CriteriaInput = {
    conditions: split(conditions),
    terms: split(terms),
    phases,
    statuses,
    kinds,
    near: /^\d{5}$/.test(zip.trim()) ? { zip: zip.trim(), miles } : null,
    age: ageNumber,
    sex: sex || null,
    healthy,
    clinics,
  };
  const key = JSON.stringify(criteria);

  // Suggestions for the condition being typed: the text after the last comma.
  const typing = conditions.split(/[,;]/).pop()!.trim();
  useEffect(() => {
    if (typing.length < 2) {
      setSuggestions([]);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      api<string[]>(`/api/suggest?q=${encodeURIComponent(typing)}`).then(
        (list) => live && setSuggestions(list.filter((x) => x.toLowerCase() !== typing.toLowerCase())),
        () => live && setSuggestions([]),
      );
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [typing]);

  const pick = (suggestion: string) => {
    const done = conditions.split(/[,;]/).slice(0, -1).map((x) => x.trim()).filter(Boolean);
    setConditions([...done, suggestion].join(", ") + ", ");
    setSuggestions([]);
  };

  // Recent matches update as the Owner types, so they can see whether the words find the right trials.
  useEffect(() => {
    if (!criteria.conditions.length && !criteria.terms.length && !criteria.clinics.length && !(criteria.healthy && criteria.near)) {
      setPreview(null);
      setPreviewNote("Add a ZIP code, pick a Clinic, or type a condition or keyword, to see what it finds.");
      return;
    }
    setPreviewNote(null);
    setPreview(null);
    let live = true;
    const timer = setTimeout(() => {
      api<Trial[]>("/api/preview", "POST", { criteria }).then(
        (t) => live && setPreview(t),
        (e: Error) => live && setPreviewNote(e.message),
      );
    }, 600);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (zip.trim() && !criteria.near) throw new Error("Enter a 5-digit US ZIP code, or leave it empty for anywhere");
      if (age.trim() && ageNumber === null) throw new Error("Enter an age in whole years, or leave it empty");
      const body = { name, criteria, private: isPrivate };
      const saved = id ? await api<Watch>(`/api/watches/${id}`, "PUT", body) : await api<Watch>("/api/watches", "POST", body);
      navigate(`/watches/${saved.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  if (!loaded) return error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>;

  return (
    <>
      <p className="crumb">
        <Link to={id ? `/watches/${id}` : "/watches"}>← {id ? "Back" : "Watches"}</Link>
      </p>
      <h1>{id ? "Edit Watch" : "New Watch"}</h1>
      <div className="editor">
        <form onSubmit={save} className="form">
          {profileHasSomething && (
            <p className="actions">
              <button type="button" className="secondary" onClick={useProfile}>
                Fill in from my profile
              </button>
            </p>
          )}
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Studies near me" required maxLength={100} />
          </label>
          <fieldset>
            <legend>Where</legend>
            <div className="inline-fields">
              <label>
                Within
                <select value={miles} onChange={(e) => setMiles(Number(e.target.value))}>
                  {DISTANCES.map((d) => (
                    <option key={d} value={d}>
                      {d} miles
                    </option>
                  ))}
                </select>
              </label>
              <label>
                of US ZIP code
                <input value={zip} onChange={(e) => setZip(e.target.value)} inputMode="numeric" autoComplete="postal-code" maxLength={5} placeholder="02139" className="short" />
              </label>
            </div>
            <span className="hint">Leave the ZIP code empty for trials anywhere. A Watch with no condition, keyword or Clinic needs one.</span>
          </fieldset>
          <fieldset>
            <legend>Clinics</legend>
            <span className="hint">
              Only trials at one of these Clinics. Leave empty for any site. A Clinic is found by the name its trials give their site, so a trial that names no site is missed, and so is one that adds the Clinic after it was first posted.
            </span>
            {clinics.length > 0 && (
              <div className="suggestions" aria-label="Clinics in this Watch">
                {clinics.map((clinicId) => {
                  const clinic = clinicById(clinicId);
                  return (
                    <button type="button" key={clinicId} className="chip" onClick={() => setClinics(clinics.filter((x) => x !== clinicId))} aria-label={`Remove ${clinic ? clinicLabel(clinic) : clinicId}`}>
                      {clinic ? clinicLabel(clinic) : clinicId} ×
                    </button>
                  );
                })}
              </div>
            )}
            {clinics.length < MAX_WATCH_CLINICS && (
              <label>
                Add a Clinic
                <select value="" onChange={(e) => e.target.value && setClinics([...clinics, e.target.value])}>
                  <option value="">Choose…</option>
                  {[...CLINICS]
                    .filter((clinic) => !clinics.includes(clinic.id))
                    .sort((a, b) => clinicLabel(a).localeCompare(clinicLabel(b)))
                    .map((clinic) => (
                      <option key={clinic.id} value={clinic.id}>
                        {clinicLabel(clinic)}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </fieldset>
          <fieldset>
            <legend>Who it's for</legend>
            <div className="inline-fields">
              <label>
                Age
                <input value={age} onChange={(e) => setAge(e.target.value)} inputMode="numeric" maxLength={3} placeholder="Any" className="short" />
              </label>
              <label>
                Sex
                <select value={sex} onChange={(e) => setSex(e.target.value as Sex | "")}>
                  <option value="">Anyone</option>
                  <option value="FEMALE">Female</option>
                  <option value="MALE">Male</option>
                </select>
              </label>
            </div>
            <span className="hint">Only trials this person could join. Leave empty to see all.</span>
            <label className="check">
              <input type="checkbox" checked={healthy} onChange={(e) => setHealthy(e.target.checked)} />
              Only trials that take healthy volunteers
            </label>
          </fieldset>
          <label>
            Conditions <span className="muted">(optional)</span>
            <input value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="asthma, hay fever" />
            <span className="hint">Leave empty for any healthy-volunteer study near you. Separate several with commas; a trial matching any of them counts.</span>
          </label>
          {suggestions.length > 0 && (
            <div className="suggestions" aria-label="Suggested conditions">
              <span className="hint">Suggestions:</span>
              {suggestions.map((x) => (
                <button type="button" key={x} className="chip" onClick={() => pick(x)}>
                  {x}
                </button>
              ))}
            </div>
          )}
          <label>
            Keywords <span className="muted">(optional)</span>
            <input value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="ocrelizumab" />
            <span className="hint">Drug names, treatments, hospitals… also any-of.</span>
          </label>
          <fieldset>
            <legend>Kind of study</legend>
            <span className="hint">Leave all unticked for any kind. Tick several to see trials of any of them.</span>
            <div className="checks">
              {KINDS.map((k) => (
                <label key={k} className="check">
                  <input type="checkbox" checked={kinds.includes(k)} onChange={() => setKinds(toggle(kinds, k))} />
                  {kindLabel(k)}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Phases</legend>
            <span className="hint">Leave all unticked for any phase. Observation-only studies have no phase, so ticking one leaves them out.</span>
            <div className="checks">
              {PHASES.map((p) => (
                <label key={p} className="check">
                  <input type="checkbox" checked={phases.includes(p)} onChange={() => setPhases(toggle(phases, p))} />
                  {PHASE_LABELS[p]}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Status</legend>
            <span className="hint">Leave all unticked for any of these.</span>
            <div className="checks">
              {STATUSES.map((s) => (
                <label key={s} className="check">
                  <input type="checkbox" checked={statuses.includes(s)} onChange={() => setStatuses(toggle(statuses, s))} />
                  {STATUS_LABELS[s]}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="check">
            <input type="checkbox" checked={isPrivate} onChange={(e) => setPrivate(e.target.checked)} />
            Private: only I can see and follow this Watch
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : id ? "Save changes" : "Create and follow"}
          </button>
        </form>
        <section className="preview">
          <h2>Recent matches</h2>
          <p className="muted small">Posted in the last 30 days. Saving won't send Alerts for these, only for trials found from now on.</p>
          {previewNote ? (
            <div className="empty compact">
              <Illustration name="makingWatch" size="sm" />
              <p className="muted">{previewNote}</p>
            </div>
          ) : <TrialList trials={preview} empty="Nothing posted in the last 30 days matches yet." />}
        </section>
      </div>
    </>
  );
}
