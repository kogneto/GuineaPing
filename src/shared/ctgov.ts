/**
 * The ClinicalTrials.gov API v2 (https://clinicaltrials.gov/data-api/api): turning a Watch's
 * Criteria into a query, and a study record into a Trial. Every query form used here was checked
 * against the live API on 2026-11-22.
 */
import { DISTANCES, PHASES, SEXES, STATUSES, type Criteria, type CriteriaInput, type Near, type Phase, type Sex, type Status, type Trial } from "./api";

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
  "Condition",
  "LeadSponsorName",
  "MinimumAge",
  "MaximumAge",
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
  return { conditions: [], terms: [], phases: [], statuses: [], near: null, age: null, sex: null, ...c };
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
  const badPhase = phases.find((p) => !(PHASES as readonly string[]).includes(p));
  if (badPhase) return { error: `Unknown phase ${badPhase}` };
  const badStatus = statuses.find((s) => !(STATUSES as readonly string[]).includes(s));
  if (badStatus) return { error: `Unknown status ${badStatus}` };
  if (!conditions.some(quoteTerm) && !terms.some(quoteTerm)) return { error: "A Watch needs at least one condition or keyword" };

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
  return { conditions, terms, phases: phases as Phase[], statuses: statuses as Status[], near, age, sex };
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
  return out;
}

/** Query parameters for Trials matching `criteria` first posted on or after `since` (YYYY-MM-DD). */
export function buildParams(criteria: Criteria, since: string): Record<string, string> {
  const advanced = [`AREA[StudyFirstPostDate]RANGE[${since},MAX]`];
  if (criteria.phases.length) advanced.push(`AREA[Phase](${criteria.phases.join(" OR ")})`);
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

/**
 * Every Trial matching `criteria` first posted on or after `since`, newest first, following
 * nextPageToken. Stops after `maxPages` pages so one over-broad Watch can't exhaust a Check.
 */
export async function findTrials(
  criteria: Criteria,
  since: string,
  get: FetchJson,
  { pageSize = 100, maxPages = 5 }: { pageSize?: number; maxPages?: number } = {},
): Promise<Trial[]> {
  const base = { ...buildParams(criteria, since), pageSize: String(pageSize) };
  const trials: Trial[] = [];
  let token: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams(token ? { ...base, pageToken: token } : base);
    const data = (await get(`${API_URL}?${params}`)) as { studies?: unknown[]; nextPageToken?: string };
    for (const study of data.studies ?? []) {
      const trial = toTrial(study, criteria.near);
      if (trial) trials.push(trial);
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
    designModule?: { phases?: string[] };
    conditionsModule?: { conditions?: string[] };
    sponsorCollaboratorsModule?: { leadSponsor?: { name?: string } };
    eligibilityModule?: { minimumAge?: string; maximumAge?: string };
    contactsLocationsModule?: { locations?: { city?: string; state?: string; country?: string; geoPoint?: { lat?: number; lon?: number } }[] };
  };
};

/** Great-circle distance in miles. */
export function milesBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
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
  return {
    nctId,
    title: ps.identificationModule?.briefTitle ?? nctId,
    summary: ps.descriptionModule?.briefSummary ?? "",
    firstPosted: ps.statusModule?.studyFirstPostDateStruct?.date ?? "",
    status: ps.statusModule?.overallStatus ?? "",
    phases: ps.designModule?.phases ?? [],
    conditions: ps.conditionsModule?.conditions ?? [],
    sponsor: ps.sponsorCollaboratorsModule?.leadSponsor?.name ?? "",
    minimumAge: ps.eligibilityModule?.minimumAge ?? "",
    maximumAge: ps.eligibilityModule?.maximumAge ?? "",
    locations,
    ...(near ? { nearest } : {}),
    url: STUDY_URL + nctId,
  };
}
