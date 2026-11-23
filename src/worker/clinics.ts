/**
 * The Clinics page: every Clinic GuineaPing knows, with the Openings read from those it reads, and
 * which of them the Member has set aside. Marks are each Member's own: every query is by member_id,
 * and the study an Opening belongs to is always worked out here from the stored entry.
 */
import type { ClinicItem, Near, Opening } from "../shared/api";
import { CLINICS } from "../shared/clinics";
import { milesBetween } from "../shared/ctgov";
import { OPENING_MARKS, roundSeen, studyOf, type OpeningMark } from "../shared/openings";

type Row = { id: string; source: string; clinic_id: string; title: string; pay: string | null; when_text: string | null; stay: string | null; who: string | null; code: string | null; url: string; first_seen_at: string };
type MarkRow = { kind: "round" | "study"; key: string; seen: string | null };

const studyKey = (r: { source: string; code: string | null }) => {
  const study = studyOf(r.source, r.code);
  return study ? `${r.source}:${study}` : null;
};
const seenOf = (r: { code: string | null; when_text: string | null; first_seen_at: string }) => roundSeen({ code: r.code, when: r.when_text, firstSeen: r.first_seen_at.slice(0, 10) });

export async function listClinics(db: D1Database, near: Near | null, memberId: string): Promise<ClinicItem[]> {
  const [openings, sources, marks] = await db.batch([
    db.prepare("SELECT id, source, clinic_id, title, pay, when_text, stay, who, code, url, first_seen_at FROM clinic_openings WHERE gone_at IS NULL ORDER BY first_seen_at DESC, title"),
    db.prepare("SELECT source, read_at, refused_at FROM clinic_sources"),
    db.prepare("SELECT kind, key, seen FROM opening_marks WHERE member_id = ?").bind(memberId),
  ]);
  const studies = new Set<string>();
  const rounds = new Map<string, string | null>();
  for (const m of (marks?.results ?? []) as MarkRow[]) {
    if (m.kind === "study") studies.add(m.key);
    else rounds.set(m.key, m.seen);
  }
  const byClinic = new Map<string, Opening[]>();
  for (const r of (openings?.results ?? []) as Row[]) {
    const study = studyKey(r);
    // "Not this time" holds only while the entry says what it said when it was marked.
    const mark: OpeningMark | null = study && studies.has(study) ? "not_for_me" : rounds.get(r.id) === seenOf(r) ? "not_this_time" : null;
    const list = byClinic.get(r.clinic_id) ?? [];
    list.push({ id: r.id, title: r.title, pay: r.pay, when: r.when_text, stay: r.stay, who: r.who, code: r.code, url: r.url, firstSeen: r.first_seen_at.slice(0, 10), mark, canMarkStudy: study !== null });
    byClinic.set(r.clinic_id, list);
  }
  const state = new Map(((sources?.results ?? []) as { source: string; read_at: string | null; refused_at: string | null }[]).map((s) => [s.source, s]));
  const items = CLINICS.map((clinic): ClinicItem => {
    const s = clinic.source ? state.get(clinic.source) : undefined;
    return {
      id: clinic.id,
      name: clinic.name,
      place: clinic.place,
      url: clinic.url,
      miles: near ? Math.round(milesBetween(near, clinic)) : null,
      read: clinic.source !== null,
      lastReadAt: s?.read_at ?? null,
      refused: !!s?.refused_at,
      openings: byClinic.get(clinic.id) ?? [],
    };
  });
  return items.sort((a, b) => (a.miles ?? 0) - (b.miles ?? 0) || a.name.localeCompare(b.name) || a.place.localeCompare(b.place));
}

/**
 * Sets one Opening aside for a Member, or (with null) puts it back. "Not for me" covers the
 * Opening's whole study, so undoing it brings back every entry of that study.
 */
export async function markOpening(db: D1Database, memberId: string, openingId: unknown, mark: unknown, now: string): Promise<{ ok: true } | { error: string; status: 400 | 404 }> {
  if (mark !== null && !OPENING_MARKS.includes(mark as OpeningMark)) return { error: "Unknown mark", status: 400 };
  const row = typeof openingId === "string" ? await db.prepare("SELECT id, source, code, when_text, first_seen_at FROM clinic_openings WHERE id = ?").bind(openingId).first<Pick<Row, "id" | "source" | "code" | "when_text" | "first_seen_at">>() : null;
  if (!row) return { error: "No such Opening", status: 404 };
  const study = studyKey(row);
  if (mark === "not_for_me" && !study) return { error: "This Clinic gives this entry no study code, so it can only be set aside this time.", status: 400 };
  const drop = (kind: MarkRow["kind"], key: string) => db.prepare("DELETE FROM opening_marks WHERE member_id = ? AND kind = ? AND key = ?").bind(memberId, kind, key);
  const keep = (kind: MarkRow["kind"], key: string, seen: string | null) =>
    db
      .prepare("INSERT INTO opening_marks (member_id, kind, key, seen, created_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(member_id, kind, key) DO UPDATE SET seen = ?4, created_at = ?5")
      .bind(memberId, kind, key, seen, now);
  // One mark at a time: choosing either, or neither, clears the other.
  const statements = [drop("round", row.id), ...(study ? [drop("study", study)] : [])];
  if (mark === "not_this_time") statements.push(keep("round", row.id, seenOf(row)));
  if (mark === "not_for_me") statements.push(keep("study", study!, null));
  await db.batch(statements);
  return { ok: true };
}
