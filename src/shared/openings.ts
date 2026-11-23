/**
 * Openings a Member has set aside. Two marks, for two kinds of reason:
 * - "Not this time": the reason will change (the dates, a waiting period). It covers one entry as
 *   it stood, so the same study listed again shows again.
 * - "Not for me": the reason won't change (an age limit, what the study tests). It covers the
 *   study itself at that one Clinic, every group of it, now and later. The same study at another
 *   of the company's Clinics is left alone.
 */

export const OPENING_MARKS = ["not_this_time", "not_for_me"] as const;
export type OpeningMark = (typeof OPENING_MARKS)[number];

export const OPENING_MARK_LABELS: Record<OpeningMark, string> = { not_this_time: "Not this time", not_for_me: "Not for me" };

/**
 * The Clinic's code for a study as a whole, worked out from the code on one entry, which at some
 * Clinics also names a group. Null when the entry has no code: it then can't be told from any
 * other study, and can only be set aside "Not this time".
 *
 * A group is dropped only where the Clinic's own list shows the split. Anywhere else the whole
 * code is the study: guessing too broadly would hide a different study, and a hidden Opening is
 * one nobody sees.
 * - Celerion calls its code a "study group": "CA48121-6A" is group 6A of study CA48121.
 * - Fortrea's page for a study carries only its number: "778951 9b" is group 9b of study 778951.
 * - Altasciences Los Angeles marks its Spanish copy of an entry "(ES)": the same study.
 * (Inferred from the lists as they stood on 2026-11-23.)
 */
export function studyOf(source: string, code: string | null): string | null {
  const whole = code?.trim();
  if (!whole) return null;
  if (source === "celerion") return /^(.+?)-\d+[A-Za-z]?$/.exec(whole)?.[1] ?? whole;
  if (source === "fortrea") return /^\d{5,}/.exec(whole)?.[0] ?? whole;
  if (source === "altasciences-la") return whole.replace(/\s*\(ES\)$/, "");
  return whole;
}

/** What an entry said when a Member set it aside "Not this time". The mark holds while this stays the same. */
export function roundSeen(o: { code: string | null; when: string | null; firstSeen: string }): string {
  return JSON.stringify([o.code, o.when, o.firstSeen]);
}
