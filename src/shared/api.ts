/** Types shared by the Worker and the browser. Names follow CONTEXT.md. */

export const PHASES = ["EARLY_PHASE1", "PHASE1", "PHASE2", "PHASE3", "PHASE4", "NA"] as const;
export type Phase = (typeof PHASES)[number];

/** The recruitment statuses a Watch may ask for: the ones where someone could still take part. */
export const STATUSES = ["RECRUITING", "NOT_YET_RECRUITING", "ENROLLING_BY_INVITATION"] as const;
export type Status = (typeof STATUSES)[number];

/**
 * The kinds of study a Watch may ask for: what is tested, as ClinicalTrials.gov's intervention
 * types name it, or OBSERVATIONAL for a study that gives nothing and only watches. A Trial can
 * also be RADIATION, GENETIC, COMBINATION_PRODUCT or OTHER; those are shown but not offered,
 * as too few healthy-volunteer Trials are of those kinds to be worth a choice.
 */
export const KINDS = ["DRUG", "BIOLOGICAL", "DEVICE", "DIETARY_SUPPLEMENT", "BEHAVIORAL", "PROCEDURE", "DIAGNOSTIC_TEST", "OBSERVATIONAL"] as const;
export type Kind = (typeof KINDS)[number];

export type Criteria = {
  /** Diseases or conditions, OR'ed. */
  conditions: string[];
  /** Free-text keywords such as drug names, OR'ed. */
  terms: string[];
  /** Empty means any phase. */
  phases: Phase[];
  /** Empty means any of STATUSES. */
  statuses: Status[];
  /** Empty means any kind of study; several are OR'ed. */
  kinds: Kind[];
  /** Only Trials with a site within `miles` of a US ZIP code; null means anywhere. */
  near: Near | null;
  /** Only Trials open to someone of this age (years); null means any age. */
  age: number | null;
  /** Only Trials open to this sex; null means anyone. */
  sex: Sex | null;
  /** Only Trials that take healthy volunteers. */
  healthy: boolean;
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
  /**
   * What kind of study it is: the distinct intervention types (DRUG, DEVICE, …), or just
   * ["OBSERVATIONAL"]. Absent on Alerts made before this was kept, and when the listing names none.
   */
  kinds?: string[];
  conditions: string[];
  sponsor: string;
  minimumAge: string;
  maximumAge: string;
  locations: string[];
  /** The site closest to the Watch's ZIP code, when the Watch has one. */
  nearest?: { place: string; miles: number } | null;
  /** Who can join, when the study says more than an age range. Absent on Alerts made before this was kept. */
  eligibility?: Eligibility;
  url: string;
};

/** The study's own entry criteria: its wording, never rewritten. Kept on Alerts, left out of lists. */
export type Eligibility = {
  /** "ALL", "FEMALE" or "MALE", as ClinicalTrials.gov gives it. */
  sex: string;
  healthyVolunteers: boolean | null;
  /** The study's criteria text, cut off at a sensible length. */
  criteria: string;
};

/** A Member's own facts, which only they see. Every field is optional. */
export type Profile = {
  birthYear: number | null;
  sex: Sex | null;
  /** Where "near you" is, and how far they would travel. */
  zip: string | null;
  miles: number | null;
  healthyVolunteer: boolean;
  conditions: string[];
};

export type Me = { memberId: string; email: string };

/** A Member as other Members see them: an email address and how they joined. */
export type MemberItem = { id: string; email: string; since: string; invitedBy: string | null; isYou: boolean };
/** `canChange` is false until inviting and removing are switched on for this deployment. */
export type MemberList = { members: MemberItem[]; canChange: boolean };

export type Watch = {
  id: string;
  name: string;
  criteria: Criteria;
  private: boolean;
  isOwner: boolean;
  following: boolean;
  /** ClinicalTrials.gov hasn't answered for this Watch in over a day, so it may be missing Trials. */
  failing: boolean;
};

export type WatchInput = { name: string; criteria: Criteria; private: boolean };

export const MARKS = ["interested", "not_for_me"] as const;
/** How a Member has sorted an Alert. Only they see it. */
export type Mark = (typeof MARKS)[number];
export const MAX_NOTE_CHARS = 1000;

export type AlertItem = {
  kind: "alert";
  id: string;
  trial: Trial;
  /** The Member's Watches that found the Trial; empty when another Member sent it. */
  watchNames: string[];
  createdAt: string;
  read: boolean;
  mark: Mark | null;
  /** The Member's own private note on this Trial. */
  note: string;
  /** The email of the Member who sent this Alert, when a Watch didn't find it. */
  sentBy: string | null;
  /** The latest Update: what changed about the Trial since the Alert, and when. */
  update: { at: string; changes: string[] } | null;
  /** Found through a Private watch of this Member's. Sending it on shares the Trial, not the Watch. */
  viaPrivateWatch: boolean;
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
