import { between, link, pieces, text } from "./html";
import type { Found, Source } from "./types";

const PAGE = "https://participantskc.altasciences.com/available-studies";

/** Altasciences Kansas City: one card per study group. Closed groups stay on the page and are skipped. */
export const altasciencesKc: Source = {
  id: "altasciences-kc",
  pages: [PAGE],
  parse([html = ""]) {
    const found: Found[] = [];
    for (const item of pieces(html, /<div id="study-\d+" class="study-item\b/)) {
      const title = between(item, /<h2 class="title">/, /<\/h2>/);
      if (!title || /recruitment complete/i.test(title)) continue;
      const url = link(item.slice(item.indexOf("</h2>")), PAGE) ?? PAGE;
      const dates = [...item.matchAll(/<li class="item">([\s\S]*?)<\/li>/g)].map((m) => text(m[1] ?? "")).filter(Boolean);
      const pay = between(item, /<span class="compensation">/, /<ul\b|<\/div>/);
      const age = between(item, /<span class="age">/, /<\/span>/);
      const sex = between(item, /<span class="gender\b[^"]*">/, /<\/span>/);
      found.push({
        key: url === PAGE ? title : new URL(url).pathname,
        clinicId: "altasciences-kc",
        title,
        pay: pay && /\d/.test(pay) ? pay.replace(/\$\s+/, "$") : null,
        when: dates.length ? dates.join("; ") : null,
        stay: between(item, /<span class="nbVisits">/, /<\/span>/),
        who: [sex, age ? `Age ${age}` : null].filter(Boolean).join(", ") || null,
        code: /\(([A-Z]\d+)\)/.exec(title)?.[1] ?? null,
        url,
      });
    }
    return found;
  },
};
