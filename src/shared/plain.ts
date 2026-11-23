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
  NA: "not every study is run in phases",
};

export const STATUS_LABELS: Record<Status, string> = {
  RECRUITING: "Recruiting now",
  NOT_YET_RECRUITING: "Not recruiting yet",
  ENROLLING_BY_INVITATION: "By invitation only",
};

/**
 * How each kind of study is put to a volunteer: `label` in full, for the Watch form and the
 * Alert page, and `word` for the short line of facts. Kinds are always named in the order they
 * appear here, whatever order a listing has them in.
 */
const KIND_WORDS: Record<string, { label: string; word: string }> = {
  DRUG: { label: "Tests a drug", word: "drug" },
  BIOLOGICAL: { label: "Tests a vaccine or biological", word: "vaccine or biological" },
  DEVICE: { label: "Tests a device", word: "device" },
  DIETARY_SUPPLEMENT: { label: "Tests a supplement", word: "supplement" },
  BEHAVIORAL: { label: "Behavioural (an app, course or counselling)", word: "behavioural" },
  PROCEDURE: { label: "Involves a procedure", word: "procedure" },
  DIAGNOSTIC_TEST: { label: "Tests a diagnostic", word: "diagnostic" },
  RADIATION: { label: "Involves radiation", word: "radiation" },
  GENETIC: { label: "Genetic (such as gene transfer or stem cells)", word: "genetic" },
  COMBINATION_PRODUCT: { label: "Tests a drug and device together", word: "drug-and-device" },
  OTHER: { label: "Something else: see the listing", word: "other" },
  OBSERVATIONAL: { label: "Observation only: nothing is given to you", word: "observational" },
};
const KIND_ORDER = Object.keys(KIND_WORDS);

/** `kinds` in the order they are named in. A kind this file has no words for goes last. */
function inOrder(kinds: readonly string[]): string[] {
  const place = (k: string) => (KIND_ORDER.includes(k) ? KIND_ORDER.indexOf(k) : KIND_ORDER.length);
  return [...kinds].sort((a, b) => place(a) - place(b));
}

/** ClinicalTrials.gov's own name for a kind, made readable: "SOME_NEW_TYPE" becomes "some new type". */
const ownName = (kind: string) => kind.toLowerCase().replace(/_/g, " ");
const capitalised = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One kind of study in full: "Tests a drug". A kind ClinicalTrials.gov adds later shows under its own name. */
export function kindLabel(kind: string): string {
  return KIND_WORDS[kind]?.label ?? capitalised(ownName(kind));
}

/** Every kind a Trial is, in full, for its Alert page; null when its listing names none. */
export function kindsText(kinds: string[] | undefined): string | null {
  return kinds?.length ? inOrder(kinds).map(kindLabel).join("; ") : null;
}

/**
 * A Trial's kind in a few words, for the short line of facts: "Drug study", "Drug + device
 * study", "Observation only", and "Drug + device + more" past two, which is as much as fits on
 * a phone. Kinds are joined with "+" because one of them has an "or" in it: "Vaccine or
 * biological and device study" can be read two ways. "Other" tells a volunteer nothing, so it is
 * never named, and alone it gives null.
 */
export function kindFact(kinds: string[] | undefined): string | null {
  if (!kinds?.length) return null;
  if (kinds.includes("OBSERVATIONAL")) return "Observation only";
  const words = inOrder(kinds.filter((k) => k !== "OTHER")).map((k) => KIND_WORDS[k]?.word ?? ownName(k));
  if (!words.length) return null;
  if (words.length > 2) return capitalised(`${words[0]} + ${words[1]} + more`);
  return capitalised(`${words.join(" + ")} study`);
}

/** The kinds a Watch asks for, as one phrase: "Drug, device or observational studies". Null when it takes any kind. */
export function kindsAsked(kinds: Kind[]): string | null {
  if (!kinds.length) return null;
  const words = inOrder(kinds).map((k) => KIND_WORDS[k]!.word);
  const last = words.pop()!;
  return capitalised(`${words.length ? `${words.join(", ")} or ` : ""}${last} studies`);
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
  const kind = kindFact(trial.kinds);
  // "No phase" is only worth the room on a phone when there is no kind to show instead.
  const phase = kind && trial.phases.join() === "NA" ? null : phaseText(trial.phases);
  // The kind comes before the phase: it is the shorter of the two, and what a volunteer picks by.
  const points = trial.points ? (trial.points === 1 ? "1 point to check" : `${trial.points} points to check`) : null;
  return [statusText(trial.status), nearestText(trial), kind, phase, agesText(trial.minimumAge, trial.maximumAge), points].filter(
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
