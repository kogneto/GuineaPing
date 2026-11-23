/**
 * Alerts: one notice to one Member about one Trial. Everything that reads or writes an Alert goes
 * through here, so its rules live in one place:
 * - a Member never has two Alerts for the same Trial (the table refuses a second; callers are
 *   told which ones were really created), and a Watch that finds the Trial later is added to
 *   the one they have, quietly;
 * - an Alert is pushed until a Device gets it, and an Update makes it unread and pushed again;
 * - an Alert marked "Not for me" gets no Updates;
 * - an Alert is only ever read, sorted or sent by its own Member;
 * - a note in the Alert list is pushed only when it was written to be announced.
 * A Check, Updates and Pushes each keep their own logic and ask this module to store the result.
 */
import { MARKS, MAX_NOTE_CHARS, type AlertItem, type AlertListItem, type Mark, type Me, type Trial } from "../shared/api";
import { forList } from "../shared/ctgov";
import type { NewAlert } from "./push";

type AlertRow = { id: string; trial: string; watch_names: string; created_at: string; read_at: string | null; mark: Mark | null; note: string | null; sent_by: string | null; via_private: number; update_text: string | null; updated_at: string | null };
const COLUMNS = "id, trial, watch_names, created_at, read_at, mark, note, sent_by, via_private, update_text, updated_at";
type NoteRow = { id: string; message: string; created_at: string; read_at: string | null };

/** How many items the Alert list shows. */
const LIST_SIZE = 200;

/** `full` keeps the Entry criteria, for an Alert's own page; the Alert list leaves them out. */
const toAlert = (r: AlertRow, full = false): AlertItem => ({
  kind: "alert",
  id: r.id,
  trial: full ? (JSON.parse(r.trial) as Trial) : forList(JSON.parse(r.trial) as Trial),
  watchNames: JSON.parse(r.watch_names) as string[],
  createdAt: r.created_at,
  read: r.read_at !== null,
  mark: r.mark,
  note: r.note ?? "",
  sentBy: r.sent_by,
  update: r.update_text && r.updated_at ? { at: r.updated_at, changes: JSON.parse(r.update_text) as string[] } : null,
  viaPrivateWatch: r.via_private === 1,
});

/** A Member's Alert list: their latest Alerts and notes, newest first. */
export async function listAlerts(db: D1Database, memberId: string): Promise<AlertListItem[]> {
  const [alerts, notes] = await db.batch<AlertRow | NoteRow>([
    db.prepare(`SELECT ${COLUMNS} FROM alerts WHERE member_id = ? ORDER BY COALESCE(updated_at, created_at) DESC LIMIT ${LIST_SIZE}`).bind(memberId),
    db.prepare(`SELECT id, message, created_at, read_at FROM notes WHERE member_id = ? ORDER BY created_at DESC LIMIT ${LIST_SIZE}`).bind(memberId),
  ]);
  const items: AlertListItem[] = [
    ...(alerts!.results as AlertRow[]).map((r) => toAlert(r)),
    ...(notes!.results as NoteRow[]).map((r): AlertListItem => ({ kind: "note", id: r.id, message: r.message, createdAt: r.created_at, read: r.read_at !== null })),
  ];
  // An Alert with an Update sits where the Update happened, not where the Alert first did.
  const when = (i: AlertListItem) => (i.kind === "alert" && i.update ? i.update.at : i.createdAt);
  items.sort((a, b) => when(b).localeCompare(when(a)));
  return items.slice(0, LIST_SIZE);
}

/** One of the Member's own Alerts, with its Trial's Entry criteria; null when it isn't theirs. */
export async function getAlert(db: D1Database, memberId: string, id: string): Promise<AlertItem | null> {
  const row = await db.prepare(`SELECT ${COLUMNS} FROM alerts WHERE id = ? AND member_id = ?`).bind(id, memberId).first<AlertRow>();
  return row ? toAlert(row, true) : null;
}

export type Refusal = { error: string; status: 400 | 404 };

/** A Member sorts one of their own Alerts: a mark, a private note, or both. */
export async function sortAlert(db: D1Database, memberId: string, id: string, input: unknown): Promise<AlertItem | Refusal> {
  const body = (input ?? {}) as { mark?: unknown; note?: unknown };
  const sets: string[] = [];
  const values: (string | null)[] = [];
  if ("mark" in body) {
    if (body.mark !== null && !MARKS.includes(body.mark as Mark)) return { error: "Unknown mark", status: 400 };
    sets.push("mark = ?");
    values.push(body.mark as Mark | null);
  }
  if ("note" in body) {
    if (typeof body.note !== "string" || body.note.length > MAX_NOTE_CHARS) return { error: `Keep the note under ${MAX_NOTE_CHARS} characters`, status: 400 };
    sets.push("note = ?");
    values.push(body.note.trim() || null);
  }
  if (!sets.length) return { error: "Nothing to change", status: 400 };
  const row = await db
    .prepare(`UPDATE alerts SET ${sets.join(", ")} WHERE id = ? AND member_id = ? RETURNING ${COLUMNS}`)
    .bind(...values, id, memberId)
    .first<AlertRow>();
  return row ? toAlert(row, true) : { error: "No such Alert", status: 404 };
}

