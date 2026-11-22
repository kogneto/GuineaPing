import { link, pieces, text } from "./html";
import type { Found, Source } from "./types";

const PAGE = "https://tklresearch.com/studies/";

/** One labelled box of a study's card, without the "- " TKL puts in front of some lines. */
const box = (card: string, n: number) => text(new RegExp(`eg-tkl-skin-dark-element-${n}">([\\s\\S]*?)<\\/div>`).exec(card)?.[1] ?? "").replace(/^-\s*/, "") || null;

/** TKL lists Fair Lawn and Bloomfield together; only Fair Lawn is ours. */
export const tkl: Source = {
  id: "tkl",
  pages: [PAGE],
  parse([html = ""]) {
    const found: Found[] = [];
    for (const card of pieces(html, /<li id="eg-1-post-id/, /<\/li>/)) {
      const url = link(card, PAGE);
      const title = box(card, 0);
      if (!url || !title || box(card, 20) !== "Fair Lawn") continue;
      const when = box(card, 6);
      found.push({
        key: new URL(url).pathname,
        clinicId: "tkl-fair-lawn",
        title,
        pay: box(card, 14),
        when: when && /\d/.test(when) ? when : null,
        stay: box(card, 21),
        who: box(card, 17),
        code: box(card, 24),
        url,
      });
    }
    return found;
  },
};
