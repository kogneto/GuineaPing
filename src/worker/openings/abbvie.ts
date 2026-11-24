import { text } from "./html";
import type { Found, Source } from "./types";

/** The data call AbbVie's own list page draws its studies from. */
const FEED = "https://abbviephase1.com/API/api/Data/GetTrials";
/** The list page itself. No page of its own is known for a study, so every Opening links here. */
const LIST = "https://abbviephase1.com/#/available-trials";

/** One field of an entry as plain text, or null when it gives none. */
function field(entry: Record<string, unknown>, name: string): string | null {
  const value = entry[name];
  return typeof value === "string" || typeof value === "number" ? text(String(value)) || null : null;
}

/** "4200.00" as "$4,200", so that pay can be ordered by. Null when it is not a sum of money. */
function dollars(stipend: string | null): string | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(stipend ?? "");
  if (!m) return null;
  const whole = String(Number(m[1])).replace(/\B(?=(\d{3})+$)/g, ",");
  const cents = m[2]?.padEnd(2, "0");
  return `$${whole}${cents && cents !== "00" ? `.${cents}` : ""}`;
}

/**
 * AbbVie's Clinical Pharmacology Research Unit, Grayslake: its list page fetches the studies as a
 * JSON list. The page sends that request with a sign-in token, but on 2026-11-24 the request
 * answered without one. This reader sends the same plain request as every other and never a token:
 * if the feed starts asking for one, the read records the refusal and stops (docs/adr/0003).
 *
 * The check-in day is the date. TrialStartDate and TrialEndDate are not: on 2026-11-24 both were
 * the day the study was posted, weeks before its check-in. Each entry also carries the study's
 * flyer as a PDF, which is not read or kept.
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
        pay: dollars(field(fields, "Stipend")),
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
