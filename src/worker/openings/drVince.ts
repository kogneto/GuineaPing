import { link, pieces, text } from "./html";
import type { Found, Source } from "./types";

const PAGE = "https://drvince.com/current-studies/";

/** One labelled fact of a card: "card__fact--compensation" and the like. */
const fact = (card: string, name: string) => text(new RegExp(`card__fact--${name}"[^>]*>([\\s\\S]*?)<\\/li>`).exec(card)?.[1] ?? "") || null;

/**
 * Dr. Vince Clinical Research, Overland Park: one card per study. The page also carries a
 * machine-readable list of its studies, which on 2026-11-24 disagreed with the cards (another stay,
 * other pay), so only the cards are read: they are what a Member sees.
 */
export const drVince: Source = {
  id: "dr-vince",
  pages: [PAGE],
  parse([html = ""]) {
    const found: Found[] = [];
    for (const card of pieces(html, /<div class="card card--icon card--study\b/)) {
      const title = text(/<h3 class="card__headline"[^>]*>([\s\S]*?)<\/h3>/.exec(card)?.[1] ?? "");
      const url = link(/<div class="card__button"[\s\S]*/.exec(card)?.[0] ?? "", PAGE);
      if (!title || !url) continue;
      const code = text(/<p class="card__subtitle"[^>]*>([\s\S]*?)<\/p>/.exec(card)?.[1] ?? "").replace(/^Study Indicator:\s*/i, "") || null;
      const includes = [...(/<div class="card__content"[^>]*>([\s\S]*?)<\/div>/.exec(card)?.[1] ?? "").matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) => text(m[1] ?? "")).filter(Boolean);
      found.push({
        key: new URL(url).pathname,
        clinicId: "dr-vince",
        title,
        pay: fact(card, "compensation"),
        when: null,
        stay: includes.join(", ") || null,
        who: [fact(card, "gender"), fact(card, "ages")].filter(Boolean).join(", ") || null,
        code,
        url,
      });
    }
    return found;
  },
};
