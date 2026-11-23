import { between, link, pieces, text } from "./html";
import type { Found, Source } from "./types";

const PAGE = "https://participantsla.altasciences.com/current-studies";

const column = (row: string, name: string) => new RegExp(`<div class="current_studies_td ${name}">([\\s\\S]*?)<\\/div>`).exec(row)?.[1] ?? "";

/** The mark this Clinic puts after a study's code on its Spanish-language copy of an entry: "N-38160 (ES)". */
const SPANISH = /\s*\(ES\)$/;

/**
 * Altasciences Los Angeles: a table of studies spread over three pages. Some studies are listed
 * twice, in English and again in Spanish. The Spanish copy is left out when the English one is
 * there, so each study is one Opening; a study listed only in Spanish is kept.
 */
export const altasciencesLa: Source = {
  id: "altasciences-la",
  pages: [PAGE, `${PAGE}?page=1`, `${PAGE}?page=2`],
  parse(pages) {
    const found: Found[] = [];
    for (const html of pages) {
      for (const row of pieces(html, /<div class="current_studies_td studies_study">/)) {
        const code = between(row, /<div class="studynumber">/, /<\/div>/);
        const url = link(column(row, "studies_learnmore"), PAGE);
        if (!code || !url) continue;
        const key = new URL(url).pathname;
        if (found.some((f) => f.key === key)) continue;
        const points = [...column(row, "studies_qulification").matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) => text(m[1] ?? "")).filter(Boolean);
        const stay = points.find((p) => /\b(stay|visit|night)/i.test(p)) ?? null;
        const people = points.filter((p) => p !== stay);
        found.push({
          key,
          clinicId: "altasciences-la",
          title: people[0] ?? code,
          pay: text(column(row, "studies_compens")) || null,
          when: null,
          stay,
          who: [text(column(row, "studies_icon")), ...people.slice(1)].filter(Boolean).join(", ") || null,
          code,
          url,
        });
      }
    }
    return found.filter((f) => !(f.code && SPANISH.test(f.code) && found.some((other) => other.code === f.code!.replace(SPANISH, ""))));
  },
};