/** Marks one of the Member's own Alerts, or notes in their Alert list, as read. Reading twice changes nothing. */
export async function markRead(db: D1Database, memberId: string, what: "alerts" | "notes", id: string, now: string): Promise<void> {
  await db.prepare(`UPDATE ${what} SET read_at = COALESCE(read_at, ?) WHERE id = ? AND member_id = ?`).bind(now, id, memberId).run();
}

/**
 * Sends one of the Member's Alerts to another Member, named by email. They get it as an Alert of
 * their own, or, if the Trial is already in their Alert list, a note saying who sent it. The sender
 * is told the same thing either way, so sending never reveals what someone else has been alerted on.
 * `created` says whether there is a new Alert to push.
 */
export async function sendAlert(db: D1Database, me: Me, id: string, toEmail: unknown, now: string): Promise<{ created: boolean } | Refusal> {
  const email = String(toEmail ?? "").trim().toLowerCase();
  if (!email) return { error: "Enter the email address of the Member to send it to", status: 400 };
  if (email === me.email) return { error: "That's your own email address", status: 400 };
  const alert = await db.prepare("SELECT nct_id, trial FROM alerts WHERE id = ? AND member_id = ?").bind(id, me.memberId).first<{ nct_id: string; trial: string }>();
  if (!alert) return { error: "No such Alert", status: 404 };
  const to = await db.prepare("SELECT id FROM members WHERE email = ? AND removed_at IS NULL").bind(email).first<{ id: string }>();
  if (!to) return { error: "No Member has signed in with that email address. Check the spelling.", status: 404 };
  const created = await db
    .prepare("INSERT OR IGNORE INTO alerts (id, member_id, nct_id, trial, watch_names, via_private, sent_by, created_at) VALUES (?, ?, ?, ?, '[]', 0, ?, ?) RETURNING id")
    .bind(crypto.randomUUID(), to.id, alert.nct_id, alert.trial, me.email, now)
    .first<{ id: string }>();
  if (!created) {
    const title = (JSON.parse(alert.trial) as Trial).title;
    await db
      .prepare("INSERT INTO notes (id, member_id, message, created_at) VALUES (?, ?, ?, ?)")
      .bind(crypto.randomUUID(), to.id, `${me.email} sent you “${title}”. It's already in your Alerts.`, now)
      .run();
  }
  return { created: !!created };
}

/** An Alert a Check wants to create. */
export type AlertToCreate = { id: string; memberId: string; trial: Trial; watchNames: string[]; viaPrivateWatch: boolean };

/**
 * The statement that creates these Alerts, for a Check to run together with its own records. A
 * Member who already has an Alert for a Trial is skipped. The statement returns the ids it really
 * created: pass its result to `createdAmong`.
 */
export function createAlerts(db: D1Database, alerts: AlertToCreate[], now: string): D1PreparedStatement {
  const rows = alerts.map((a) => ({ id: a.id, member_id: a.memberId, nct_id: a.trial.nctId, trial: JSON.stringify(a.trial), watch_names: JSON.stringify(a.watchNames), via_private: a.viaPrivateWatch ? 1 : 0 }));
  return db
    .prepare(
      `INSERT OR IGNORE INTO alerts (id, member_id, nct_id, trial, watch_names, via_private, created_at)
       SELECT value ->> '$.id', value ->> '$.member_id', value ->> '$.nct_id',
              value ->> '$.trial', value ->> '$.watch_names', value ->> '$.via_private', ?1
       FROM json_each(?2)
       RETURNING id`,
    )
    .bind(now, JSON.stringify(rows));
}

/**
 * The statements that add Watch names to Alerts these Members already have: a Trial a Member was
 * alerted on, or was sent, that another Watch of theirs has now found. Such an Alert is not new,
 * so it stays as read as it was, keeps its mark and is not pushed again. A Private watch among
 * them makes it an Alert that came through a Private watch.
 */
export async function nameWatches(db: D1Database, alerts: AlertToCreate[]): Promise<D1PreparedStatement[]> {
  if (!alerts.length) return [];
  const { results } = await db
    .prepare(
      `SELECT a.id, a.member_id, a.nct_id, a.watch_names, a.via_private FROM alerts a
       JOIN json_each(?1) j ON a.member_id = j.value ->> '$.m' AND a.nct_id = j.value ->> '$.n'`,
    )
    .bind(JSON.stringify(alerts.map((a) => ({ m: a.memberId, n: a.trial.nctId }))))
    .all<{ id: string; member_id: string; nct_id: string; watch_names: string; via_private: number }>();
  const statements: D1PreparedStatement[] = [];
  for (const row of results) {
    const found = alerts.find((a) => a.memberId === row.member_id && a.trial.nctId === row.nct_id);
    if (!found) continue;
    const had = JSON.parse(row.watch_names) as string[];
    const names = [...had, ...found.watchNames.filter((name) => !had.includes(name))];
    const viaPrivate = row.via_private === 1 || found.viaPrivateWatch;
    if (names.length === had.length && viaPrivate === (row.via_private === 1)) continue;
    statements.push(db.prepare("UPDATE alerts SET watch_names = ?, via_private = ? WHERE id = ?").bind(JSON.stringify(names), viaPrivate ? 1 : 0, row.id));
  }
  return statements;
}

