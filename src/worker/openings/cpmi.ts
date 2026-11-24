import type { Found, Source } from "./types";

/** The data call the Clinic's list page draws its studies from, on its recruitment company's host. */
const FEED = "https://realtime-host01.com/erg-cpm/web/v1/studies?";
/** The Clinic's own list page. No page of its own is known for a study, so every Opening links here. */
const LIST = "https://cpmiclinical.com/studies/#!/";

/** One field of a study, on one line, or null when it gives none. */
function field(study: Record<string, unknown>, name: string): string | null {
  const value = study[name];
  return typeof value === "string" || typeof value === "number" ? String(value).replace(/\s+/g, " ").trim() || null : null;
}

/**
 * Clinical Pharmacology of Miami: its list page fetches the studies as JSON from its recruitment
 * company's host, with no sign-in. Each study gives its name and protocol number. Pay, dates and
 * stay are only in its story text, so, as for OCRC, nothing is taken from that. The wait-lists for
 * future studies (protocol "WAIT-LIST: …") are not studies and are left out.
 */
export const cpmi: Source = {
  id: "cpmi",
  pages: [FEED],
  site: LIST,
  parse([json = ""]) {
    let answer: unknown;
    try {
      answer = JSON.parse(json);
    } catch {
      return [];
    }
    const studies = (answer as { studies?: unknown } | null)?.studies;
    if (!Array.isArray(studies)) return [];
    const found: Found[] = [];
    for (const entry of studies) {
      if (!entry || typeof entry !== "object") continue;
      const study = entry as Record<string, unknown>;
      const key = field(study, "StudyID");
      const title = field(study, "Title");
      const code = field(study, "Protocol");
      if (!key || !title || /^wait-?list\b/i.test(code ?? "")) continue;
      found.push({ key, clinicId: "clinical-pharmacology-miami", title, pay: null, when: null, stay: null, who: null, code, url: LIST });
    }
    return found;
  },
};
