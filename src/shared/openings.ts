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
/** What follows a count of visits that has the screening visit in it: "(includes screening)". */
const INCLUDES_SCREENING = /^\s*,?\s*\(\s*(?:includes|including)\s+(?:the\s+|a\s+)?screening(?:\s+visit)?\s*\)/i;

/**
 * How many Follow-up visits an Opening asks for, read from the Clinic's wording about its stay:
 * outpatient, return and follow-up visits, and the bare "15 visits" of a study that is all visits.
 * Screening visits and phone calls are not counted, nor is a kind of visit no Clinic has been seen
 * to use. Where a Clinic counts the screening visit in with the others and says so, "16 outpatient
 * visits (includes screening)", it is taken out: 15. Null when the Clinic gives no wording: that
 * is "doesn't say", not none.
 *
 * It is only for filtering: what a Member reads is always the Clinic's own wording. So it reads
 * low, because a filter that guessed high would hide an Opening that might fit:
 * - of several numbers given together the lowest counts: "12 to 16" is 12, "2 or 5" is 2;
 * - of several figures in one wording the lowest counts, though they may add up;
 * - a number that something labels is not a count: "a Day 14 follow-up visit" is one visit, on
 *   day 14. It counts as one, never as nothing, so that doubting a number cannot raise the
 *   reading by leaving only a higher figure.
 */
export function followUpVisits(stay: string | null): number | null {
  if (!stay?.trim()) return null;
  const figures = [...stay.matchAll(VISITS)].map((m) => {
    const lowest = Math.min(...m[1]!.match(/\d+/g)!.map(Number));
    if (LABELS_A_NUMBER.test(stay.slice(0, m.index))) return Math.min(lowest, 1);
    // "16 outpatient visits (includes screening)": one of them is the screening visit.
    return INCLUDES_SCREENING.test(stay.slice(m.index + m[0].length)) ? Math.max(0, lowest - 1) : lowest;
  });
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

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const monthOf = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;
const dayText = (year: number, month: number, day: number) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const daysIn = (month: number, year: number) => (month === 2 ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31);

/** A month's name, whole or cut short, and nothing that merely begins like one. */
const MON = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?![a-z])\\.?";
/** A day of the month, and not the front of something longer: "2nd", "2026", "12/3". */
const DAY = "(\\d{1,2})(?![\\da-z/])";
/** A year, where a Clinic writes one after a date: " 2026" or ", 2026". */
const YEAR = "(?:,?\\s+(\\d{4})(?!\\d))?";
/** What joins the two ends of a range. Not "and" or a comma: those list separate days. */
const JOIN = "\\s*(?:to|-|–)\\s*";

type DateRead = { month: number; day: number; year: number | null };
const read = (month: number, day: string, year: string | undefined): DateRead => ({ month, day: Number(day), year: year ? Number(year) : null });
/** The three ways a Clinic writes one date, each read from the front of the text. */
const DATES: { shape: RegExp; date: (m: RegExpExecArray) => DateRead }[] = [
  // "01/13/27", "11/30/2026": month first.
  { shape: /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?![\d/])/, date: (m) => read(Number(m[1]), m[2]!, m[3]!.length === 2 ? `20${m[3]}` : m[3]) },
  // "Dec 02", "Dec 02 2026", "December 2, 2026".
  { shape: new RegExp(`^${MON}\\s+${DAY}${YEAR}`, "i"), date: (m) => read(monthOf(m[1]!), m[2]!, m[3]) },
  // "11 Jan", "5 Dec 2027".
  { shape: new RegExp(`^${DAY}\\s+${MON}${YEAR}`, "i"), date: (m) => read(monthOf(m[2]!), m[1]!, m[3]) },
];
/** A range of days in one month, with the month written once: "Dec 1-10", and "1 to 5 Dec". */
const DAYS_AFTER_MONTH = new RegExp(`^${MON}\\s+${DAY}${JOIN}${DAY}${YEAR}$`, "i");
const DAYS_BEFORE_MONTH = new RegExp(`^${DAY}${JOIN}${DAY}\\s+${MON}${YEAR}$`, "i");

