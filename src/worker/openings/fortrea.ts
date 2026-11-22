import { between, link, pieces, text } from "./html";
import type { Found, Source } from "./types";

const PAGE = "https://www.fortreaclinicaltrials.com/en-us/clinical-research/browse-studies";
const CLINIC: Record<string, string> = {
  "Madison, Wisconsin": "fortrea-madison",
  "Dallas, Texas": "fortrea-dallas",
  "Daytona Beach, Florida": "fortrea-daytona",
  "San Antonio, Texas": "fortrea-san-antonio",
};

const cell = (row: string, field: string) => between(row, new RegExp(`class="[^"]*views-field-${field}\\b[^"]*"[^>]*>`), /<\/td>/);

/** Fortrea lists every unit's studies in one table: one row per study group. */
export const fortrea: Source = {
  id: "fortrea",
  pages: [PAGE],
  parse([html = ""]) {
    const found: Found[] = [];
    for (const row of pieces(html, /<tr\b/, /<\/tr>/)) {
      const titleCell = /class="[^"]*views-field-title\b[^"]*"[^>]*>([\s\S]*?)<\/td>/.exec(row)?.[1];
      const url = titleCell ? link(titleCell, PAGE) : null;
      const clinicId = CLINIC[cell(row, "field-location") ?? ""];
      if (!titleCell || !url || !clinicId) continue;
      const age = cell(row, "field-age-freetext");
      found.push({
        key: new URL(url).pathname,
        clinicId,
        title: text(/<a\b[^>]*>([\s\S]*?)<\/a>/.exec(titleCell)?.[1] ?? ""),
        pay: cell(row, "field-compensation"),
        when: cell(row, "field-dates-1"),
        stay: cell(row, "field-study-design"),
        who: age ? `Age ${age}` : null,
        code: text(titleCell.replace(/<a\b[\s\S]*?<\/a>/, "")) || null,
        url,
      });
    }
    return found;
  },
};
