import type { Found, Source } from "./types";

/** The data call AbbVie's own list page draws its studies from. */
const FEED = "https://abbviephase1.com/API/api/Data/GetTrials";
/** The list page itself. No page of its own is known for a study, so every Opening links here. */
const LIST = "https://abbviephase1.com/#/available-trials";

/** One field of an entry, on one line, or null when it gives none. The feed's text is plain already, not HTML. */
function field(entry: Record<string, unknown>, name: string): string | null {
  const value = entry[name];
  return typeof value === "string" || typeof value === "number" ? String(value).replace(/\s+/g, " ").trim() || null : null;
}

/**
 * The pay: a bare sum ("4200.00") as dollars ("$4,200"), so that pay can be ordered by, and any
 * other wording as the Clinic wrote it. A sum of nothing is no pay given.
 */
function pay(stipend: string | null): string | null {
  const sum = /^(\d+)(?:\.(\d{1,2}))?$/.exec(stipend ?? "");
  if (!sum) return stipend;
  if (!Number(stipend)) return null;
  const whole = String(Number(sum[1])).replace(/\B(?=(\d{3})+$)/g, ",");
  const cents = sum[2]?.padEnd(2, "0");
  return `$${whole}${cents && cents !== "00" ? `.${cents}` : ""}`;
}

/**
 * AbbVie's Clinical Pharmacology Research Unit, Grayslake: its list page fetches the studies as a
 * JSON list. The page sends a sign-in token with that request, but it answered without one on
 * 2026-11-24. This reader sends the plain request, never a token. If the feed starts asking for
 * one, the read records the refusal and stops (docs/adr/0003).
 *
 * The date is the check-in day. TrialStartDate and TrialEndDate were the day the study was posted.
 * Each entry also carries the study's flyer as a PDF, which is neither read nor kept.
 */
export const abbvie: Source = {
  id: "abbvie",
  pages: [FEED],
  parse([json = ""]) {
    let entries: unknown;
    try {
      entries = JSON.parse(json);
    } catch {
      return [];
    }
    if (!Array.isArray(entries)) return [];
    const found: Found[] = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const fields = entry as Record<string, unknown>;
      const key = field(fields, "TrialID");
      const title = field(fields, "Title");
      if (!key || !title) continue;
      const age = field(fields, "Age");
      const bmi = field(fields, "BMI");
      found.push({
        key,
        clinicId: "abbvie-grayslake",
        title,
        pay: pay(field(fields, "Stipend")),
        when: field(fields, "CheckInDate"),
        stay: field(fields, "Type"),
        who: [field(fields, "Gender"), age && `Age ${age}`, bmi && `BMI ${bmi}`].filter(Boolean).join(", ") || null,
        code: null,
        url: LIST,
      });
    }
    return found;
  },
};