/** One stretch of days as a Clinic writes it, all of it: a date, or a first and a last date. Null when any part is not that. */
function stretch(text: string): { first: DateRead; last: DateRead | null } | null {
  // With the month written once both days are in it, so "28 to 3 Feb" names no month for its first day.
  const oneMonth = (month: string, from: string, to: string, year: string | undefined) => (Number(from) > Number(to) ? null : { first: read(monthOf(month), from, year), last: read(monthOf(month), to, year) });
  const after = DAYS_AFTER_MONTH.exec(text);
  if (after) return oneMonth(after[1]!, after[2]!, after[3]!, after[4]);
  const before = DAYS_BEFORE_MONTH.exec(text);
  if (before) return oneMonth(before[3]!, before[1]!, before[2]!, before[4]);
  const front = (rest: string) => {
    for (const { shape, date } of DATES) {
      const m = shape.exec(rest);
      if (m) return { date: date(m), rest: rest.slice(m[0].length) };
    }
    return null;
  };
  const first = front(text);
  if (!first) return null;
  if (!first.rest) return { first: first.date, last: null };
  const joined = new RegExp(`^${JOIN}`, "i").exec(first.rest);
  const last = joined && front(first.rest.slice(joined[0].length));
  return last && !last.rest ? { first: first.date, last: last.date } : null;
}

const isBefore = (a: DateRead, b: DateRead) => a.month < b.month || (a.month === b.month && a.day <= b.day);
const canBe = (month: number, day: number, year: number) => month >= 1 && month <= 12 && day >= 1 && day <= daysIn(month, year);

/**
 * The day an Opening starts, as `YYYY-MM-DD`: the first date in the Clinic's wording about when.
 * It is only for a Member's timeframe: what a Member reads is always the Clinic's own wording.
 *
 * A date has no safe guess: a wrong one could hide an Opening that fits. So the whole wording must
 * be something this knows how to read, one stretch of days or several with ";" between, and any
 * doubt gives null, which means the Opening is always shown. That covers no wording; anything in
 * front of, between or after the dates that is not a date; a date that cannot be; and a last date
 * before the first, a later stretch that begins before the first one, or a year far from the day
 * the Opening was first seen. It never skips what it cannot read to find a date further along.
 *
 * A year the Clinic writes is used, also when it is written once after the last date. Otherwise
 * it comes from `firstSeen` (see `yearFor`). Nothing here looks at the clock, and days are text,
 * so no time zone can move one.
 */
export function startDay(when: string | null, firstSeen: string): string | null {
  const starts = (when ?? "")
    .split(";")
    .map((part) => part.trim().replace(/\.$/, ""))
    .filter(Boolean)
    .map((part) => firstDayOf(stretch(part), firstSeen));
  const first = starts[0];
  // Every stretch must be read, and none may begin before the first, or the first is not the start.
  return first && starts.every((s) => s !== null && s >= first) ? first : null;
}

/** How far a start may be from the year an Opening was first seen: further is more likely a slip than a study. */
const YEARS_BACK = 1;
const YEARS_ON = 5;

/** The first day of one stretch, with its year settled: null when the stretch was not read, or its dates cannot both be right. */
function firstDayOf(span: ReturnType<typeof stretch>, firstSeen: string): string | null {
  if (!span) return null;
  const { first, last } = span;
  // An earlier day of the same month, with no year on the first date to say it is a year before: a slip.
  if (last && first.year === null && last.month === first.month && last.day < first.day) return null;
  const year = first.year ?? (last?.year != null ? (isBefore(first, last) ? last.year : last.year - 1) : yearFor(first.month, firstSeen));
  const seenYear = Number(firstSeen.slice(0, 4));
  if (year < seenYear - YEARS_BACK || year > seenYear + YEARS_ON || !canBe(first.month, first.day, year)) return null;
  const start = dayText(year, first.month, first.day);
  if (!last) return start;
  // A last date with no year of its own is the next such day on or after the first.
  const lastYear = last.year ?? (isBefore(first, last) ? year : year + 1);
  return canBe(last.month, last.day, lastYear) && start <= dayText(lastYear, last.month, last.day) ? start : null;
}

/** The year of a date a Clinic gave without one: it falls between two months before the month the Opening was first seen and nine months after. */
function yearFor(month: number, firstSeen: string): number {
  const seenYear = Number(firstSeen.slice(0, 4));
  const seenMonth = Number(firstSeen.slice(5, 7));
  const monthsAhead = (month - seenMonth + 12) % 12;
  return monthsAhead <= 9 ? seenYear + (month < seenMonth ? 1 : 0) : seenYear - (month > seenMonth ? 1 : 0);
}

/** A Member's timeframe for when an Opening starts. Either end may be left open (null). Days are `YYYY-MM-DD`. */
export type Timeframe = { from: string | null; to: string | null };

