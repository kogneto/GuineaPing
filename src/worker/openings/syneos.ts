import { link, pieces, text } from "./html";
import type { Found, Source } from "./types";

const PAGE = "https://www.us-participants.syneoshealth.com/en/avalaible-studies/";

/** A card's block of the given class, whole, or "" when it has none. */
const block = (card: string, cls: string) => new RegExp(`<div class="${cls}"[^>]*>([\\s\\S]*?)<\\/div>`).exec(card)?.[1] ?? "";

/**
 * Syneos Health, Miami: one card per study (the misspelt address is theirs). Its robots.txt allows
 * the list to everyone, while refusing AI crawlers by name; GuineaPing's reader is not one of them.
 * A card marked "Recruiting closed" is left out, and so is a card that names no study, such as the
 * sign-up for future studies.
 */
export const syneos: Source = {
  id: "syneos",
  pages: [PAGE],
  parse([html = ""]) {
    const found: Found[] = [];
    for (const card of pieces(html, /<li class="study-list__item">/, /<\/li>/)) {
      const title = text(/<h3[^>]*study-card__title[^>]*>([\s\S]*?)<\/h3>/.exec(card)?.[1] ?? "");
      const code = /^Study\s+(.+)$/i.exec(title)?.[1] ?? null;
      const url = link(/<a\b[^>]*href="https:[\s\S]*/.exec(card)?.[0] ?? "", PAGE);
      if (!code || !url || /closed/i.test(text(block(card, "state[^\"]*")))) continue;
      // The calendar line gives the dates; the information tip beside it says what the study asks.
      const calendar = /icon-icon-calendar[\s\S]*?<\/div>/.exec(card)?.[0] ?? "";
      const tip = /<span class="tooltip">([\s\S]*?)<\/span>/.exec(calendar)?.[1] ?? "";
      const when = text(calendar.replace(/<span class="tooltip-wrapper"[\s\S]*$/, "").replace(/^[^>]*>/, ""));
      const people = text(/icon-icon-people[\s\S]*?<p>([\s\S]*?)<\/p>/.exec(card)?.[1] ?? "");
      const smoke = text(/icon-icon-smoke[^>]*>[\s\S]*?<\/svg>([\s\S]*?)<\/div>/.exec(card)?.[1] ?? "");
      const age = text(/<span class="iconText">AGE<\/span>([\s\S]*?)<\/div>/.exec(card)?.[1] ?? "");
      found.push({
        key: new URL(url).pathname,
        clinicId: "syneos-miami",
        title,
        pay: text(block(card, "montant")) || null,
        when: when || null,
        stay: text(tip) || null,
        who: [people, smoke, age && `Age ${age}`].filter(Boolean).join(", ") || null,
        code,
        url,
      });
    }
    return found;
  },
};
