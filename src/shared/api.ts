/** Types shared by the Worker and the browser. Names follow CONTEXT.md. */

export const PHASES = ["EARLY_PHASE1", "PHASE1", "PHASE2", "PHASE3", "PHASE4", "NA"] as const;
export type Phase = (typeof PHASES)[number];

/** The recruitment statuses a Watch may ask for: the ones where someone could still take part. */
export const STATUSES = ["RECRUITING", "NOT_YET_RECRUITING", "ENROLLING_BY_INVITATION"] as const;
export type Status = (typeof STATUSES)[number];

export type Criteria = {
  /** Diseases or conditions, OR'ed. */
  conditions: string[];
  /** Free-text keywords such as drug names, OR'ed. */
  terms: string[];
  /** Empty means any phase. */
  phases: Phase[];
  /** Empty means any of STATUSES. */
  statuses: Status[];
  /** Only Trials with a site within `miles` of a US ZIP code; null means anywhere. */
  near: Near | null;
  /** Only Trials open to someone of this age (years); null means any age. */
  age: number | null;
  /** Only Trials open to this sex; null means anyone. */
  sex: Sex | null;
};

export const DISTANCES = [10, 25, 50, 100, 250] as const;
export const SEXES = ["FEMALE", "MALE"] as const;
export type Sex = (typeof SEXES)[number];

/** A ZIP code and radius. lat/lon are filled in by the server from its ZIP table. */
export type Near = { zip: string; miles: number; lat: number; lon: number };

/** Criteria as the browser sends them: `near` without coordinates. */
export type CriteriaInput = Omit<Criteria, "near"> & { near: { zip: string; miles: number } | null };

/** A Trial as GuineaPing stores and shows it. */
export type Trial = {
  nctId: string;
  title: string;
  summary: string;
  firstPosted: string;
  status: string;
  phases: string[];
  conditions: string[];
  sponsor: string;
  minimumAge: string;
  maximumAge: string;
  locations: string[];
  /** The site closest to the Watch's ZIP code, when the Watch has one. */
  nearest?: { place: string; miles: number } | null;
  url: string;
};

export type Me = { memberId: string; email: string };

export type Watch = {
  id: string;
  name: string;
  criteria: Criteria;
  private: boolean;
  isOwner: boolean;
  following: boolean;
};

export type WatchInput = { name: string; criteria: Criteria; private: boolean };

export type AlertItem = {
  kind: "alert";
  id: string;
  trial: Trial;
  watchNames: string[];
  createdAt: string;
  read: boolean;
};

/** A one-time message in the Alert list, e.g. that a followed Watch is gone. */
export type NoteItem = {
  kind: "note";
  id: string;
  message: string;
  createdAt: string;
  read: boolean;
};

export type AlertListItem = AlertItem | NoteItem;

/** When the last successful Check finished; `stale` once Checks have been failing for over a day. */
export type CheckStatus = { lastCheckedAt: string | null; stale: boolean };

/** A Device as its Member sees it. Push endpoints and keys stay on the server. */
export type Device = { id: string; label: string; createdAt: string; lastSentAt: string | null; thisDevice: boolean };
