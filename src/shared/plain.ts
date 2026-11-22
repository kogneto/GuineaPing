/**
 * Key facts about a Trial in plain words, for patients and family members. Hand-written rules,
 * not generated text, so nothing here can misstate a medical fact.
 */
import type { Phase, Status, Trial } from "./api";

export const PHASE_LABELS: Record<Phase, string> = {
  EARLY_PHASE1: "Early phase 1",
  PHASE1: "Phase 1",
  PHASE2: "Phase 2",
  PHASE3: "Phase 3",
  PHASE4: "Phase 4",
  NA: "Not a drug trial",
};

const PHASE_MEANINGS: Record<string, string> = {
  EARLY_PHASE1: "a very small first test in people",
  PHASE1: "first tests of safety and dose in a small group",
  PHASE2: "testing whether it works and is safe in a larger group",
  PHASE3: "comparing it against the usual treatment in many people",
  PHASE4: "studying a treatment that is already approved",
  NA: "e.g. a device, procedure or behaviour study",
};

export const STATUS_LABELS: Record<Status, string> = {
  RECRUITING: "Recruiting now",
  NOT_YET_RECRUITING: "Not recruiting yet",
  ENROLLING_BY_INVITATION: "By invitation only",
};

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
  return [statusText(trial.status), nearestText(trial), phaseText(trial.phases), agesText(trial.minimumAge, trial.maximumAge)].filter(
    (s): s is string => !!s,
  );
}
