/** Types shared by the Worker and the browser. Names follow CONTEXT.md. */
import type { OpeningMark } from "./openings";

export const PHASES = ["EARLY_PHASE1", "PHASE1", "PHASE2", "PHASE3", "PHASE4", "NA"] as const;
export type Phase = (typeof PHASES)[number];

/** The recruitment statuses a Watch may ask for: the ones where someone could still take part. */
export const STATUSES = ["RECRUITING", "NOT_YET_RECRUITING", "ENROLLING_BY_INVITATION"] as const;
export type Status = (typeof STATUSES)[number];

/**
 * The kinds of study a Watch can ask for. OBSERVATIONAL is a study that only observes the people
 * in it; the others are what an interventional study tests, named as ClinicalTrials.gov names
 * its intervention types. Listings use four more types (RADIATION, GENETIC, COMBINATION_PRODUCT,
 * OTHER): a Trial shows those, but they are too rare or too vague to be worth a choice here.
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
  /** Only Trials of one of these kinds; empty means any kind. */
  kinds: Kind[];
  /** Only Trials with a site within `miles` of a US ZIP code; null means anywhere. */
  near: Near | null;
  /** Only Trials open to someone of this age (years); null means any age. */
  age: number | null;
  /** Only Trials open to this sex; null means anyone. */
  sex: Sex | null;
  /** Only Trials that take healthy volunteers. */
  healthy: boolean;
  /** Only Trials with a site at one of these Clinics (ids from src/shared/clinics.ts); empty means any site. */
  clinics: string[];
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
   * The kinds of study this is: ["OBSERVATIONAL"], or the intervention types its listing names,
   * each once. Left out when the listing names none, and on Alerts made before this was kept.
   */
  kinds?: string[];
  conditions: string[];
  sponsor: string;
  minimumAge: string;
  maximumAge: string;
  locations: string[];
  /** The site closest to the Watch's ZIP code, when the Watch has one. */
  nearest?: { place: string; miles: number } | null;
  /** The Clinics GuineaPing knows that this Trial's sites name (ids from src/shared/clinics.ts). Left out when none. */
  clinics?: string[];
  /** How many Points to check its Entry criteria have. Only on Trials in lists, which leave the criteria out. */
  points?: number;
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
  /** Height in inches and weight in pounds, as the Member gives them. BMI is worked out, never stored. */
  heightIn: number | null;
  weightLb: number | null;
  /** Whether they use nicotine in any form; null when they haven't said. */
  nicotine: "yes" | "no" | null;
  /** The day of their last blood or plasma donation (YYYY-MM-DD). */
  lastDonationOn: string | null;
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
  /**
   * What the Watch can alert on. "all": every Trial it matched was recorded, so any Trial that
   * comes to match is new to it, however long ago it was posted. "recent": it matches too many to
   * record, so only newly posted Trials are new. Null: not worked out yet; the next Check does.
   */
  knows: "all" | "recent" | null;
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

/** One entry on a Clinic's own list of studies, in the Clinic's own words. Not a Trial. */
export type Opening = {
  id: string;
  title: string;
  /** Each of these is the Clinic's wording, at most with a label such as "Age" put in front; null when its list doesn't say. */
  pay: string | null;
  when: string | null;
  stay: string | null;
  who: string | null;
  code: string | null;
  /** The entry's own page on the Clinic's site, or the Clinic's list when entries have no page. */
  url: string;
  /** The day GuineaPing first saw it (YYYY-MM-DD), or saw it again after it had gone from the list. */
  firstSeen: string;
  /** How the signed-in Member has set it aside, if they have. Only they see it. */
  mark: OpeningMark | null;
  /** Whether it can be marked "Not for me": only an entry that carries a study code can. */
  canMarkStudy: boolean;
};

export type ClinicItem = {
  id: string;
  name: string;
  place: string;
  url: string;
  /** Miles from the Member's Profile ZIP code; null when they have given none. */
  miles: number | null;
  /** False for a Clinic whose site GuineaPing never visits: the Member reads it themselves. */
  read: boolean;
  /** When this Clinic's list was last read successfully; null if never, or if it isn't read. */
  lastReadAt: string | null;
  /** True when the Clinic's site has refused GuineaPing, so reading has stopped. */
  refused: boolean;
  openings: Opening[];
};
