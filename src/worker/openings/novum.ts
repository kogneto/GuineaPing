import { between, link, pieces, text } from "./html";
import type { Found, Source } from "./types";

const PAGE = "https://www.gonovum.com/location/las-vegas/";

/** "Ongoing" is not a date, so it is not passed on as one. */
const dates = (t: string | null) => (t && /\d/.test(t) ? t : null);

/** Novum's Las Vegas page: one card per study, each with its own page. */
export const novum: Source = {
  id: "novum",
  pages: [PAGE],
  parse([html = ""]) {
    const found: Found[] = [];
    for (const card of pieces(html, /<a href="[^"]*" class="study\b/, /<\/a>/)) {
      const url = link(card, PAGE);
      const code = between(card, /<h3>\s*Study Number\s*<\/h3>\s*<p>/, /<\/p>/);
      const place = text(/<div class="location">([\s\S]*?)<\/div>/.exec(card)?.[1] ?? "");
      if (!url || !code || !/las vegas/i.test(place)) continue;
      found.push({
        key: new URL(url).pathname,
        clinicId: "novum-las-vegas",
        title: code,
        pay: between(card, /<div class="compensation">/, /<\/div>/),
        when: dates(between(card, /<div class="dates">/, /<\/div>/)),
        stay: null,
        who: between(card, /<div class="criteria">/, /<\/div>/),
        code,
        url,
      });
    }
    return found;
  },
};
