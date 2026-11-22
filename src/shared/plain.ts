/**
 * Key facts about a Trial in plain words, for volunteers, not clinicians. Hand-written rules,
 * not generated text, so nothing here can misstate a medical fact.
 */
import type { Mark } from "./api";
import type { Kind, Phase, Status, Trial } from "./api";

export const PHASE_LABELS: Record<Phase, string> = {
  EARLY_PHASE1: "Early phase 1",
  PHASE1: "Phase 1",
  PHASE2: "Phase 2",
  PHASE3: "Phase 3",
  PHASE4: "Phase 4",
  NA: "No phase",
};

const PHASE_MEANINGS: Record<string, string> = {
  EARLY_PHASE1: "a very small first test in people",
  PHASE1: "first tests of safety and dose in a small group",
  PHASE2: "testing whether it works and is safe in a larger group",
  PHASE3: "comparing it against the usual treatment in many people",
  PHASE4: "studying a treatment that is already approved",
  NA: "phases are mainly for drug trials",
};

export const STATUS_LABELS: Record<Status, string> = {
  RECRUITING: "Recruiting now",
  NOT_YET_RECRUITING: "Not recruiting yet",
  ENROLLING_BY_INVITATION: "By invitation only",
};

/**
 * What a study is about, in a few words, for the Watch form and the Alert page. Every kind
 * ClinicalTrials.gov uses is here; anything newer falls back to its own name.
 */
export const KIND_LABELS: Record<Kind | "RADIATION" | "GENETIC" | "COMBINATION_PRODUCT" | "OTHER", string> = {
  DRUG: "Tests a drug",
  BIOLOGICAL: "Tests a vaccine or biological",
  DEVICE: "Tests a device",
  DIETARY_SUPPLEMENT: "Tests a supplement",
  BEHAVIORAL: "Behavioural (an app, course or counselling)",
  PROCEDURE: "Involves a procedure",
  DIAGNOSTIC_TEST: "Tests a diagnostic",
  OBSERVATIONAL: "Observation only: nothing is given to you",
  RADIATION: "Involves radiation",
  GENETIC: "Genetic (e.g. gene transfer or stem cells)",
  COMBINATION_PRODUCT: "Tests a drug and device combined",
  OTHER: "Something else (the listing says what)",
};

/** One or two words for each kind, for the short line of facts under a Trial's title. */
const KIND_SHORT: Record<keyof typeof KIND_LABELS, string> = {
  DRUG: "drug",
  BIOLOGICAL: "vaccine or biological",
  DEVICE: "device",
  DIETARY_SUPPLEMENT: "supplement",
  BEHAVIORAL: "behavioural",
  PROCEDURE: "procedure",
  DIAGNOSTIC_TEST: "diagnostic test",
  OBSERVATIONAL: "observation only",
  RADIATION: "radiation",
  GENETIC: "genetic",
  COMBINATION_PRODUCT: "drug-device",
  OTHER: "other",
};

/** The order kinds are named in: what a volunteer would most want to know first. */
const KIND_ORDER = Object.keys(KIND_LABELS);
const rank = (k: string) => (KIND_ORDER.includes(k) ? KIND_ORDER.indexOf(k) : KIND_ORDER.length);
const fallback = (k: string) => k.toLowerCase().replace(/_/g, " ");
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Tests a drug; Involves a procedure", for the Alert page; null when the listing doesn't say. */
export function kindText(kinds: string[] | undefined): string | null {
  if (!kinds?.length) return null;
  return [...kinds]
    .sort((a, b) => rank(a) - rank(b))
    .map((k) => KIND_LABELS[k as keyof typeof KIND_LABELS] ?? capital(fallback(k)))
    .join("; ");
}

/**
 * "Drug study", "Drug and device study", "Drug, device and more", or "Observation only": short
 * enough for a phone's line of facts. "Other" is left out next to a real kind, as it says nothing.
 */
export function kindShort(kinds: string[] | undefined): string | null {
  if (!kinds?.length) return null;
  if (kinds.includes("OBSERVATIONAL")) return "Observation only";
  const named = [...kinds].filter((k) => k !== "OTHER" || kinds.length === 1).sort((a, b) => rank(a) - rank(b));
  if (named.length === 1 && named[0] === "OTHER") return "Other kind of study";
  const words = named.map((k) => KIND_SHORT[k as keyof typeof KIND_SHORT] ?? fallback(k));
  if (words.length === 1) return capital(`${words[0]} study`);
  if (words.length === 2) return capital(`${words[0]} and ${words[1]} study`);
  return capital(`${words[0]}, ${words[1]} and more`);
}

/** "Drug or device studies": the kinds a Watch asks for, in one phrase; null for any kind. */
export function kindsWanted(kinds: Kind[]): string | null {
  if (!kinds.length) return null;
  const words = [...kinds].sort((a, b) => rank(a) - rank(b)).map((k) => (k === "OBSERVATIONAL" ? "observational" : KIND_SHORT[k]));
  // "Drug, device or observational": commas keep three or more readable.
  const list = words.length > 1 ? `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}` : words[0];
  return capital(`${list} studies`);
}

