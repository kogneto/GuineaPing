import { between, link, pieces } from "./html";
import type { Found, Source } from "./types";

const PAGE = "https://helpresearch.com/studies";

const field = (row: string, name: string) => between(row, new RegExp(`class="views-field views-field-field-csapi-${name}"[^>]*>`), /<\/div>\s*<\/div>/);

/** Celerion lists both units together: one block per study group, with its check-in and check-out days. */
export const celerion: Source = {
  id: "celerion",
  pages: [PAGE],
  parse([html = ""]) {
    const found: Found[] = [];
    for (const row of pieces(html, /<a class="study-page-link"/)) {
      const url = link(row, PAGE);
      const code = field(row, "studygroup");
      const site = field(row, "sitename");
      if (!url || !code || !site) continue;
      const start = field(row, "start-date");
      const end = field(row, "end-date");
      found.push({
        key: new URL(url).pathname,
        clinicId: /lincoln/i.test(site) ? "celerion-lincoln" : "celerion-tempe",
        title: field(row, "shortdesc-eng") ?? code,
        pay: field(row, "stipend"),
        when: start && end ? `${start} to ${end}` : start,
        stay: null,
        who: field(row, "maxage"),
        code,
        url,
      });
    }
    return found;
  },
};
