/**
 * Search criteria: what a Watch asks for. Everything about them that is not a ClinicalTrials.gov
 * query lives here, for the Worker and the browser alike: their defaults, what is valid, how they
 * read in plain words, and how the editor's text fields become Search criteria and back.
 * Turning a ZIP code into a point needs the database, so that stays in the Worker.
 */
import { DISTANCES, KINDS, PHASES, SEXES, STATUSES, type Criteria, type CriteriaInput, type Kind, type Phase, type Profile, type Sex, type Status } from "./api";
import { clinicById, clinicLabel, MAX_WATCH_CLINICS } from "./clinics";
import { PHASE_LABELS, STATUS_LABELS, kindLabel, kindsAsked } from "./plain";

const DEFAULT_MILES = 50;
const MAX_AGE = 120;

export const NEEDS_NARROWING = "A Watch needs a condition, a keyword or a Clinic, or healthy volunteers with a ZIP code";
export const BAD_ZIP = "Enter a 5-digit US ZIP code, or leave it empty for anywhere";
export const BAD_AGE = `Enter an age in whole years, 0 to ${MAX_AGE}, or leave it empty`;

/** A condition or keyword with the characters a search can't hold taken out. Empty when nothing is left. */
export function cleanTerm(term: string): string {
  return term.replace(/["()\[\]]/g, " ").replace(/\s+/g, " ").trim();
}

/** Fills in fields added after a Watch was saved, so older Watches keep working. */
export function withDefaults(c: Partial<Criteria>): Criteria {
  return { conditions: [], terms: [], phases: [], statuses: [], kinds: [], near: null, age: null, sex: null, healthy: false, clinics: [], ...c };
}

/** Search criteria as a Watch's row keeps them. */
export function storedCriteria(json: string): Criteria {
  return withDefaults(JSON.parse(json) as Partial<Criteria>);
}

/** Whether two sets of Search criteria ask for the same thing, however their fields are ordered. */
export function sameCriteria(a: Criteria, b: Criteria): boolean {
  const ordered = (c: Criteria) =>
    JSON.stringify(c, (_key, value: unknown) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([x], [y]) => (x < y ? -1 : 1)))
        : value,
    );
  return ordered(withDefaults(a)) === ordered(withDefaults(b));
}

/**
 * Something has to narrow the search. Words do; so does a Clinic; so does "healthy volunteers
 * near here", which is what a volunteer with no condition wants. Healthy volunteers anywhere
 * would be every such Trial.
 */
export function narrows(c: Pick<CriteriaInput, "conditions" | "terms" | "clinics" | "healthy" | "near">): boolean {
  const hasWords = c.conditions.some((t) => cleanTerm(t)) || c.terms.some((t) => cleanTerm(t));
  return hasWords || c.clinics.length > 0 || (c.healthy && !!c.near);
}

const isZip = (zip: string) => /^\d{5}$/.test(zip);
const isAge = (age: number) => Number.isInteger(age) && age >= 0 && age <= MAX_AGE;

/**
 * Keeps only Search criteria the API understands, trimmed and de-duplicated. `near` comes back
 * without coordinates: the Worker looks the ZIP code up before they are used.
 */
export function normalizeCriteria(input: unknown): CriteriaInput | { error: string } {
  const raw = (input ?? {}) as Record<string, unknown>;
  const strings = (v: unknown) =>
    Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === "string").map((s) => s.trim()).filter(Boolean))] : [];
  const conditions = strings(raw.conditions);
  const terms = strings(raw.terms);
  const phases = strings(raw.phases);
  const statuses = strings(raw.statuses);
  const kinds = strings(raw.kinds);
  const clinics = strings(raw.clinics);
  const badClinic = clinics.find((id) => !clinicById(id));
  if (badClinic) return { error: `Unknown Clinic ${badClinic}` };
  if (clinics.length > MAX_WATCH_CLINICS) return { error: `A Watch can name at most ${MAX_WATCH_CLINICS} Clinics` };
  const badPhase = phases.find((p) => !(PHASES as readonly string[]).includes(p));
  if (badPhase) return { error: `Unknown phase ${badPhase}` };
  const badStatus = statuses.find((s) => !(STATUSES as readonly string[]).includes(s));
  if (badStatus) return { error: `Unknown status ${badStatus}` };
  // ClinicalTrials.gov answers 400 to a query naming a type it doesn't know, so a bad value saved
  // here would stop the Watch finding anything at all.
  const badKind = kinds.find((k) => !(KINDS as readonly string[]).includes(k));
  if (badKind) return { error: `Unknown kind of study ${badKind}` };

  let near: CriteriaInput["near"] = null;
  if (raw.near != null) {
    const n = raw.near as { zip?: unknown; miles?: unknown };
    const zip = typeof n.zip === "string" ? n.zip.trim() : "";
    if (!isZip(zip)) return { error: BAD_ZIP };
    if (!(DISTANCES as readonly number[]).includes(n.miles as number)) return { error: "Pick one of the distances offered" };
    near = { zip, miles: n.miles as number };
  }
  let age: number | null = null;
  if (raw.age != null && raw.age !== "") {
    age = Number(raw.age);
    if (!isAge(age)) return { error: BAD_AGE };
  }
  let sex: Sex | null = null;
  if (raw.sex != null && raw.sex !== "") {
    if (!(SEXES as readonly unknown[]).includes(raw.sex)) return { error: `Unknown sex ${String(raw.sex)}` };
    sex = raw.sex as Sex;
  }
  const healthy = raw.healthy === true;
  if (!narrows({ conditions, terms, clinics, healthy, near })) return { error: NEEDS_NARROWING };
  return { conditions, terms, phases: phases as Phase[], statuses: statuses as Status[], kinds: kinds as Kind[], near, age, sex, healthy, clinics };
}