/** Of the Alerts handed to `createAlerts`, the ones its statement really created. */
export function createdAmong(alerts: AlertToCreate[], result: D1Result<{ id: string }> | undefined): AlertToCreate[] {
  const ids = new Set((result?.results ?? []).map((r) => r.id));
  return alerts.filter((a) => ids.has(a.id));
}

/** An Alert whose Trial may get an Update. */
export type FollowedAlert = { id: string; memberId: string; nctId: string; trial: Trial; stored: string };

/** The Alerts still followed for Updates: created since `since`, and not marked "Not for me". */
export async function alertsFollowed(db: D1Database, since: string): Promise<FollowedAlert[]> {
  const { results } = await db
    .prepare("SELECT id, member_id, nct_id, trial FROM alerts WHERE (mark IS NULL OR mark != 'not_for_me') AND created_at > ?")
    .bind(since)
    .all<{ id: string; member_id: string; nct_id: string; trial: string }>();
  return results.map((r) => ({ id: r.id, memberId: r.member_id, nctId: r.nct_id, trial: JSON.parse(r.trial) as Trial, stored: r.trial }));
}

/**
 * The statement that brings an Alert's Trial up to date, or null when nothing differs. With
 * `changes` it is an Update: the Alert says what changed, turns unread and is pushed again.
 * Without, the Alert quietly shows today's facts.
 */
export function refreshAlert(db: D1Database, alert: FollowedAlert, trial: Trial, changes: string[], now: string): D1PreparedStatement | null {
  const snapshot = JSON.stringify(trial);
  if (changes.length) {
    return db.prepare("UPDATE alerts SET trial = ?, update_text = ?, updated_at = ?, read_at = NULL, pushed_at = NULL WHERE id = ?").bind(snapshot, JSON.stringify(changes), now, alert.id);
  }
  return snapshot === alert.stored ? null : db.prepare("UPDATE alerts SET trial = ? WHERE id = ?").bind(snapshot, alert.id);
}

/** Every Alert no Device has received yet, created or updated since `since`, oldest first. */
export async function alertsToPush(db: D1Database, since: string): Promise<NewAlert[]> {
  const { results } = await db
    .prepare("SELECT id, member_id, trial, watch_names, via_private, sent_by, update_text FROM alerts WHERE pushed_at IS NULL AND COALESCE(updated_at, created_at) > ? ORDER BY created_at")
    .bind(since)
    .all<{ id: string; member_id: string; trial: string; watch_names: string; via_private: number; sent_by: string | null; update_text: string | null }>();
  return results.map((r) => ({
    id: r.id,
    memberId: r.member_id,
    trial: JSON.parse(r.trial) as Trial,
    watchNames: JSON.parse(r.watch_names) as string[],
    viaPrivateWatch: r.via_private === 1,
    sentBy: r.sent_by,
    changes: r.update_text ? (JSON.parse(r.update_text) as string[]) : null,
  }));
}

/** A note in a Member's Alert list that is also announced on their Devices. */
export type NoteToPush = { id: string; memberId: string };

/** Every announced note no Device has received yet, written since `since`. */
export async function notesToPush(db: D1Database, since: string): Promise<NoteToPush[]> {
  const { results } = await db
    .prepare("SELECT id, member_id FROM notes WHERE announce = 1 AND pushed_at IS NULL AND created_at > ? ORDER BY created_at")
    .bind(since)
    .all<{ id: string; member_id: string }>();
  return results.map((r) => ({ id: r.id, memberId: r.member_id }));
}

/** Records that these notes have been pushed, or have nobody to be pushed to: they are not tried again. */
export async function settleNotesPushed(db: D1Database, ids: string[], now: string): Promise<void> {
  if (!ids.length) return;
  await db.prepare("UPDATE notes SET pushed_at = ?1 WHERE id IN (SELECT value FROM json_each(?2))").bind(now, JSON.stringify(ids)).run();
}

/** Records that these Alerts have been pushed, or have nobody to be pushed to: they are not tried again. */
export async function settlePushed(db: D1Database, ids: string[], now: string): Promise<void> {
  if (!ids.length) return;
  await db.prepare("UPDATE alerts SET pushed_at = ?1 WHERE id IN (SELECT value FROM json_each(?2))").bind(now, JSON.stringify(ids)).run();
}
