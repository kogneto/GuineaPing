import { useEffect, useState, type FormEvent } from "react";
import { DISTANCES, PHASES, STATUSES, type CriteriaInput, type Phase, type Sex, type Status, type Trial, type Watch } from "../../shared/api";
import { PHASE_LABELS, STATUS_LABELS } from "../../shared/plain";
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
  const [name, setName] = useState("");
  const [conditions, setConditions] = useState("");
  const [terms, setTerms] = useState("");
  const [phases, setPhases] = useState<Phase[]>([]);
  const [statuses, setStatuses] = useState<Status[]>(["RECRUITING", "NOT_YET_RECRUITING"]);
  const [isPrivate, setPrivate] = useState(false);
  const [zip, setZip] = useState("");
  const [miles, setMiles] = useState<number>(50);
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<Sex | "">("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [preview, setPreview] = useState<Trial[] | null>(null);
  const [previewNote, setPreviewNote] = useState<string | null>("Type a condition or keyword to see what it finds.");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    api<Watch>(`/api/watches/${id}`).then((w) => {
      setName(w.name);
      setConditions(w.criteria.conditions.join(", "));
      setTerms(w.criteria.terms.join(", "));
      setPhases(w.criteria.phases);
      setStatuses(w.criteria.statuses);
      setPrivate(w.private);
      setZip(w.criteria.near?.zip ?? "");
      setMiles(w.criteria.near?.miles ?? 50);
      setAge(w.criteria.age === null ? "" : String(w.criteria.age));
      setSex(w.criteria.sex ?? "");
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
    near: /^\d{5}$/.test(zip.trim()) ? { zip: zip.trim(), miles } : null,
    age: ageNumber,
    sex: sex || null,
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
    if (!criteria.conditions.length && !criteria.terms.length) {
      setPreview(null);
      setPreviewNote("Type a condition or keyword to see what it finds.");
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
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="MS trials" required maxLength={100} />
          </label>
          <label>
            Conditions
            <input value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="multiple sclerosis, MS" />
            <span className="hint">Separate several with commas. A trial matching any of them counts.</span>
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
            <span className="hint">Leave the ZIP code empty for trials anywhere.</span>
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
          </fieldset>
          <fieldset>
            <legend>Phases</legend>
            <span className="hint">Leave all unticked for any phase.</span>
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