/**
 * Whether an Opening passes a Member's timeframe: it starts on or after `from` and on or before
 * `to`, whichever are set, however long it then runs. An Opening that gives no start day always
 * passes: holding it back would be a guess.
 */
export function startsWithin(when: string | null, firstSeen: string, frame: Timeframe): boolean {
  if (!frame.from && !frame.to) return true;
  const start = startDay(when, firstSeen);
  return start === null || ((!frame.from || start >= frame.from) && (!frame.to || start <= frame.to));
}

/** Why the days in a Member's two date boxes are not applied as a timeframe, when they are not. */
export type Unapplied = "crossed" | "passed" | null;

/**
 * The timeframe to apply for what a Member has put in the two date boxes, given the day it is.
 * What the boxes hold is never changed here: it is only applied or not.
 *
 * A box counts when it holds a whole day in a year near today's (`YEARS_BACK`, `YEARS_ON`). A date
 * box holds a whole day long before the Member has finished typing: 0002-01-31 on the way to
 * 2027-01-31. Acting on that would undo the other box, so it is left alone until it means something.
 *
 * Nothing is applied when the first day is after the last ("crossed"), or when the last day has
 * passed ("passed"): either would hold back every Opening with dates. The page says which, so it
 * is never a silent nothing. A timeframe with no last day never passes.
 */
export function timeframeOf(from: string, to: string, today: string): { frame: Timeframe; unapplied: Unapplied } {
  const thisYear = Number(today.slice(0, 4));
  const meant = (box: string) => (/^\d{4}-\d{2}-\d{2}$/.test(box) && Number(box.slice(0, 4)) >= thisYear - YEARS_BACK && Number(box.slice(0, 4)) <= thisYear + YEARS_ON ? box : null);
  const frame = { from: meant(from), to: meant(to) };
  const unapplied = frame.from && frame.to && frame.from > frame.to ? "crossed" : frame.to && frame.to < today ? "passed" : null;
  return { frame: unapplied ? { from: null, to: null } : frame, unapplied };
}

/** The limits a Member can put on the Openings they see: on Follow-up visits, and on when an Opening starts. */
export type Limits = { followUps: FollowUpLimit | null; starts: Timeframe };
/** A Clinic under a Member's limits: with the Openings that pass them all, and how many of its others they hold back. */
export type Limited<C> = C & { heldBack: number };
/** What one limit does by itself: how many Openings it holds back, and how many still listed don't say what it asks about. */
export type LimitCount = { heldBack: number; dontSay: number };

/**
 * A Member's Clinics under their limits. An Opening stays listed when it passes every limit.
 * Nothing is held back silently: each Clinic says how many of its Openings are, `heldBack` is the
 * total, and each limit says how many it holds back by itself (an Opening over both is counted
 * by both). An Opening the Member set aside is left where it is and out of every count: it is
 * already out of the list. `dontSay` is how many of the Openings still listed don't say what that
 * limit asks about, which is why it lets them through; a limit that isn't set has nothing to
 * explain, so its counts are 0.
 */
export function limitedTo<O extends { stay: string | null; when: string | null; firstSeen: string; mark: unknown }, C extends { openings: O[] }>(
  clinics: C[],
  limits: Limits,
): { clinics: Limited<C>[]; heldBack: number; followUps: LimitCount; starts: LimitCount } {
  const fewEnough = (o: O) => withinFollowUps(o.stay, limits.followUps);
  const inTime = (o: O) => startsWithin(o.when, o.firstSeen, limits.starts);
  const under = clinics.map((c) => {
    const openings = c.openings.filter((o) => o.mark || (fewEnough(o) && inTime(o)));
    return { ...c, openings, heldBack: c.openings.length - openings.length };
  });
  const notAside = clinics.flatMap((c) => c.openings).filter((o) => !o.mark);
  const listed = under.flatMap((c) => c.openings).filter((o) => !o.mark);
  /** What one limit does by itself. `says` is whether an Opening tells what the limit asks about. */
  const count = (passes: (o: O) => boolean, isSet: boolean, says: (o: O) => boolean): LimitCount => ({
    heldBack: notAside.filter((o) => !passes(o)).length,
    dontSay: isSet ? listed.filter((o) => !says(o)).length : 0,
  });
  return {
    clinics: under,
    heldBack: notAside.length - listed.length,
    followUps: count(fewEnough, limits.followUps !== null, (o) => followUpVisits(o.stay) !== null),
    starts: count(inTime, !!(limits.starts.from || limits.starts.to), (o) => startDay(o.when, o.firstSeen) !== null),
  };
}