/** "Phase 3 (comparing it against the usual treatment in many people)", or "Phase 1/2 (…)" for combined phases. */
export function phaseText(phases: string[]): string | null {
  if (!phases.length) return null;
  if (phases.length === 1) {
    const p = phases[0]!;
    const label = PHASE_LABELS[p as Phase] ?? p;
    const meaning = PHASE_MEANINGS[p];
    return meaning ? `${label} (${meaning})` : label;
  }
  const numbers = phases.map((p) => p.replace(/^PHASE/, "")).join("/");
  const last = PHASE_MEANINGS[phases[phases.length - 1]!];
  return last ? `Phase ${numbers} (combines steps, up to ${last})` : `Phase ${numbers}`;
}

export function statusText(status: string): string {
  return STATUS_LABELS[status as Status] ?? status.toLowerCase().replace(/_/g, " ");
}

/** "18 Years", "6 Months" → "18", "6 months"; ClinicalTrials.gov writes ages with units. */
function age(value: string): string {
  const m = /^(\d+)\s+(\w+)$/.exec(value.trim());
  if (!m) return value;
  return /^years?$/i.test(m[2]!) ? m[1]! : `${m[1]} ${m[2]!.toLowerCase()}`;
}

export function agesText(min: string, max: string): string | null {
  if (min && max) return `Ages ${age(min)}–${age(max)}`;
  if (min) return `Ages ${age(min)} and up`;
  if (max) return `Ages up to ${age(max)}`;
  return null;
}

export function locationsText(locations: string[], shown = 3): string | null {
  if (!locations.length) return null;
  const more = locations.length > shown ? ` and ${locations.length - shown} more` : "";
  return locations.slice(0, shown).join("; ") + more;
}

export function nearestText(trial: Trial): string | null {
  if (!trial.nearest) return null;
  const miles = trial.nearest.miles < 1 ? "under 1 mi" : `${trial.nearest.miles} mi`;
  return `Nearest site: ${trial.nearest.place}, ${miles}`;
}

/** The short line of facts shown under a Trial's title. */
export function keyFacts(trial: Trial): string[] {
  // "No phase" adds nothing once the kind of study is shown, and the line is short on a phone.
  const noPhase = trial.phases.length === 1 && trial.phases[0] === "NA";
  const phase = noPhase && trial.kinds?.length ? null : phaseText(trial.phases);
  return [statusText(trial.status), nearestText(trial), kindShort(trial.kinds), phase, agesText(trial.minimumAge, trial.maximumAge)].filter(
    (s): s is string => !!s,
  );
}

/** One part of a study's entry criteria, as bullet points in the study's own words. */
export type CriteriaSection = { kind: "include" | "exclude" | "other"; items: string[] };

/**
 * Splits a study's criteria text into "can join" and "can't join" lists. The words are the
 * study's own: this only finds the headings and bullet points ClinicalTrials.gov listings use.
 * Text with no bullet points comes back as one "other" section of paragraphs.
 */
export function criteriaSections(text: string): CriteriaSection[] {
  const sections: CriteriaSection[] = [];
  let current: CriteriaSection = { kind: "other", items: [] };
  const last = () => current.items.length - 1;
  // Listings escape some characters with backslashes, e.g. "\>45".
  for (const raw of text.replace(/\\([<>*_[\]#~-])/g, "$1").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const heading = /^(?:key\s+)?(inclusion|exclusion)\s+criteria\b[^a-z]*$/i.exec(line);
    if (heading) {
      if (current.items.length) sections.push(current);
      current = { kind: heading[1]!.toLowerCase() === "inclusion" ? "include" : "exclude", items: [] };
      continue;
    }
    const bullet = /^(?:[*•·-]|\d{1,2}[.)])\s+(.*)$/.exec(line);
    const nested = !!bullet && /^\s{2,}/.test(raw);
    if (bullet && nested && current.items.length) {
      // A sub-point joins its parent: "Serious disease: relapses; rapid decline".
      const parent = current.items[last()]!.replace(/\s*:$/, ":");
      current.items[last()] = `${parent}${parent.endsWith(":") ? "" : ";"} ${bullet[1]}`;
    } else if (bullet) current.items.push(bullet[1]!);
    else if (current.items.length && current.kind !== "other") current.items[last()] += ` ${line}`;
    else current.items.push(line);
  }
  if (current.items.length) sections.push(current);
  return sections.map((s) => ({ ...s, items: s.items.map((i) => i.replace(/[;,]$/, "").trim()).filter(Boolean) }));
}

/** "Women only", "Men only", or null when anyone can join. */
export function sexText(sex: string): string | null {
  return sex === "FEMALE" ? "Women only" : sex === "MALE" ? "Men only" : null;
}

/** The words on the buttons a Member sorts their Alerts with. */
export const MARK_LABELS: Record<Mark, string> = { interested: "Interested", not_for_me: "Not for me" };

/** Orders Trials by their nearest site, closest first; Trials with no measured distance go last. */
export function byNearest(a: Trial, b: Trial): number {
  return (a.nearest?.miles ?? Infinity) - (b.nearest?.miles ?? Infinity);
}