// ---- In plain words ----

type Shown = Omit<Criteria, "near"> & { near: { zip: string; miles: number } | null };

const SEX_WORDS: Record<Sex, string> = { FEMALE: "Female", MALE: "Male" };
const capitalised = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
const clinicNames = (ids: string[]) => ids.map((id) => clinicById(id)).filter((x) => !!x).map(clinicLabel).join("; ");
const within = (near: Shown["near"]) => (near ? `within ${near.miles} miles of ${near.zip}` : "");
const who = (c: Shown) => [c.healthy ? "Healthy volunteers" : "", c.age !== null ? `age ${c.age}` : "", c.sex ? SEX_WORDS[c.sex].toLowerCase() : ""].filter(Boolean).join(", ");

/** Everything the Search criteria ask for, one labelled row each; a row with nothing to say is left out. */
export function criteriaRows(c: Shown): [label: string, text: string][] {
  const rows: [string, string][] = [
    ["Conditions", c.conditions.join(", ")],
    ["Keywords", c.terms.join(", ")],
    ["Clinics", clinicNames(c.clinics)],
    ["Where", c.near ? capitalised(within(c.near)) : "Anywhere"],
    ["Who", capitalised(who(c)) || "Anyone"],
    ["Kind of study", c.kinds.map(kindLabel).join("; ") || "Any"],
    ["Phases", c.phases.map((p) => PHASE_LABELS[p]).join(", ") || "Any"],
    ["Status", (c.statuses.length ? c.statuses : STATUSES).map((s) => STATUS_LABELS[s]).join(", ")],
  ];
  return rows.filter(([, text]) => text);
}

/** The Search criteria on one line, for a list of Watches. Phases and statuses are left to the Watch's own page. */
export function criteriaLine(c: Shown): string {
  const clinics = clinicNames(c.clinics);
  return [
    [...c.conditions, ...c.terms].join(", "),
    capitalised([who(c), within(c.near)].filter(Boolean).join(" ")),
    clinics ? `At ${clinics}` : "",
    kindsAsked(c.kinds) ?? "",
  ]
    .filter(Boolean)
    .join(" · ");
}

// ---- The editor's form ----

/** Search criteria as the editor holds them while they are typed: lists and numbers are still text. */
export type CriteriaForm = {
  conditions: string;
  terms: string;
  phases: Phase[];
  kinds: Kind[];
  statuses: Status[];
  zip: string;
  miles: number;
  age: string;
  sex: Sex | "";
  healthy: boolean;
  clinics: string[];
};

/** A new Watch's form. It starts out for healthy volunteers: that is who GuineaPing is mostly for. `clinicId` starts it at one Clinic. */
export function newForm(clinicId?: string | null): CriteriaForm {
  return {
    conditions: "",
    terms: "",
    phases: [],
    kinds: [],
    statuses: ["RECRUITING", "NOT_YET_RECRUITING"],
    zip: "",
    miles: DEFAULT_MILES,
    age: "",
    sex: "",
    healthy: true,
    clinics: clinicId && clinicById(clinicId) ? [clinicId] : [],
  };
}

/** The form for Search criteria already saved. */
export function formOf(c: Shown): CriteriaForm {
  return {
    conditions: c.conditions.join(", "),
    terms: c.terms.join(", "),
    phases: c.phases,
    kinds: c.kinds,
    statuses: c.statuses,
    zip: c.near?.zip ?? "",
    miles: c.near?.miles ?? DEFAULT_MILES,
    age: c.age === null ? "" : String(c.age),
    sex: c.sex ?? "",
    healthy: c.healthy,
    clinics: c.clinics,
  };
}

/** Copies a Member's Profile into the form. Conditions are only filled in when none are typed yet. */
export function withProfile(form: CriteriaForm, profile: Profile, thisYear: number): CriteriaForm {
  return {
    ...form,
    ...(profile.zip ? { zip: profile.zip, miles: profile.miles ?? DEFAULT_MILES } : {}),
    ...(profile.birthYear !== null ? { age: String(thisYear - profile.birthYear) } : {}),
    ...(profile.sex ? { sex: profile.sex } : {}),
    healthy: profile.healthyVolunteer,
    ...(!form.conditions.trim() && profile.conditions.length ? { conditions: profile.conditions.join(", ") } : {}),
  };
}

const split = (s: string) =>
  s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

const typedAge = (age: string): number | null => (/^\d{1,3}$/.test(age.trim()) && isAge(Number(age.trim())) ? Number(age.trim()) : null);

/** The Search criteria typed so far. A half-typed ZIP code or age is left out rather than treated as an error. */
export function criteriaOf(form: CriteriaForm): CriteriaInput {
  return {
    conditions: split(form.conditions),
    terms: split(form.terms),
    phases: form.phases,
    statuses: form.statuses,
    kinds: form.kinds,
    near: isZip(form.zip.trim()) ? { zip: form.zip.trim(), miles: form.miles } : null,
    age: typedAge(form.age),
    sex: form.sex || null,
    healthy: form.healthy,
    clinics: form.clinics,
  };
}

/** What stops the form being saved, in words for the Member; null when nothing does. */
export function formError(form: CriteriaForm): string | null {
  const criteria = criteriaOf(form);
  if (form.zip.trim() && !criteria.near) return BAD_ZIP;
  if (form.age.trim() && criteria.age === null) return BAD_AGE;
  if (!narrows(criteria)) return NEEDS_NARROWING;
  return null;
}
