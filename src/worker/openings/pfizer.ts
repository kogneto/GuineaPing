import { link, pieces, text } from "./html";
import type { Found, Source } from "./types";

const PAGE = "https://www.pfizerclinicaltrials.com/our-research/pcru-new-haven";

const part = (item: string, label: RegExp) => text(item).replace(label, "").trim() || null;

/** Pfizer's New Haven unit. Its terms limit copying, so this takes only the title, pay, who, code and link. */
export const pfizer: Source = {
  id: "pfizer",
  pages: [PAGE],
  parse([html = ""]) {
    const found: Found[] = [];
    for (const card of pieces(html, /<div class="result-item(?: [^"]*)?">/)) {
      const title = text(/<div class="item-title">([\s\S]*?)<\/div>/.exec(card)?.[1] ?? "");
      const url = link(/<a\b[^>]*\bclass="item-link"[^>]*>/.exec(card)?.[0] ?? "", PAGE) ?? link(card, PAGE);
      const items = [...card.matchAll(/<div class="rib-item\b[^>]*>([\s\S]*?)<\/div>/g)].map((m) => m[1] ?? "");
      const code = items[0] ? text(items[0]) : "";
      if (!title || !url || !code) continue;
      if (/\bpaused\b|\bclosed\b|\bcompleted\b/i.test(text(/<div class="status">([\s\S]*?)<\/div>/.exec(card)?.[1] ?? ""))) continue;
      const sex = items.find((i) => /^\s*<span[^>]*>\s*Sex:/i.test(i));
      const age = items.find((i) => /^\s*<span[^>]*>\s*Age:/i.test(i));
      found.push({
        key: new URL(url).pathname,
        clinicId: "pfizer-new-haven",
        title,
        pay: part(items.find((i) => /^\s*<span[^>]*>\s*Compensation:/i.test(i)) ?? "", /^Compensation:\s*/i),
        when: null,
        stay: null,
        who: [sex ? text(sex) : "", age ? text(age) : ""].filter(Boolean).join(", ") || null,
        code,
        url,
      });
    }
    return found;
  },
};
