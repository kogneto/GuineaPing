import type { SourceId } from "../../shared/clinics";

/** What a parser makes of one entry on a Clinic's list. Every text field is the Clinic's own wording. */
export type Found = {
  /** Stable for this entry within its source, so tomorrow's read recognises it. */
  key: string;
  /** Which Clinic in src/shared/clinics.ts it is at. */
  clinicId: string;
  title: string;
  pay: string | null;
  when: string | null;
  stay: string | null;
  who: string | null;
  code: string | null;
  /** https, on the source's own host. */
  url: string;
};

/**
 * A page to fetch: a URL, or a URL and the form a Clinic's own list page sends with it (Parexel's
 * does). A form is sent as the request's body, nothing else.
 */
export type Page = string | { url: string; form: Record<string, string> };

export type Source = {
  id: SourceId;
  /** The pages to fetch, in order. Usually one. */
  pages: Page[];
  /**
   * The Clinic's own site, where its Openings link, when the pages come from another host (a
   * recruitment company's). Openings must link to its host. Unset, that is the first page's host.
   */
  site?: string;
  /** Turns the fetched pages into entries. Returns [] when it recognises nothing. */
  parse(pages: string[]): Found[];
};
