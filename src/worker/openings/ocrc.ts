import { link, pieces, text } from "./html";
import type { Found, Source } from "./types";

const PAGE = "https://ocrc.net/current-studies/";

/** OCRC lists each study by its short name, with a page of its own. The list gives no pay or dates. */
export const ocrc: Source = {
  id: "ocrc",
  pages: [PAGE],
  parse([html = ""]) {
    const found: Found[] = [];
    for (const card of pieces(html, /<div class="col-sm-4 cs_li">/, /<\/div>\s*<\/div>/)) {
      const heading = /<h3\b[^>]*>([\s\S]*?)<\/h3>/.exec(card)?.[1] ?? "";
      const url = link(heading, PAGE);
      const name = text(heading);
      if (!url || !name) continue;
      found.push({ key: new URL(url).pathname, clinicId: "ocrc", title: name, pay: null, when: null, stay: null, who: null, code: name, url });
    }
    return found;
  },
};
