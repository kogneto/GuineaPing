import { sameHost, text } from "./html";
import type { Found, Source } from "./types";

const PAGE = "https://myproscientostudy.com/current-studies/";

/**
 * ProSciento, Chula Vista: one card per study, each with a heading, a line on who it is for, how
 * long it runs and the pay, and a "Read more & apply" button. The page shows each study twice,
 * under its kind and again in the full list, so each is kept once, as first shown.
 */
export const prosciento: Source = {
  id: "prosciento",
  pages: [PAGE],
  parse([html = ""]) {
    const found: Found[] = [];
    const seen = new Set<string>();
    for (const button of html.matchAll(/<a class="elementor-button[^"]*"[^>]*href="([^"]+)"[^>]*>(?:(?!<\/a>)[\s\S])*READ MORE/g)) {
      const url = sameHost(button[1]!.replace(/&amp;/g, "&"), PAGE);
      if (!url || seen.has(url)) continue;
      // The card is what lies between its heading and its button.
      const before = html.slice(0, button.index);
      const start = before.lastIndexOf("<h3");
      if (start < 0) continue;
      const card = before.slice(start);
      const title = text(/<h3[^>]*>([\s\S]*?)<\/h3>/.exec(card)?.[1] ?? "");
      const lines = [...card.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => text(m[1] ?? "")).filter(Boolean);
      if (!title) continue;
      seen.add(url);
      found.push({
        key: new URL(url).pathname,
        clinicId: "prosciento",
        title,
        pay: lines.find((l) => /\$\s?\d/.test(l)) ?? null,
        when: null,
        stay: lines.find((l) => /^Up to \d+\s+(days?|weeks?|months?)\b/i.test(l)) ?? null,
        who: lines.find((l) => !/\$\s?\d/.test(l) && !/^Up to \d+\s+(days?|weeks?|months?)\b/i.test(l)) ?? null,
        code: null,
        url,
      });
    }
    return found;
  },
};
