/** Small helpers for pulling a Clinic's own words out of its page. No DOM: Workers have none. */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘" };

/** The text a reader would see in this piece of HTML, on one line. */
export function text(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/[\s ​]+/g, " ")
    .trim();
}

/** The pieces of `html` that each start at a match of `start`. The last piece runs to `end` or the end. */
export function pieces(html: string, start: RegExp, end?: RegExp): string[] {
  const starts = [...html.matchAll(new RegExp(start.source, start.flags.includes("g") ? start.flags : start.flags + "g"))].map((m) => m.index);
  return starts.map((from, i) => {
    let piece = html.slice(from, starts[i + 1] ?? html.length);
    const stop = end ? piece.search(end) : -1;
    if (stop > 0) piece = piece.slice(0, stop);
    return piece;
  });
}

/** The text between the first match of `from` and the next match of `to` after it, or null. */
export function between(html: string, from: RegExp, to: RegExp): string | null {
  const m = from.exec(html);
  if (!m) return null;
  const rest = html.slice(m.index + m[0].length);
  const stop = rest.search(to);
  const found = text(stop < 0 ? rest : rest.slice(0, stop));
  return found || null;
}

/** The first link in `html`, made absolute against `base`; null unless it is https on that same host. */
export function link(html: string, base: string): string | null {
  const href = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/i.exec(html)?.[1];
  return href ? sameHost(href.replace(/&amp;/g, "&"), base) : null;
}

/** `href` as an absolute https URL on `base`'s host, or null. A Clinic's page never sends Members elsewhere. */
export function sameHost(href: string, base: string): string | null {
  try {
    const url = new URL(href, base);
    return url.protocol === "https:" && url.host === new URL(base).host ? url.toString() : null;
  } catch {
    return null;
  }
}
