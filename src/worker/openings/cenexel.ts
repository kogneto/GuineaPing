import { sameHost, text } from "./html";
import type { Found, Source } from "./types";

/** Each CenExel unit's own list, and the Clinic it is. Its study links carry the same path. */
const UNITS = [
  { path: "/act/", clinicId: "cenexel-anaheim" },
  { path: "/cns/", clinicId: "cenexel-los-alamitos" },
  { path: "/iresearch-atlanta/", clinicId: "cenexel-decatur" },
  { path: "/hri/", clinicId: "cenexel-marlton" },
  { path: "/rmcr/", clinicId: "cenexel-englewood" },
] as const;
const BASE = "https://cenexelresearch.com";

/** A row's cell of the given column, as text. */
const cell = (row: string, column: string) => text(new RegExp(`class='column-study-${column}'>([\\s\\S]*?)<\\/div>`).exec(row)?.[1] ?? "") || null;

/**
 * CenExel's units in Anaheim, Los Alamitos, Decatur, Marlton and Englewood (which CenExel calls
 * Denver): one table each, one row per study,
 * with its status, sexes, ages and pay. A study marked "Ongoing" has stopped enrolling and is left
 * out; "Enrolling" and "Upcoming" are kept. The unit is read from the study's own link.
 */
export const cenexel: Source = {
  id: "cenexel",
  pages: UNITS.map((u) => `${BASE}${u.path}all-studies/`),
  parse(pages) {
    const found: Found[] = [];
    const seen = new Set<string>();
    for (const html of pages) {
      for (const row of html.matchAll(/<a href="([^"]+)"><div class='study-row[\s\S]*?<\/a>/g)) {
        const url = sameHost(row[1]!.replace(/&amp;/g, "&"), BASE);
        const unit = url ? UNITS.find((u) => new URL(url).pathname.startsWith(u.path)) : undefined;
        const status = /class="study-status ([a-z-]+)"/.exec(row[0])?.[1] ?? "";
        const title = text((/class='column-study-title'>([\s\S]*?)<\/div>/.exec(row[0])?.[1] ?? "").replace(/<span class="study-status[\s\S]*?<\/span>/, ""));
        if (!url || !unit || !title || status === "ongoing" || seen.has(url)) continue;
        seen.add(url);
        const age = cell(row[0], "age");
        found.push({
          key: new URL(url).pathname,
          clinicId: unit.clinicId,
          title,
          pay: cell(row[0], "compensation"),
          when: null,
          stay: null,
          who: [cell(row[0], "gender"), age && `Age ${age}`].filter(Boolean).join(", ") || null,
          code: null,
          url,
        });
      }
    }
    return found;
  },
};
