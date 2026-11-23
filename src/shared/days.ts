/**
 * Plain days: a calendar day written YYYY-MM-DD, with no clock or time zone attached. Waiting
 * periods, donations and Past studies are all kept this way, so a date never shifts by a day
 * between the Member's phone and the server. Everything that reads, moves or says a plain day
 * goes through here.
 */

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whether `day` is a real calendar day written YYYY-MM-DD. */
export function isDay(day: unknown): day is string {
  if (typeof day !== "string" || !DAY.test(day)) return false;
  const at = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === day;
}

/** `day` plus `days`, as a plain day. */
export function addDays(day: string, days: number): string {
  const at = new Date(`${day}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** Whole days from `today` until `day`; zero or less once it has come. */
export function daysUntil(day: string, today: string): number {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** Today where this code is running, as a plain day: in a browser, the Member's own day. */
export function todayHere(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** A plain day as a person reads it, the same everywhere in GuineaPing: "December 13, 2026". */
export function sayDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** How long ago `day` was, counted from `today`: "today", "1 day ago", "41 days ago", "in 3 days". */
export function daysAgo(day: string, today: string): string {
  const n = -daysUntil(day, today);
  return n === 0 ? "today" : n === 1 ? "1 day ago" : n > 1 ? `${n} days ago` : n === -1 ? "in 1 day" : `in ${-n} days`;
}
