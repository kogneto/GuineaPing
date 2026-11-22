/**
 * The ClinicalTrials.gov API v2 (https://clinicaltrials.gov/data-api/api): turning a Watch's
 * Criteria into a query, and a study record into a Trial. Every query form used here was checked
 * against the live API on 2026-11-22.
 */
import { PHASES, STATUSES, type Criteria, type Phase, type Status, type Trial } from "./api";

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

/** Keeps only criteria the API understands, trimmed and de-duplicated. */
export function normalizeCriteria(input: unknown): Criteria | { error: string } {
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
  return { conditions, terms, phases: phases as Phase[], statuses: statuses as Status[] };
}

/** Query parameters for Trials matching `criteria` first posted on or after `since` (YYYY-MM-DD). */
export function buildParams(criteria: Criteria, since: string): Record<string, string> {
  const advanced = [`AREA[StudyFirstPostDate]RANGE[${since},MAX]`];
  if (criteria.phases.length) advanced.push(`AREA[Phase](${criteria.phases.join(" OR ")})`);
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
      const trial = toTrial(study);
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
    contactsLocationsModule?: { locations?: { city?: string; state?: string; country?: string }[] };
  };
};

export function toTrial(raw: unknown): Trial | null {
  const ps = (raw as Study).protocolSection ?? {};
  const nctId = ps.identificationModule?.nctId ?? "";
  if (!/^NCT\d{8}$/.test(nctId)) return null;
  const locations: string[] = [];
  for (const loc of ps.contactsLocationsModule?.locations ?? []) {
    const place = [loc.city, loc.state, loc.country].filter(Boolean).join(", ");
    if (place && !locations.includes(place)) locations.push(place);
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
    url: STUDY_URL + nctId,
  };
}
