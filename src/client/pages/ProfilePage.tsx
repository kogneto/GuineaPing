import { Link } from "../router";
import { useEffect, useState, type FormEvent } from "react";
import { DISTANCES, type Profile, type Sex } from "../../shared/api";
import { api } from "../api";
import { WaitingPeriods } from "../components/WaitingPeriods";

const split = (s: string) =>
  s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

/** The Member's Profile: a few facts about them, which only they see. */
export function ProfilePage() {
  const [loaded, setLoaded] = useState(false);
  const [birthYear, setBirthYear] = useState("");
  const [sex, setSex] = useState<Sex | "">("");
  const [zip, setZip] = useState("");
  const [miles, setMiles] = useState<number>(50);
  const [healthy, setHealthy] = useState(false);
  const [conditions, setConditions] = useState("");
  const [feet, setFeet] = useState("");
  const [inches, setInches] = useState("");
  const [weight, setWeight] = useState("");
  const [nicotine, setNicotine] = useState<"yes" | "no" | "">("");
  const [lastDonation, setLastDonation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    api<Profile>("/api/profile").then(
      (p) => {
        setBirthYear(p.birthYear === null ? "" : String(p.birthYear));
        setSex(p.sex ?? "");
        setZip(p.zip ?? "");
        setMiles(p.miles ?? 50);
        setHealthy(p.healthyVolunteer);
        setConditions(p.conditions.join(", "));
        setFeet(p.heightIn === null ? "" : String(Math.floor(p.heightIn / 12)));
        setInches(p.heightIn === null ? "" : String(Math.round((p.heightIn % 12) * 10) / 10));
        setWeight(p.weightLb === null ? "" : String(p.weightLb));
        setNicotine(p.nicotine ?? "");
        setLastDonation(p.lastDonationOn ?? "");
        setLoaded(true);
      },
      (e: Error) => setMessage({ kind: "error", text: e.message }),
    );
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      // Height is typed as feet and inches and kept as inches. Text that isn't a number is sent as it is, so the server can say so.
      const heightIn = feet.trim() || inches.trim() ? Number(feet.trim() || 0) * 12 + Number(inches.trim() || 0) : null;
      await api<Profile>("/api/profile", "PUT", {
        birthYear: birthYear.trim() || null,
        sex: sex || null,
        zip: zip.trim() || null,
        miles,
        healthyVolunteer: healthy,
        conditions: split(conditions),
        heightIn: heightIn === null ? null : Number.isFinite(heightIn) ? heightIn : "x",
        weightLb: weight.trim() || null,
        nicotine: nicotine || null,
        lastDonationOn: lastDonation || null,
      });
      setMessage({ kind: "ok", text: "Saved." });
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return message ? <p className="error">{message.text}</p> : <p className="muted">Loading…</p>;
  return (
    <div className="narrow">
      <p className="crumb">
        <Link to="/settings">← Settings</Link>
      </p>
      <h1>Your profile</h1>
      <p className="muted">
        Only you see this. It fills in new Watches for you, and shows how far each trial's nearest site is from you. Everything is optional.
      </p>
      <form className="form" onSubmit={save}>
        <div className="inline-fields">
          <label>
            Year you were born
            <input value={birthYear} onChange={(e) => setBirthYear(e.target.value)} inputMode="numeric" maxLength={4} placeholder="1980" className="short" />
          </label>
          <label>
            Sex
            <select value={sex} onChange={(e) => setSex(e.target.value as Sex | "")}>
              <option value="">Not given</option>
              <option value="FEMALE">Female</option>
              <option value="MALE">Male</option>
            </select>
          </label>
        </div>
        <fieldset>
          <legend>Where you are</legend>
          <div className="inline-fields">
            <label>
              US ZIP code
              <input value={zip} onChange={(e) => setZip(e.target.value)} inputMode="numeric" autoComplete="postal-code" maxLength={5} placeholder="02139" className="short" />
            </label>
            <label>
              How far you'd travel
              <select value={miles} onChange={(e) => setMiles(Number(e.target.value))}>
                {DISTANCES.map((d) => (
                  <option key={d} value={d}>
                    {d} miles
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>
        <label className="check">
          <input type="checkbox" checked={healthy} onChange={(e) => setHealthy(e.target.checked)} />
          I'd join studies as a healthy volunteer
        </label>
        <label>
          Conditions you have <span className="muted">(optional)</span>
          <input value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="asthma" />
          <span className="hint">Only for studies that look for people with a condition. Separate several with commas.</span>
        </label>
        <fieldset>
          <legend>For points to check</legend>
          <span className="hint">
            Many studies set limits on BMI, weight, nicotine and recent donations. Give what you like, and each Alert shows your own fact beside the study's line. GuineaPing never decides whether you can join.
          </span>
          <div className="inline-fields">
            <label>
              Height, feet
              <input value={feet} onChange={(e) => setFeet(e.target.value)} inputMode="numeric" maxLength={1} placeholder="5" className="short" />
            </label>
            <label>
              inches
              <input value={inches} onChange={(e) => setInches(e.target.value)} inputMode="decimal" maxLength={4} placeholder="9" className="short" />
            </label>
            <label>
              Weight, pounds
              <input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" maxLength={5} placeholder="165" className="short" />
            </label>
          </div>
          <div className="inline-fields">
            <label>
              Do you use nicotine?
              <select value={nicotine} onChange={(e) => setNicotine(e.target.value as "yes" | "no" | "")}>
                <option value="">Not given</option>
                <option value="no">No</option>
                <option value="yes">Yes: smoking, vaping, patches or other</option>
              </select>
            </label>
            <label>
              Last blood or plasma donation <span className="muted">(optional)</span>
              <input type="date" value={lastDonation} onChange={(e) => setLastDonation(e.target.value)} />
            </label>
          </div>
        </fieldset>
        {message && (
          <p className={message.kind === "error" ? "error" : "muted"} role="status">
            {message.text}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </form>
      <WaitingPeriods />
    </div>
  );
}
