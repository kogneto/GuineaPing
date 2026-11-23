/**
 * Waiting periods: how long a Member waits after one study before joining another. Clinics count
 * from the end of the last study; a Trial's own rules count from the last dose taken. So both
 * dates are asked for, the later one is used, and 30 days is only the usual number
 * (docs/research/paid-study-sources.md, section 5). GuineaPing cannot check any registry: this is
 * the Member's own reminder, worked out from what they typed.
 */

import { addDays, isDay } from "./days";

export const DEFAULT_WAIT_DAYS = 30;
export const MAX_WAIT_DAYS = 365;
export const MAX_LABEL_CHARS = 100;
/** How many Past studies one Member may keep. */
export const MAX_PAST_STUDIES = 50;

/** A study a Member took part in, as only they see it. Dates are plain days, YYYY-MM-DD. */
export type PastStudy = {
  id: string;
  /** Whatever the Member calls it: a Clinic, a study code. May be empty. */
  label: string;
  /** The last day of the study: the final visit or check-out. */
  endedOn: string;
  /** The last day they took the study drug, if they know it. */
  lastDoseOn: string | null;
  waitDays: number;
  /** The first day after the waiting period. */
  freeOn: string;
};

export type PastStudyInput = { label: string; endedOn: string; lastDoseOn: string | null; waitDays: number };

/** The first day after the waiting period: the later of the two dates, plus the wait. */
export function freeOn(endedOn: string, lastDoseOn: string | null, waitDays: number): string {
  return addDays(lastDoseOn && lastDoseOn > endedOn ? lastDoseOn : endedOn, waitDays);
}

/** Checks what a Member typed. `today` bounds the dates: nothing over 10 years back or a year ahead. */
export function normalizePastStudy(input: unknown, today: string): PastStudyInput | { error: string } {
  const raw = (input ?? {}) as Record<string, unknown>;
  const label = typeof raw.label === "string" ? raw.label.trim().slice(0, MAX_LABEL_CHARS) : "";
  const inRange = (day: string) => day >= addDays(today, -3650) && day <= addDays(today, 365);
  if (!isDay(raw.endedOn) || !inRange(raw.endedOn)) return { error: "Enter the day the study ended" };
  let lastDoseOn: string | null = null;
  if (raw.lastDoseOn != null && raw.lastDoseOn !== "") {
    if (!isDay(raw.lastDoseOn) || !inRange(raw.lastDoseOn)) return { error: "Enter the day of your last dose, or leave it empty" };
    lastDoseOn = raw.lastDoseOn;
  }
  const waitDays = raw.waitDays == null || raw.waitDays === "" ? DEFAULT_WAIT_DAYS : Number(raw.waitDays);
  if (!Number.isInteger(waitDays) || waitDays < 0 || waitDays > MAX_WAIT_DAYS) return { error: `Enter a waiting period in whole days, 0 to ${MAX_WAIT_DAYS}` };
  return { label, endedOn: raw.endedOn, lastDoseOn, waitDays };
}
