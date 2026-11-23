/**
 * Reading Clinics' own lists of studies (docs/adr/0003). The rules it keeps:
 * - each source is read at most once an hour, one source per run;
 * - a site that says no (401, 403, 429, or a challenge page) is not tried again until someone
 *   clears the refusal by hand;
 * - requests carry no made-up browser identity: no headers are set at all;
 * - only https links on the source's own host are kept, and text is stored as plain text.
 */
import { CLINICS } from "../../shared/clinics";
import { sameHost } from "./html";
import type { Found, Source } from "./types";

export type Fetcher = (url: string) => Promise<Response>;

/** The plain request: no User-Agent, no cookies, nothing a browser would add. */
export const plainFetch: Fetcher = (url) => fetch(url, { redirect: "follow" });

/**
 * How long a source rests between reads. The runs are six minutes apart and each source's turn
 * comes round once an hour, so this is a little under the hour to let a turn that starts a few
 * seconds early still count.
 */
const REST_MS = 55 * 60 * 1000;
/** Between two pages of the same source. */
const GAP_MS = 3000;
const MAX_TEXT = 300;
const MAX_FOUND = 200;

/** An entry a read found that is news: see `readDueSource`. */
export type FreshOpening = Found & { id: string };

export type ReadResult = {
  source: string;
  status: "ok" | "refused" | "failed" | "nothing found";
  found: number;
  detail?: string;
  /** The entries that are news since the last read. Empty unless the read was ok. */
  fresh: FreshOpening[];
  /** Whether this outcome differs from the source's last one, so a lasting problem is reported once. */
  statusChanged: boolean;
};
type Outcome = Omit<ReadResult, "fresh" | "statusChanged"> & { fresh?: FreshOpening[] };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const looksLikeChallenge = (html: string) => /<title>\s*(Attention Required|Just a moment|Access denied)/i.test(html.slice(0, 2000));

/** Keeps only what is safe to store and show: known Clinic, own-host https link, short plain text. */
export function clean(found: Found[], source: Source): Found[] {
  const base = source.pages[0] ?? "";
  const short = (s: string | null) => (s ? s.slice(0, MAX_TEXT) : null);
  const seen = new Set<string>();
  const out: Found[] = [];
  for (const f of found.slice(0, MAX_FOUND)) {
    const url = sameHost(f.url, base);
    const clinic = CLINICS.find((c) => c.id === f.clinicId && c.source === source.id);
    if (!url || !clinic || !f.key || !f.title || seen.has(f.key)) continue;
    seen.add(f.key);
    out.push({ key: f.key.slice(0, MAX_TEXT), clinicId: f.clinicId, title: f.title.slice(0, MAX_TEXT), pay: short(f.pay), when: short(f.when), stay: short(f.stay), who: short(f.who), code: short(f.code), url });
  }
  return out;
}

/**
 * Reads the one source that has waited longest, if any has rested long enough. Returns null when
 * nothing is due. Never throws for a site's failure: that is a normal outcome, recorded per source.
 *
 * `fresh` is what a Member would call a new Opening: an entry not on the list before, one that
 * had gone and is back, or one whose study code or dates have changed (a Clinic often keeps one
 * page for a study and swaps in the next group). A source's first good read has none: everything
 * on it is new only to GuineaPing.
 */
