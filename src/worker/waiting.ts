/** Past studies and their waiting periods. Each Member's are their own: every query is by member_id. */
import { freeOn, MAX_PAST_STUDIES, normalizePastStudy, type PastStudy } from "../shared/waiting";

type Row = { id: string; label: string; ended_on: string; last_dose_on: string | null; wait_days: number; free_on: string };

const toPastStudy = (r: Row): PastStudy => ({ id: r.id, label: r.label, endedOn: r.ended_on, lastDoseOn: r.last_dose_on, waitDays: r.wait_days, freeOn: r.free_on });

/** The Member's Past studies, the one that keeps them waiting longest first. */
export async function listPastStudies(db: D1Database, memberId: string): Promise<PastStudy[]> {
  const { results } = await db
    .prepare("SELECT id, label, ended_on, last_dose_on, wait_days, free_on FROM past_studies WHERE member_id = ? ORDER BY free_on DESC, created_at DESC")
    .bind(memberId)
    .all<Row>();
  return results.map(toPastStudy);
}

export async function addPastStudy(db: D1Database, memberId: string, input: unknown, now: string): Promise<PastStudy | { error: string }> {
  const today = now.slice(0, 10);
  const study = normalizePastStudy(input, today);
  if ("error" in study) return study;
  const count = await db.prepare("SELECT COUNT(*) AS n FROM past_studies WHERE member_id = ?").bind(memberId).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_PAST_STUDIES) return { error: `You can keep ${MAX_PAST_STUDIES} past studies. Remove an old one first.` };
  const row: Row = { id: crypto.randomUUID(), label: study.label, ended_on: study.endedOn, last_dose_on: study.lastDoseOn, wait_days: study.waitDays, free_on: freeOn(study.endedOn, study.lastDoseOn, study.waitDays) };
  // A waiting period already over when it is written down needs no telling.
  await db
    .prepare("INSERT INTO past_studies (id, member_id, label, ended_on, last_dose_on, wait_days, free_on, told_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(row.id, memberId, row.label, row.ended_on, row.last_dose_on, row.wait_days, row.free_on, row.free_on <= today ? now : null, now)
    .run();
  return toPastStudy(row);
}

/** Removes one of the Member's own Past studies. False when it isn't theirs or isn't there. */
export async function removePastStudy(db: D1Database, memberId: string, id: string): Promise<boolean> {
  const done = await db.prepare("DELETE FROM past_studies WHERE id = ? AND member_id = ?").bind(id, memberId).run();
  return (done.meta.changes ?? 0) > 0;
}

/**
 * Tells each Member, once, in their Alert list, that a waiting period is over. The message names
 * no study or Clinic. It waits until the day has passed in UTC, so it never comes early for
 * anyone in the United States. Returns how many Members were told something.
 */
export async function tellWaitsOver(db: D1Database, now = new Date().toISOString()): Promise<number> {
  const today = now.slice(0, 10);
  const { results: due } = await db
    .prepare("SELECT p.id, p.member_id, p.free_on FROM past_studies p JOIN members m ON m.id = p.member_id AND m.removed_at IS NULL WHERE p.told_at IS NULL AND p.free_on < ?")
    .bind(today)
    .all<{ id: string; member_id: string; free_on: string }>();
  if (!due.length) return 0;
  // One message per Member, for their latest date, however many periods ended together.
  const latest = new Map<string, string>();
  for (const d of due) if (d.free_on > (latest.get(d.member_id) ?? "")) latest.set(d.member_id, d.free_on);
  // Only when no other Past study still keeps them waiting.
  const { results: waiting } = await db.prepare("SELECT DISTINCT member_id FROM past_studies WHERE free_on >= ?").bind(today).all<{ member_id: string }>();
  const stillWaiting = new Set(waiting.map((w) => w.member_id));
  const tell = [...latest].filter(([memberId]) => !stillWaiting.has(memberId));
  await db.batch([
    ...tell.map(([memberId, day]) =>
      db
        .prepare("INSERT INTO notes (id, member_id, message, created_at) VALUES (?, ?, ?, ?)")
        .bind(crypto.randomUUID(), memberId, `Your waiting period ended on ${day}, going by the dates you gave. Each study sets its own rule, so ask the clinic before you book a screening.`, now),
    ),
    db.prepare("UPDATE past_studies SET told_at = ?1 WHERE told_at IS NULL AND free_on < ?2").bind(now, today),
  ]);
  return tell.length;
}
