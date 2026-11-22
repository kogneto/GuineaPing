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

export type Source = {
  id: SourceId;
  /** The pages to fetch, in order. Usually one. */
  pages: string[];
  /** Turns the fetched pages into entries. Returns [] when it recognises nothing. */
  parse(pages: string[]): Found[];
};
