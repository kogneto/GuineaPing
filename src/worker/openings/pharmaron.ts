import { pieces, text } from "./html";
import type { Found, Source } from "./types";

const PAGE = "https://www.pharmaron.com/services/clinical-development/clinical-trial-recruitment/clinical-trial-recruitment-us/";

/** Pharmaron Baltimore: the studies are flip boxes on one page, with no pages of their own. */
export const pharmaron: Source = {
  id: "pharmaron",
  pages: [PAGE],
  parse([html = ""]) {
    const from = html.indexOf("Clinical Trial Studies");
    if (from < 0) return [];
    const found: Found[] = [];
    for (const box of pieces(html.slice(from), /<div class="wp-block-flipbox-block-flipbox-back\b/, /<\/div><\/div>\s*<\/div><\/div>/)) {
      const title = text(/<h2\b[^>]*>([\s\S]*?)<\/h2>/.exec(box)?.[1] ?? "");
      if (!title) continue;
      const points = [...(/<ul\b[\s\S]*?<\/ul>/.exec(box)?.[0] ?? "").matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].filter((m) => !/<a\b/i.test(m[1] ?? "")).map((m) => text(m[1] ?? "")).filter(Boolean);
      if ([title, ...points].some((t) => /\b(closed|paused)\b/i.test(t))) continue;
      const stay = points.find((p) => /\b(stay|nights?|inpatient|in-patient)\b/i.test(p)) ?? null;
      const pay = box.split(/<\/p>/).map(text).find((p) => /\bcompensated\b/i.test(p));
      const code = /\(([^()]+)\)\s*$/.exec(title)?.[1]?.trim() || null;
      found.push({
        key: code ?? title,
        clinicId: "pharmaron",
        title,
        pay: (pay && /\bcompensated\b.*?(?=\s+for\s+their\b|\.(?:\s|$)|$)/i.exec(pay)?.[0]) || null,
        when: null,
        stay,
        who: points.filter((p) => p !== stay).join(", ") || null,
        code,
        url: PAGE,
      });
    }
    return found;
  },
};
