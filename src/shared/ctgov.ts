/**
 * The ClinicalTrials.gov API v2 (https://clinicaltrials.gov/data-api/api): turning a Watch's
 * Criteria into a query, and a study record into a Trial. Every query form used here was checked
 * against the live API on 2026-11-22.
 */
import { DISTANCES, KINDS, PHASES, SEXES, STATUSES, type Criteria, type CriteriaInput, type Kind, type Near, type Phase, type Sex, type Status, type Trial } from "./api";

export const API_URL = "https://clinicaltrials.gov/api/v2/studies";
const STUDY_URL = "https://clinicaltrials.gov/study/";
const USER_AGENT = "GuineaPing/0.1 (+https://github.com/kogneto/GuineaPing)";

const FIELDS = [
  "NCTId",
  "BriefTitle",
  "BriefSummary",
  "StudyFirstPostDate",
  "OverallStatus",
  "Phase",
  "StudyType",
  "InterventionType",
  "Condition",
  "LeadSponsorName",
  "MinimumAge",
  "MaximumAge",
  "Sex",
  "HealthyVolunteers",
  "EligibilityCriteria",
  "LocationCity",
  "LocationState",
  "LocationCountry",
  "LocationGeoPoint",
].join(",");

export type FetchJson = (url: string) => Promise<unknown>;

