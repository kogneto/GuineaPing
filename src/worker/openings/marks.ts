/**
 * Openings a Member has set aside: shared/openings.ts says what the two marks mean. Each mark is
 * a row of opening_marks, of one of two kinds, named as the table has them:
 * - "round" is "Not this time". Its key is the Opening's id, and `seen` is how the entry stood
 *   when it was marked. The mark counts only while the entry still stands that way.
 * - "study" is "Not for me". Its key is `studyAtClinic`, and it covers every entry of that study
 *   at that Clinic, now and later. It has no `seen`.
 * Marks are each Member's own: every query is by member_id, and the study an Opening belongs to
 * is always worked out here from the stored entry.
 */
import { OPENING_MARKS, asItStood, studyOf, type OpeningMark } from "../../shared/openings";

type MarkRow = { kind: "round" | "study"; key: string; seen: string | null };
/** The columns of a stored entry that its marks are worked out from. */
export type Markable = { id: string; source: string; clinic_id: string; code: string | null; when_text: string | null; first_seen_at: string };

/**
 * The key of a study at one Clinic, or null when the entry has no study code. One source can list
 * several Clinics (Fortrea's four cities), and "Not for me" in one city says nothing about another.
 */
export const studyAtClinic = (r: Pick<Markable, "source" | "clinic_id" | "code">) => {
  const study = studyOf(r.source, r.code);
  return study ? `${r.clinic_id}:${study}` : null;
};

const stands = (r: Markable) => asItStood({ code: r.code, when: r.when_text, firstSeen: r.first_seen_at });
/** Marks kept before 2026-11-24 recorded the day an entry was first seen, not the moment. They still count. */
const stoodByDay = (r: Markable) => asItStood({ code: r.code, when: r.when_text, firstSeen: r.first_seen_at.slice(0, 10) });

/** The statement that fetches one Member's marks, to run alone or in a batch. Its rows go to `readMarks`. */
export const marksQuery = (db: D1Database, memberId: string) => db.prepare("SELECT kind, key, seen FROM opening_marks WHERE member_id = ?").bind(memberId);

/** From one Member's marks, a way to tell how any entry is set aside for them, if it is. */
export function readMarks(rows: unknown[]): (entry: Markable) => OpeningMark | null {
  const notForMe = new Set<string>();
  const notThisTime = new Map<string, string | null>();
  for (const m of rows as MarkRow[]) {
    if (m.kind === "study") notForMe.add(m.key);
    else notThisTime.set(m.key, m.seen);
  }
  return (entry) => {
    const study = studyAtClinic(entry);
    if (study && notForMe.has(study)) return "not_for_me";
    // "Not this time" holds only while the entry stands as it stood when it was marked.
    const stood = notThisTime.get(entry.id);
    return stood === stands(entry) || stood === stoodByDay(entry) ? "not_this_time" : null;
  };
}

/**
 * Sets one Opening aside for a Member, or (with null) puts it back. "Not for me" covers the
 * Opening's whole study, so undoing it brings back every entry of that study.
 */
export async function markOpening(db: D1Database, memberId: string, openingId: unknown, mark: unknown, now: string): Promise<{ ok: true } | { error: string; status: 400 | 404 }> {
  if (mark !== null && !OPENING_MARKS.includes(mark as OpeningMark)) return { error: "Unknown mark", status: 400 };
  const row = typeof openingId === "string" ? await db.prepare("SELECT id, source, clinic_id, code, when_text, first_seen_at FROM clinic_openings WHERE id = ?").bind(openingId).first<Markable>() : null;
  if (!row) return { error: "No such Opening", status: 404 };
  const study = studyAtClinic(row);
  if (mark === "not_for_me" && !study) return { error: "This Clinic gives this entry no study code, so it can only be set aside this time.", status: 400 };
  const drop = (kind: MarkRow["kind"], key: string) => db.prepare("DELETE FROM opening_marks WHERE member_id = ? AND kind = ? AND key = ?").bind(memberId, kind, key);
  const keep = (kind: MarkRow["kind"], key: string, seen: string | null) =>
    db
      .prepare("INSERT INTO opening_marks (member_id, kind, key, seen, created_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(member_id, kind, key) DO UPDATE SET seen = ?4, created_at = ?5")
      .bind(memberId, kind, key, seen, now);
  // One mark at a time: choosing either, or neither, clears the other.
  const statements = [drop("round", row.id), ...(study ? [drop("study", study)] : [])];
  if (mark === "not_this_time") statements.push(keep("round", row.id, stands(row)));
  if (mark === "not_for_me") statements.push(keep("study", study!, null));
  await db.batch(statements);
  return { ok: true };
}
