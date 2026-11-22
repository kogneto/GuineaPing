/**
 * Watches and Follows. Visibility rules live here, so every route gets them: a Private watch does
 * not exist for anyone but its Owner, and who follows a Watch is never returned.
 */
import type { Criteria, Me, Trial, Watch, WatchInput } from "../shared/api";
import { withDefaults } from "../shared/ctgov";

type WatchRow = {
  id: string;
  owner_id: string;
  name: string;
  criteria: string;
  private: number;
  following: number;
};

const VISIBLE = "w.deleted_at IS NULL AND (w.private = 0 OR w.owner_id = ?1)";
const SELECT_WATCH = `
  SELECT w.id, w.owner_id, w.name, w.criteria, w.private,
         EXISTS (SELECT 1 FROM follows f WHERE f.watch_id = w.id AND f.member_id = ?1 AND f.ended_at IS NULL) AS following
  FROM watches w`;

function toWatch(row: WatchRow, me: Me): Watch {
  return {
    id: row.id,
    name: row.name,
    criteria: withDefaults(JSON.parse(row.criteria) as Partial<Criteria>),
    private: row.private === 1,
    isOwner: row.owner_id === me.memberId,
    following: row.following === 1,
  };
}

export async function listWatches(db: D1Database, me: Me): Promise<Watch[]> {
  const { results } = await db.prepare(`${SELECT_WATCH} WHERE ${VISIBLE} ORDER BY w.name COLLATE NOCASE`).bind(me.memberId).all<WatchRow>();
  return results.map((r) => toWatch(r, me));
}

/** The Watch if `me` may see it, else null: callers answer 404 either way. */
export async function getWatch(db: D1Database, me: Me, id: string): Promise<Watch | null> {
  const row = await db.prepare(`${SELECT_WATCH} WHERE w.id = ?2 AND ${VISIBLE}`).bind(me.memberId, id).first<WatchRow>();
  return row ? toWatch(row, me) : null;
}

/** Records Trials as already found for a Watch, so a Check never alerts on them. One query, however many. */
function seed(db: D1Database, watchId: string, trials: Trial[], now: string) {
  return db
    .prepare("INSERT OR IGNORE INTO watch_trials (watch_id, nct_id, found_at) SELECT ?1, value, ?2 FROM json_each(?3)")
    .bind(watchId, now, JSON.stringify(trials.map((t) => t.nctId)));
}

/** Creates a Watch owned and followed by `me`; its current Recent matches never cause Alerts. */
export async function createWatch(db: D1Database, me: Me, input: WatchInput, recent: Trial[], now: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.batch([
    db
      .prepare("INSERT INTO watches (id, owner_id, name, criteria, private, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, me.memberId, input.name, JSON.stringify(input.criteria), input.private ? 1 : 0, now, now),
    db.prepare("INSERT INTO follows (id, member_id, watch_id, followed_at) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), me.memberId, id, now),
    seed(db, id, recent, now),
  ]);
  return id;
}

/** Ends every other Member's Follow of a Watch, leaving each of them a one-time note. */
function endOthersFollows(db: D1Database, watchId: string, ownerId: string, message: string, now: string) {
  return [
    db
      .prepare(
        `INSERT INTO notes (id, member_id, message, created_at)
         SELECT lower(hex(randomblob(16))), member_id, ?1, ?2 FROM follows
         WHERE watch_id = ?3 AND member_id != ?4 AND ended_at IS NULL`,
      )
      .bind(message, now, watchId, ownerId),
    db.prepare("UPDATE follows SET ended_at = ?1 WHERE watch_id = ?2 AND member_id != ?3 AND ended_at IS NULL").bind(now, watchId, ownerId),
  ];
}

export type OwnerResult = "ok" | "not-found" | "not-owner";

/**
 * Changes a Watch. `recent` is given when its criteria changed: the new criteria's Recent matches
 * are seeded so the change itself sets off no Alerts.
 */
export async function updateWatch(
  db: D1Database,
  me: Me,
  id: string,
  input: WatchInput,
  recent: Trial[] | null,
  now: string,
): Promise<OwnerResult> {
  const watch = await getWatch(db, me, id);
  if (!watch) return "not-found";
  if (!watch.isOwner) return "not-owner";
  const statements = [
    db
      .prepare("UPDATE watches SET name = ?, criteria = ?, private = ?, updated_at = ? WHERE id = ?")
      .bind(input.name, JSON.stringify(input.criteria), input.private ? 1 : 0, now, id),
  ];
  if (recent) statements.push(seed(db, id, recent, now));
  if (input.private && !watch.private) {
    statements.push(...endOthersFollows(db, id, me.memberId, `“${watch.name}” was made private by its Owner, so you no longer get Alerts for it.`, now));
  }
  await db.batch(statements);
  return "ok";
}

export async function deleteWatch(db: D1Database, me: Me, id: string, now: string): Promise<OwnerResult> {
  const watch = await getWatch(db, me, id);
  if (!watch) return "not-found";
  if (!watch.isOwner) return "not-owner";
  await db.batch([
    ...endOthersFollows(db, id, me.memberId, `“${watch.name}” was deleted by its Owner, so you no longer get Alerts for it.`, now),
    db.prepare("UPDATE follows SET ended_at = ?1 WHERE watch_id = ?2 AND ended_at IS NULL").bind(now, id),
    db.prepare("UPDATE watches SET deleted_at = ? WHERE id = ?").bind(now, id),
  ]);
  return "ok";
}

/** Follows or unfollows a visible Watch. Returns false if `me` cannot see it. */
export async function setFollowing(db: D1Database, me: Me, id: string, follow: boolean, now: string): Promise<boolean> {
  const watch = await getWatch(db, me, id);
  if (!watch) return false;
  if (follow && !watch.following) {
    await db
      .prepare("INSERT INTO follows (id, member_id, watch_id, followed_at) VALUES (?, ?, ?, ?)")
      .bind(crypto.randomUUID(), me.memberId, id, now)
      .run();
  } else if (!follow && watch.following) {
    await db.prepare("UPDATE follows SET ended_at = ? WHERE member_id = ? AND watch_id = ? AND ended_at IS NULL").bind(now, me.memberId, id).run();
  }
  return true;
}

export function parseWatchInput(body: unknown, criteria: Criteria): WatchInput | { error: string } {
  const raw = (body ?? {}) as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return { error: "A Watch needs a name" };
  if (name.length > 100) return { error: "Keep the name under 100 characters" };
  return { name, criteria, private: raw.private === true };
}
