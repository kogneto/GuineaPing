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
 * - Novum writes the group out: "12641901 Group5" is group 5 of study 12641901.
 * - Altasciences Los Angeles marks its Spanish copy of an entry "(ES)": the same study.
 * (Inferred from the lists as they stood on 2026-11-23.)
 */
export function studyOf(source: string, code: string | null): string | null {
  const whole = code?.trim();
  if (!whole) return null;
  if (source === "celerion") return /^(.+?)-\d+[A-Za-z]?$/.exec(whole)?.[1] ?? whole;
  if (source === "fortrea") return /^\d{5,}/.exec(whole)?.[0] ?? whole;
  if (source === "novum") return whole.replace(/\s+Group\s*\w+$/i, "") || whole;
  if (source === "altasciences-la") return whole.replace(/\s*\(ES\)$/, "");
  return whole;
}

/**
 * The dollar figure an Opening's pay is ordered by: the highest one in the Clinic's wording, so
 * "up to $10,000, $14,800 or $19,750" counts as 19,750. Null when it names no figure. It is only
 * for ordering: what a Member reads is always the Clinic's own wording.
 */
export function payAmount(pay: string | null): number | null {
  const figures = [...(pay ?? "").matchAll(/\$\s?(\d{1,3}(?:,\d{3})+(?!\d)|\d{1,3}(?: \d{3})+(?!\d)|\d+)/g)].map((m) => Number(m[1]!.replace(/[, ]/g, "")));
  return figures.length ? Math.max(...figures) : null;
}

export const OPENING_ORDERS = ["pay", "newest"] as const;
export type OpeningOrder = (typeof OPENING_ORDERS)[number];

type Ordered = { title: string; pay: string | null; firstSeen: string };

/**
 * Openings in the order asked for, leaving the list given untouched. "pay": highest figure first,
 * those that name none last. "newest": most recently first seen first, the better paid first
 * among those seen the same day.
 */
export function inOrder<T extends Ordered>(openings: T[], by: OpeningOrder): T[] {
  const byPay = (a: T, b: T) => (payAmount(b.pay) ?? -1) - (payAmount(a.pay) ?? -1) || a.title.localeCompare(b.title);
  const byNewest = (a: T, b: T) => b.firstSeen.localeCompare(a.firstSeen) || byPay(a, b);
  return [...openings].sort(by === "pay" ? byPay : byNewest);
}

/**
 * How an entry stood when a Member set it aside "Not this time": its code, its dates, and when it
 * was first seen. The mark holds while this stays the same. A Clinic read moves `firstSeen` when
 * it calls the entry new, so give the moment, not the day: an entry can go and come back in a day.
 */
export function asItStood(o: { code: string | null; when: string | null; firstSeen: string }): string {
  return JSON.stringify([o.code, o.when, o.firstSeen]);
}

/** A number, or several the Clinic gives together ("12 to 16", "2 or 5", "14 and 28"), and the visits they count. */
const VISITS = /(\d+(?:\s*(?:-|–|to|or|and|&|,)\s*\d+)*)\s+(?:(?:return|follow[- ]?up|out[- ]?patient)\s+)*visits?\b/gi;
/** What stands just before a number that is a day, a week, a price or part of a code, not a count. */
const LABELS_A_NUMBER = /(?:\b(?:days?|weeks?|months?|cycles?|periods?|visits?|cohorts?|parts?|groups?)\s*|[$#\w./-])$/i;

/**
 * How many Follow-up visits an Opening asks for, read from the Clinic's wording about its stay:
 * outpatient, return and follow-up visits, and the bare "15 visits" of a study that is all visits.
 * Screening visits and phone calls are not counted, nor is a kind of visit no Clinic has been seen
 * to use. Null when the Clinic gives no wording: that is "doesn't say", not none.
 *
 * It is only for filtering: what a Member reads is always the Clinic's own wording. So it reads
 * low, because a filter that guessed high would hide an Opening that might fit:
 * - of several numbers given together the lowest counts: "12 to 16" is 12, "2 or 5" is 2;
 * - of several figures in one wording the lowest counts, though they may add up;
 * - a number that something labels is not a count: "a Day 14 follow-up visit" is one visit, on
 *   day 14, and is read as giving no count at all.
 */
export function followUpVisits(stay: string | null): number | null {
  if (!stay?.trim()) return null;
  const figures = [...stay.matchAll(VISITS)].filter((m) => !LABELS_A_NUMBER.test(stay.slice(0, m.index))).map((m) => Math.min(...m[1]!.match(/\d+/g)!.map(Number)));
  return figures.length ? Math.min(...figures) : 0;
}

/** The limits on Follow-up visits a Member can choose between. No limit is null. */
export const FOLLOW_UP_LIMITS = [0, 2, 5, 10] as const;
export type FollowUpLimit = (typeof FOLLOW_UP_LIMITS)[number];

/**
 * Whether an Opening passes a Member's limit on Follow-up visits, given its wording about its
 * stay. An Opening that doesn't say how many always passes: holding it back would be a guess.
 */
export function withinFollowUps(stay: string | null, most: FollowUpLimit | null): boolean {
  if (most === null) return true;
  const visits = followUpVisits(stay);
  return visits === null || visits <= most;
}

/** A Clinic under a Member's limit on Follow-up visits: with the Openings that pass, and how many of its others the limit holds back. */
export type Limited<C> = C & { heldBack: number };

/**
 * A Member's Clinics under their limit on Follow-up visits. Nothing is held back silently: each
 * Clinic says how many of its Openings are, and `heldBack` is the total. An Opening the Member set
 * aside is left where it is: it is already out of the list, and counted on its own. `dontSay` is
 * how many of the Openings still in the list don't say how many Follow-up visits they ask for,
 * which is why a limit lets them through; with no limit there is nothing to explain, so it is 0.
 */
export function limitedTo<O extends { stay: string | null; mark: unknown }, C extends { openings: O[] }>(clinics: C[], most: FollowUpLimit | null): { clinics: Limited<C>[]; heldBack: number; dontSay: number } {
  const under = clinics.map((c) => {
    const openings = c.openings.filter((o) => o.mark || withinFollowUps(o.stay, most));
    return { ...c, openings, heldBack: c.openings.length - openings.length };
  });
  const listed = under.flatMap((c) => c.openings).filter((o) => !o.mark);
  return {
    clinics: under,
    heldBack: under.reduce((n, c) => n + c.heldBack, 0),
    dontSay: most === null ? 0 : listed.filter((o) => followUpVisits(o.stay) === null).length,
  };
}
