import { sameHost, text } from "./html";
import type { Found, Source } from "./types";

const PAGE = "https://axispays.com/browse-current-studies/";

/**
 * Axis Clinicals, Dilworth MN. The page is built from loose headings, so a study is the run of
 * headings before its "Learn More" button: a title, "Study Code #2213", "BMI" and its range, "AGE"
 * and its range, sometimes "Allows Light Smokers", and "Receive up to $4,000". A run with no study
 * code is not a study: the free health screens. Other lines, such as a sign-up bonus, are not
 * headings, and are left out.
 */
export const axis: Source = {
  id: "axis",
  pages: [PAGE],
  parse([html = ""]) {
    const from = html.indexOf("Current Studies:");
    if (from < 0) return [];
    const list = html.slice(from);
    const found: Found[] = [];
    const seen = new Set<string>();
    let last = 0;
    for (const button of list.matchAll(/<a class="elementor-button[^"]*"[^>]*href="([^"]+)"/g)) {
      const run = list.slice(last, button.index);
      last = button.index! + button[0].length;
      const url = sameHost(button[1]!.replace(/&amp;/g, "&"), PAGE);
      const headings = [...run.matchAll(/class="elementor-heading-title[^"]*"[^>]*>([\s\S]*?)<\/(?:h\d|p|span)>/g)].map((m) => text(m[1] ?? "")).filter(Boolean);
      const code = headings.map((h) => /^Study Code #\s*(.+)$/i.exec(h)?.[1]).find(Boolean) ?? null;
      if (!url || !code || seen.has(url)) continue;
      seen.add(url);
      const after = (label: string) => {
        const i = headings.findIndex((h) => h.toUpperCase() === label);
        return i >= 0 ? (headings[i + 1] ?? null) : null;
      };
      const bmi = after("BMI");
      const age = after("AGE");
      found.push({
        key: new URL(url).pathname,
        clinicId: "axis-dilworth",
        title: headings[0]!,
        pay: headings.find((h) => /^Receive\b.*\$\s?\d/i.test(h)) ?? null,
        when: null,
        stay: null,
        who: [bmi && `BMI ${bmi}`, age && `Age ${age}`, ...headings.filter((h) => /smok/i.test(h))].filter(Boolean).join(", ") || null,
        code,
        url,
      });
    }
    return found;
  },
};