export const fetchJson: FetchJson = async (url) => {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!res.ok) throw new Error(`ClinicalTrials.gov answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
};

/**
 * Quotes one search term so the API treats it as a phrase. Parentheses, quotes and stray
 * AND/OR otherwise change the query's meaning or make the API reject it outright.
 */
export function quoteTerm(term: string): string | null {
  const cleaned = term.replace(/["()\[\]]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? `"${cleaned}"` : null;
}

function anyOf(terms: string[]): string | null {
  const quoted = terms.map(quoteTerm).filter((t): t is string => t !== null);
  return quoted.length ? quoted.join(" OR ") : null;
}

/** Fills in fields added after a Watch was saved, so older Watches keep working. */
export function withDefaults(c: Partial<Criteria>): Criteria {
  return { conditions: [], terms: [], phases: [], statuses: [], kinds: [], near: null, age: null, sex: null, healthy: false, ...c };
}

/**
 * Keeps only criteria the API understands, trimmed and de-duplicated. `near` comes back without
 * coordinates: the Worker looks the ZIP code up before the Criteria are used.
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
  const badPhase = phases.find((p) => !(PHASES as readonly string[]).includes(p));
  if (badPhase) return { error: `Unknown phase ${badPhase}` };
  const badStatus = statuses.find((s) => !(STATUSES as readonly string[]).includes(s));
  if (badStatus) return { error: `Unknown status ${badStatus}` };
  // An unknown kind would make ClinicalTrials.gov refuse the whole query, so the Watch would never find anything.
  const badKind = kinds.find((k) => !(KINDS as readonly string[]).includes(k));
  if (badKind) return { error: `Unknown kind of study ${badKind}` };

  let near: CriteriaInput["near"] = null;
  if (raw.near != null) {
    const n = raw.near as { zip?: unknown; miles?: unknown };
    const zip = typeof n.zip === "string" ? n.zip.trim() : "";
    if (!/^\d{5}$/.test(zip)) return { error: "Enter a 5-digit US ZIP code" };
    if (!(DISTANCES as readonly number[]).includes(n.miles as number)) return { error: "Pick one of the distances offered" };
    near = { zip, miles: n.miles as number };
  }
  let age: number | null = null;
  if (raw.age != null && raw.age !== "") {
    age = Number(raw.age);
    if (!Number.isInteger(age) || age < 0 || age > 120) return { error: "Enter an age in whole years, 0 to 120" };
  }
  let sex: Sex | null = null;
  if (raw.sex != null && raw.sex !== "") {
    if (!(SEXES as readonly unknown[]).includes(raw.sex)) return { error: `Unknown sex ${String(raw.sex)}` };
    sex = raw.sex as Sex;
  }
  const healthy = raw.healthy === true;
  // Something has to narrow the search. Words do; so does "healthy volunteers near here", which is
  // what a volunteer with no condition wants. Healthy volunteers anywhere would be every such Trial.
  const hasWords = conditions.some(quoteTerm) || terms.some(quoteTerm);
  if (!hasWords && !(healthy && near)) return { error: "A Watch needs a condition or keyword, or healthy volunteers with a ZIP code" };
  return { conditions, terms, phases: phases as Phase[], statuses: statuses as Status[], kinds: kinds as Kind[], near, age, sex, healthy };
}

/**
 * Age and sex, as ClinicalTrials.gov's search understands them (checked against the live API):
 * a Trial with no minimum or maximum age has no limit on that side, and `AREA[Sex]ALL` matches
 * every Trial, so "open to women" is "not male-only".
 */
function eligibilityFilters(c: Criteria): string[] {
  const out: string[] = [];
  if (c.age !== null) {
    out.push(`(AREA[MinimumAge]RANGE[MIN, ${c.age} years] OR NOT AREA[MinimumAge]RANGE[MIN, MAX])`);
    out.push(`(AREA[MaximumAge]RANGE[${c.age} years, MAX] OR NOT AREA[MaximumAge]RANGE[MIN, MAX])`);
  }
  if (c.sex === "FEMALE") out.push("NOT AREA[Sex]MALE");
  if (c.sex === "MALE") out.push("NOT AREA[Sex]FEMALE");
  if (c.healthy) out.push("AREA[HealthyVolunteers]true");
  return out;
}

/**
 * The kinds of study asked for, as one filter, or null for any kind. Checked against the live API
 * on 2026-11-22 (healthy-volunteer Trials still open to joining):
 * - `AREA[StudyType]OBSERVATIONAL` and `AREA[InterventionType](DRUG OR DEVICE)` both work, the
 *   latter matching a Trial with any of the types (2,928 drug + 2,057 device − 115 both = 4,870).
 * - Observational listings can name intervention types too (NCT05044689 is observational with a
 *   "device"), so the types only count for interventional studies. That keeps the filter in step
 *   with `kindsOf`, which calls every observational study just that.
 * - "Observation only or a drug" is
 *   `(AREA[StudyType]OBSERVATIONAL OR (AREA[StudyType]INTERVENTIONAL AND AREA[InterventionType](DRUG)))`:
 *   6,324 + 2,928 = 9,252, as the two never overlap.
 * - A value the API doesn't know gets a 400 for the whole query, hence the check in normalizeCriteria.
 */
function kindFilter(kinds: Kind[]): string | null {
  const types = kinds.filter((k) => k !== "OBSERVATIONAL");
  const parts: string[] = [];
  if (kinds.includes("OBSERVATIONAL")) parts.push("AREA[StudyType]OBSERVATIONAL");
  if (types.length) parts.push(`(AREA[StudyType]INTERVENTIONAL AND AREA[InterventionType](${types.join(" OR ")}))`);
  if (!parts.length) return null;
  return parts.length > 1 ? `(${parts.join(" OR ")})` : parts[0]!;
}

/** Query parameters for Trials matching `criteria` first posted on or after `since` (YYYY-MM-DD). */
export function buildParams(criteria: Criteria, since: string): Record<string, string> {
  const advanced = [`AREA[StudyFirstPostDate]RANGE[${since},MAX]`];
  if (criteria.phases.length) advanced.push(`AREA[Phase](${criteria.phases.join(" OR ")})`);
  const kinds = kindFilter(criteria.kinds);
  if (kinds) advanced.push(kinds);
  advanced.push(...eligibilityFilters(criteria));
  const params: Record<string, string> = {
    format: "json",
    fields: FIELDS,
    sort: "StudyFirstPostDate:desc",
    "filter.advanced": advanced.join(" AND "),
    "filter.overallStatus": (criteria.statuses.length ? criteria.statuses : STATUSES).join(","),
  };
  const cond = anyOf(criteria.conditions);
  if (cond) params["query.cond"] = cond;
  const term = anyOf(criteria.terms);
  if (term) params["query.term"] = term;
  if (criteria.near) params["filter.geo"] = `distance(${criteria.near.lat},${criteria.near.lon},${criteria.near.miles}mi)`;
  return params;
}

export type Site = { place: string; short: string; lat: number; lon: number };

export type FindOptions = {
  pageSize?: number;
  maxPages?: number;
  /** Where to measure "nearest site" from when the Criteria have no ZIP code of their own. */
  nearestTo?: Near | null;
  /** Filled with each found Trial's sites, for callers that measure distances per Member. */
  sites?: Map<string, Site[]>;
};

/** The site closest to any of these points, or null when there is none to measure. */
export function nearestOf(sites: Site[], points: { lat: number; lon: number }[]): { place: string; miles: number } | null {
  let nearest: { place: string; miles: number } | null = null;
  for (const site of sites) {
    for (const point of points) {
      const miles = Math.round(milesBetween(point, site));
      if (!nearest || miles < nearest.miles) nearest = { place: site.short, miles };
    }
  }
  return nearest;
}

/**
 * Every Trial matching `criteria` first posted on or after `since`, newest first, following
 * nextPageToken. Stops after `maxPages` pages so one over-broad Watch can't exhaust a Check.
 */
export async function findTrials(
  criteria: Criteria,
  since: string,
  get: FetchJson,
  { pageSize = 100, maxPages = 5, nearestTo = null, sites }: FindOptions = {},
): Promise<Trial[]> {
  const base = { ...buildParams(criteria, since), pageSize: String(pageSize) };
  const trials: Trial[] = [];
  let token: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams(token ? { ...base, pageToken: token } : base);
    const data = (await get(`${API_URL}?${params}`)) as { studies?: unknown[]; nextPageToken?: string };
    for (const study of data.studies ?? []) {
      const trial = toTrial(study, criteria.near ?? nearestTo);
      if (!trial) continue;
      trials.push(trial);
      sites?.set(trial.nctId, sitesOf(study));
    }
    token = data.nextPageToken;
    if (!token) break;
  }
  return trials;
}

type Study = {
  protocolSection?: {
    identificationModule?: { nctId?: string; briefTitle?: string };
    descriptionModule?: { briefSummary?: string };
    statusModule?: { overallStatus?: string; studyFirstPostDateStruct?: { date?: string } };
    designModule?: { phases?: string[]; studyType?: string };
    armsInterventionsModule?: { interventions?: { type?: string }[] };
    conditionsModule?: { conditions?: string[] };
    sponsorCollaboratorsModule?: { leadSponsor?: { name?: string } };
    eligibilityModule?: { minimumAge?: string; maximumAge?: string; sex?: string; healthyVolunteers?: boolean; eligibilityCriteria?: string };
    contactsLocationsModule?: { locations?: { city?: string; state?: string; country?: string; geoPoint?: { lat?: number; lon?: number } }[] };
  };
};

/** Criteria text beyond this is cut; the listing itself has the rest. Keeps stored Alerts small. */
export const MAX_CRITERIA_CHARS = 6000;

/** A Trial as lists show it: without the long eligibility text, which only an Alert's own page uses. */
export const forList = ({ eligibility: _, ...trial }: Trial): Trial => trial;

/** Great-circle distance in miles. */
export function milesBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * What kind of study a listing is: ["OBSERVATIONAL"] when nothing is given to the people in it,
 * otherwise each intervention type once, in the listing's order. Empty when the listing names none.
 */
export function kindsOf(raw: unknown): string[] {
  const ps = (raw as Study).protocolSection ?? {};
  if (ps.designModule?.studyType === "OBSERVATIONAL") return ["OBSERVATIONAL"];
  const types = (ps.armsInterventionsModule?.interventions ?? []).map((i) => i.type).filter((t): t is string => !!t);
  return [...new Set(types)];
}

export function toTrial(raw: unknown, near?: Near | null): Trial | null {
  const ps = (raw as Study).protocolSection ?? {};
  const nctId = ps.identificationModule?.nctId ?? "";
  if (!/^NCT\d{8}$/.test(nctId)) return null;
  const locations: string[] = [];
  let nearest: Trial["nearest"] = null;
  for (const loc of ps.contactsLocationsModule?.locations ?? []) {
    const place = [loc.city, loc.state, loc.country].filter(Boolean).join(", ");
    if (place && !locations.includes(place)) locations.push(place);
    const g = loc.geoPoint;
    if (near && g && typeof g.lat === "number" && typeof g.lon === "number") {
      const miles = Math.round(milesBetween(near, { lat: g.lat, lon: g.lon }));
      if (!nearest || miles < nearest.miles) nearest = { place: [loc.city, loc.state].filter(Boolean).join(", ") || place, miles };
    }
  }
  const kinds = kindsOf(raw);
  return {
    nctId,
    title: ps.identificationModule?.briefTitle ?? nctId,
    summary: ps.descriptionModule?.briefSummary ?? "",
    firstPosted: ps.statusModule?.studyFirstPostDateStruct?.date ?? "",
    status: ps.statusModule?.overallStatus ?? "",
    phases: ps.designModule?.phases ?? [],
    ...(kinds.length ? { kinds } : {}),
    conditions: ps.conditionsModule?.conditions ?? [],
    sponsor: ps.sponsorCollaboratorsModule?.leadSponsor?.name ?? "",
    minimumAge: ps.eligibilityModule?.minimumAge ?? "",
    maximumAge: ps.eligibilityModule?.maximumAge ?? "",
    locations,
    ...(near ? { nearest } : {}),
    eligibility: {
      sex: ps.eligibilityModule?.sex ?? "",
      healthyVolunteers: ps.eligibilityModule?.healthyVolunteers ?? null,
      criteria: (ps.eligibilityModule?.eligibilityCriteria ?? "").slice(0, MAX_CRITERIA_CHARS),
    },
    url: STUDY_URL + nctId,
  };
}

/** A study site with its coordinates. `place` matches Trial.locations; `short` is how it is named to a Member. */
export function sitesOf(raw: unknown): Site[] {
  const sites: Site[] = [];
  for (const loc of (raw as Study).protocolSection?.contactsLocationsModule?.locations ?? []) {
    const place = [loc.city, loc.state, loc.country].filter(Boolean).join(", ");
    const g = loc.geoPoint;
    if (place && g && typeof g.lat === "number" && typeof g.lon === "number") {
      sites.push({ place, short: [loc.city, loc.state].filter(Boolean).join(", ") || place, lat: g.lat, lon: g.lon });
    }
  }
  return sites;
}

/** How many NCT IDs go in one request. */
const IDS_PER_REQUEST = 100;

/**
 * Of the Trials named by `nctIds`, the ones ClinicalTrials.gov changed on or after `since`, as raw
 * study records keyed by NCT ID. (filter.ids and LastUpdatePostDate checked live on 2026-11-22.)
 */
export async function findUpdated(nctIds: string[], since: string, get: FetchJson): Promise<Map<string, unknown>> {
  const found = new Map<string, unknown>();
  for (let i = 0; i < nctIds.length; i += IDS_PER_REQUEST) {
    const params = new URLSearchParams({
      format: "json",
      fields: FIELDS,
      pageSize: String(IDS_PER_REQUEST),
      "filter.ids": nctIds.slice(i, i + IDS_PER_REQUEST).join(","),
      "filter.advanced": `AREA[LastUpdatePostDate]RANGE[${since},MAX]`,
    });
    const data = (await get(`${API_URL}?${params}`)) as { studies?: unknown[] };
    for (const study of data.studies ?? []) {
      const id = (study as Study).protocolSection?.identificationModule?.nctId;
      if (id) found.set(id, study);
    }
  }
  return found;
}