export async function readDueSource(db: D1Database, sources: Source[], get: Fetcher, now = new Date().toISOString(), wait: (ms: number) => Promise<void> = sleep): Promise<ReadResult | null> {
  const { results: rows } = await db
    .prepare("SELECT source, attempted_at, read_at, refused_at, status FROM clinic_sources")
    .all<{ source: string; attempted_at: string | null; read_at: string | null; refused_at: string | null; status: string | null }>();
  const state = new Map(rows.map((r) => [r.source, r]));
  const cutoff = new Date(Date.parse(now) - REST_MS).toISOString();
  const due = sources
    .filter((s) => !state.get(s.id)?.refused_at && (state.get(s.id)?.attempted_at ?? "") <= cutoff)
    .sort((a, b) => (state.get(a.id)?.attempted_at ?? "").localeCompare(state.get(b.id)?.attempted_at ?? ""))[0];
  if (!due) return null;

  const before = state.get(due.id);
  // Recorded before any request, so a second run this hour cannot read this source again.
  await db.prepare("INSERT INTO clinic_sources (source, attempted_at) VALUES (?1, ?2) ON CONFLICT(source) DO UPDATE SET attempted_at = ?2").bind(due.id, now).run();
  const finish = async (result: Outcome): Promise<ReadResult> => {
    const status = result.detail ? `${result.status}: ${result.detail}` : result.status;
    await db
      .prepare("UPDATE clinic_sources SET status = ?2, read_at = COALESCE(?3, read_at), refused_at = COALESCE(?4, refused_at) WHERE source = ?1")
      .bind(due.id, status, result.status === "ok" ? now : null, result.status === "refused" ? now : null)
      .run();
    return { ...result, fresh: result.fresh ?? [], statusChanged: status !== (before?.status ?? null) };
  };

  const pages: string[] = [];
  for (const [i, url] of due.pages.entries()) {
    if (i) await wait(GAP_MS);
    let res: Response;
    try {
      res = await get(url);
    } catch (err) {
      return finish({ source: due.id, status: "failed", found: 0, detail: String(err instanceof Error ? err.message : err).slice(0, 100) });
    }
    // Read whatever came back: a challenge page can arrive with any status.
    const html = await res.text().catch(() => "");
    if ([401, 403, 429].includes(res.status) || looksLikeChallenge(html)) {
      return finish({ source: due.id, status: "refused", found: 0, detail: `answered ${res.status}` });
    }
    // A redirect off the site means the list has moved; a person should look before anything is read.
    if (!res.ok || (res.url && !sameHost(res.url, url))) {
      return finish({ source: due.id, status: "failed", found: 0, detail: res.ok ? "moved to another site" : `answered ${res.status}` });
    }
    pages.push(html);
  }

  let found: Found[];
  try {
    found = clean(due.parse(pages), due);
  } catch (err) {
    return finish({ source: due.id, status: "failed", found: 0, detail: `parser: ${String(err instanceof Error ? err.message : err).slice(0, 80)}` });
  }
  // Every list read had entries when its parser was written, so an empty result more likely means
  // the page was redesigned than that the Clinic has nothing. Keep what there was and say so.
  if (!found.length) return finish({ source: due.id, status: "nothing found", found: 0 });

  const { results: had } = await db
    .prepare("SELECT id, code, when_text, gone_at FROM clinic_openings WHERE source = ?")
    .bind(due.id)
    .all<{ id: string; code: string | null; when_text: string | null; gone_at: string | null }>();
  const was = new Map(had.map((r) => [r.id, r]));
  const fresh = before?.read_at
    ? found
        .map((f) => ({ ...f, id: `${due.id}:${f.key}` }))
        .filter((f) => {
          const old = was.get(f.id);
          return !old || old.gone_at !== null || (f.code !== null && f.code !== old.code) || (f.when !== null && f.when !== old.when_text);
        })
    : [];

  const news = new Set(fresh.map((f) => f.id));

  // An entry that is news counts as first seen now, whether it went from the list and is back or
  // its group or dates changed: the page marks it New and "Newest listed" puts it on top, so what
  // a Push called new is new on the page too.
  const upsert = db.prepare(
    `INSERT INTO clinic_openings (id, source, clinic_id, title, pay, when_text, stay, who, code, url, first_seen_at, last_seen_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)
     ON CONFLICT(id) DO UPDATE SET clinic_id = ?3, title = ?4, pay = ?5, when_text = ?6, stay = ?7, who = ?8, code = ?9, url = ?10, last_seen_at = ?11,
       first_seen_at = CASE WHEN clinic_openings.gone_at IS NULL AND ?12 = 0 THEN clinic_openings.first_seen_at ELSE ?11 END, gone_at = NULL`,
  );
  await db.batch([
    ...found.map((f) => upsert.bind(`${due.id}:${f.key}`, due.id, f.clinicId, f.title, f.pay, f.when, f.stay, f.who, f.code, f.url, now, news.has(`${due.id}:${f.key}`) ? 1 : 0)),
    db.prepare("UPDATE clinic_openings SET gone_at = ?2 WHERE source = ?1 AND gone_at IS NULL AND last_seen_at < ?2").bind(due.id, now),
  ]);
  return finish({ source: due.id, status: "ok", found: found.length, fresh });
}
