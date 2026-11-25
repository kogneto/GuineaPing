import { between, link, text } from "./html";
import type { Found, Source } from "./types";

/** The call Medpace's list page makes for its study cards, with the page's own settings. */
const FEED =
  "https://www.medpace.com/study-participants/wp-json/em/v1/post_factory?post_type=em_study&posts_per_page=12&term_counts=false&partial=card-study&block=block_6b061ff0aa3c2&orderby=date&order=desc&paged=1&pagination=load_more&relation=OR";

/** The answer's study cards. It comes as JSON encoded once more as a string; either way is read. */
function cards(answer: string): string[] {
  try {
    let value: unknown = JSON.parse(answer);
    if (typeof value === "string") value = JSON.parse(value);
    const posts = (value as { posts?: unknown } | null)?.posts;
    return Array.isArray(posts) ? posts.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

/** The text of the card's paragraph with this class, or null. */
const part = (card: string, name: string) => text(new RegExp(`<p class="em-study-card__${name}"[^>]*>([\\s\\S]*?)</p>`).exec(card)?.[1] ?? "") || null;

/**
 * Medpace, Cincinnati: its list page fetches its study cards from its own site, as HTML inside
 * JSON. The label is the pay where it names a figure. The excerpt's first sentence is the stay,
 * where it speaks of one; the rest is cut short ("Compensation for participation and…").
 */
export const medpace: Source = {
  id: "medpace",
  pages: [FEED],
  parse([answer = ""]) {
    const found: Found[] = [];
    for (const card of cards(answer)) {
      const url = link(card, FEED);
      const title = part(card, "title");
      if (!url || !title) continue;
      const label = part(card, "label");
      const excerpt = between(card, /<p class="em-study-card__excerpt"[^>]*>/, /<div class="em-study-card__details"|<\/a>/) ?? "";
      const first = /^.*?\.(?=\s|$)/.exec(excerpt)?.[0] ?? null;
      const details = [...(/<div class="em-study-card__details"[^>]*>([\s\S]*?)<\/div>/.exec(card)?.[1] ?? "").matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map((m) => text(m[1] ?? "")).filter(Boolean);
      found.push({
        key: new URL(url).pathname,
        clinicId: "medpace",
        title,
        pay: label && /\$\s?\d/.test(label) ? label : null,
        when: null,
        stay: first && /\b(visits?|stays?|nights?)\b/i.test(first) ? first : null,
        who: details.join(", ") || null,
        code: null,
        url,
      });
    }
    return found;
  },
};
