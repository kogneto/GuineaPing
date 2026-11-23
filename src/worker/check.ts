/**
 * The hourly Check: ask ClinicalTrials.gov what each Watch matches, record what each Watch finds
 * for the first time, and turn that into Alerts, at most one per Member per Trial.
 */
import type { CheckStatus, Criteria, Trial } from "../shared/api";
import { storedCriteria } from "../shared/criteria";
import { everyMatch, fetchJson, findMatches, findTrials, nearestOf, type FetchJson, type Match } from "../shared/ctgov";
import { createAlerts, createdAmong, type AlertToCreate } from "./alerts";
import { nearByMember } from "./profile";
import { pushPendingAlerts, vapidFrom, type NewAlert } from "./push";
import { report } from "./report";
import { runUpdates } from "./updates";
import { tellWaitsOver } from "./waiting";

/**
 * How far before a Watch's last successful check to look again. ClinicalTrials.gov refreshes its
 * data about once a day, so a Trial can appear dated a day or two back. Re-finding it is harmless:
 * watch_trials remembers what each Watch has already found.
 */
export const OVERLAP_DAYS = 3;
/** Recent matches look back this far, and a new Watch's Recent matches never cause Alerts. */
export const RECENT_DAYS = 30;
/** How long Checks may fail before Members are told. */
const STALE_MS = 24 * 60 * 60 * 1000;

export const daysBefore = (iso: string, days: number) =>
  new Date(Date.parse(iso) - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

/**
 * What a Watch matches today, to be recorded as already seen. `knows` says how complete that is:
 * "all" when every matching Trial is in `nctIds`, so a Check may alert on any Trial it has not
 * seen; "recent" when the Watch matches too many to record, and only the last 30 days' are.
 */
export type Known = { knows: "all" | "recent"; nctIds: string[] };

/** Asks ClinicalTrials.gov what `criteria` match today. Throws when it can't be reached. */
export async function knownMatches(criteria: Criteria, get: FetchJson, now = new Date().toISOString()): Promise<Known> {
  const all = await everyMatch(criteria, get);
  if (all) return { knows: "all", nctIds: all };
  const recent = await findTrials(criteria, daysBefore(now, RECENT_DAYS), get, { pageSize: 100, maxPages: 10 });
  return { knows: "recent", nctIds: recent.map((t) => t.nctId) };
}

export type CheckResult = {
  /** False only when no Watch could be checked at all. */
  ok: boolean;
  watchesChecked: number;
  /** Watches ClinicalTrials.gov couldn't be asked about this time; each catches up on its own. */
  watchesFailed: number;
  alertsCreated: number;
  /** Exactly the Alerts this Check created. */
  newAlerts: NewAlert[];
  error?: string;
};

const message = (err: unknown) => String(err instanceof Error ? err.message : err).slice(0, 500);

export async function runCheck(db: D1Database, get: FetchJson, now = new Date().toISOString()): Promise<CheckResult> {
  // Finish time is the start plus how long this run took, so a Check given its own clock stays on it.
  const clock = Date.now();
  const finishedAt = () => new Date(Date.parse(now) + (Date.now() - clock)).toISOString();

  // Every Watch is asked about, even one nobody follows right now: it must keep recording what it
  // finds, or whoever follows it next would be alerted on Trials posted before they followed.
  const { results: watches } = await db
    .prepare("SELECT w.id, w.name, w.criteria, w.private, w.checked_at, w.created_at, w.knows FROM watches w WHERE w.deleted_at IS NULL")
    .all<{ id: string; name: string; criteria: string; private: number; checked_at: string | null; created_at: string; knows: "all" | "recent" | null }>();

  // Each Watch looks back from its own last successful check, so one that fails for days still
  // misses nothing once it works again, and never holds the others back.
  const found: { watchId: string; watchName: string; isPrivate: boolean; matches: Match[] }[] = [];
  const failed: { id: string; error: string }[] = [];
  // Watches made before `knows` was kept: what each turns out to match today, recorded with this Check.
  const learned: { watchId: string; known: Known }[] = [];
  let earliest = daysBefore(now, OVERLAP_DAYS);
  for (const w of watches) {
    const since = daysBefore(w.checked_at ?? w.created_at, OVERLAP_DAYS);
    if (since < earliest) earliest = since;
    const criteria = storedCriteria(w.criteria);
    try {
      // A Watch that knows everything it matched looks at Trials changed since its last check, so
      // it also finds an old Trial that has only now come to match. Any other looks at new ones.
      const matches = await findMatches(criteria, since, get, w.knows === "all" ? { by: "updated", maxPages: 10 } : {});
      found.push({ watchId: w.id, watchName: w.name, isPrivate: w.private === 1, matches });
      // Learned after this Check's own look, which was by first-posted date: so a Trial posted
      // this hour still causes its Alert, and everything older is recorded without one.
      if (w.knows === null) learned.push({ watchId: w.id, known: await knownMatches(criteria, get, now) });
    } catch (err) {
      // Not learning is no failure: the Watch was checked, and the next Check tries again.
      if (!found.some((f) => f.watchId === w.id)) failed.push({ id: w.id, error: message(err) });
    }
  }

  const record = (result: CheckResult) =>
    db
      .prepare(
        "INSERT INTO checks (id, started_at, finished_at, ok, since, watches_checked, alerts_created, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(crypto.randomUUID(), now, finishedAt(), result.ok ? 1 : 0, earliest, result.watchesChecked, result.alertsCreated, result.error ?? null);
  const markFailed = db
    .prepare(
      `UPDATE watches SET failing_since = COALESCE(failing_since, ?1),
         check_error = (SELECT j.value ->> '$.error' FROM json_each(?2) j WHERE j.value ->> '$.id' = watches.id)
       WHERE id IN (SELECT j.value ->> '$.id' FROM json_each(?2) j)`,
    )
    .bind(now, JSON.stringify(failed));

  // Nothing could be asked: ClinicalTrials.gov is down, or unreachable. The Check itself failed.
  if (watches.length && !found.length) {
    const result: CheckResult = { ok: false, watchesChecked: 0, watchesFailed: failed.length, alertsCreated: 0, newAlerts: [], error: failed[0]!.error };
    await db.batch([markFailed, record(result)]);
    return result;
  }

  // Which of those each Watch is seeing for the first time, and who follows it.
  const { results: known } = await db
    .prepare(
      `SELECT wt.watch_id, wt.nct_id FROM watch_trials wt
       JOIN json_each(?1) j ON wt.watch_id = j.value ->> '$.w' AND wt.nct_id = j.value ->> '$.n'`,
    )
    .bind(JSON.stringify(found.flatMap((f) => f.matches.map((m) => ({ w: f.watchId, n: m.trial.nctId })))))
    .all<{ watch_id: string; nct_id: string }>();
  const knownKeys = new Set(known.map((k) => `${k.watch_id} ${k.nct_id}`));
  const firstFinds: ({ watchId: string; watchName: string; isPrivate: boolean } & Match)[] = [];
  for (const { watchId, watchName, isPrivate, matches } of found) {
    for (const match of matches) if (!knownKeys.has(`${watchId} ${match.trial.nctId}`)) firstFinds.push({ watchId, watchName, isPrivate, ...match });
  }

  const watchIds = [...new Set(firstFinds.map((f) => f.watchId))];
  const { results: follows } = watchIds.length
    ? await db
        .prepare("SELECT watch_id, member_id FROM follows WHERE ended_at IS NULL AND watch_id IN (SELECT value FROM json_each(?))")
        .bind(JSON.stringify(watchIds))
        .all<{ watch_id: string; member_id: string }>()
    : { results: [] };

  // A Watch with no ZIP code says nothing about distance; the Member's own Profile can.
  const nearOf = await nearByMember(db, follows.map((f) => f.member_id));
  const forMember = ({ trial, sites }: Match, memberId: string): Trial => {
    const near = nearOf.get(memberId);
    const nearest = !trial.nearest && near ? nearestOf(sites, [near]) : null;
    return nearest ? { ...trial, nearest } : trial;
  };

  // One Alert per Member per Trial, naming every Watch of theirs that found it.
  const alerts = new Map<string, AlertToCreate>();
  for (const { watchId, watchName, isPrivate, trial, sites } of firstFinds) {
    for (const f of follows) {
      if (f.watch_id !== watchId) continue;
      const key = `${f.member_id} ${trial.nctId}`;
      const alert = alerts.get(key) ?? { id: crypto.randomUUID(), memberId: f.member_id, trial: forMember({ trial, sites }, f.member_id), watchNames: [], viaPrivateWatch: false };
      if (!alert.watchNames.includes(watchName)) alert.watchNames.push(watchName);
      alert.viaPrivateWatch ||= isPrivate;
      alerts.set(key, alert);
    }
  }

  const wanted = [...alerts.values()];
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT OR IGNORE INTO watch_trials (watch_id, nct_id, found_at)
         SELECT value ->> '$.w', value ->> '$.n', ?1 FROM json_each(?2)`,
      )
      .bind(now, JSON.stringify(firstFinds.map((f) => ({ w: f.watchId, n: f.trial.nctId })))),
    // A Member alerted on this Trial by an earlier Check (through another Watch) is skipped here.
    createAlerts(db, wanted, now),
    db
      .prepare("UPDATE watches SET checked_at = ?1, failing_since = NULL, check_error = NULL WHERE id IN (SELECT value FROM json_each(?2))")
      .bind(now, JSON.stringify(found.map((f) => f.watchId))),
    markFailed,
    ...learned.flatMap(({ watchId, known }) => [
      db.prepare("INSERT OR IGNORE INTO watch_trials (watch_id, nct_id, found_at) SELECT ?1, value, ?2 FROM json_each(?3)").bind(watchId, now, JSON.stringify(known.nctIds)),
      db.prepare("UPDATE watches SET knows = ? WHERE id = ? AND knows IS NULL").bind(known.knows, watchId),
    ]),
  ];
  const [, inserted] = await db.batch<{ id: string }>(statements);
  const newAlerts: NewAlert[] = createdAmong(wanted, inserted);
  const result: CheckResult = { ok: true, watchesChecked: found.length, watchesFailed: failed.length, alertsCreated: newAlerts.length, newAlerts };
  await record(result).run();
  return result;
}

/**
 * A Check, then Updates, then Pushes: this Check's new Alerts and Updates, and any from the last day that no
 * Device has received yet. Push trouble is logged, never fatal: the Alerts are already in
 * everyone's Alert list.
 */
export async function checkAndPush(env: Env, get: FetchJson = fetchJson, post: typeof fetch = fetch): Promise<CheckResult & { updates?: number; pushes?: { sent: number; gone: number } }> {
  const result: CheckResult & { updates?: number } = await runCheck(env.DB, get);
  // Updates to Trials Members already have Alerts for. Trouble here never undoes the Check.
  try {
    result.updates = (await runUpdates(env.DB, get)).updated;
  } catch (err) {
    report("Looking for Updates failed", err);
  }
  // Waiting periods that have ended: a line in the Member's Alert list, which the Pushes below
  // announce without saying what it is about.
  try {
    await tellWaitsOver(env.DB);
  } catch (err) {
    report("Telling Members a waiting period is over failed", err);
  }
  const vapid = vapidFrom(env);
  if (!vapid) {
    if (result.newAlerts.length) console.warn("VAPID keys not set; new Alerts are in Alert lists but no Pushes were sent.");
    return result;
  }
  try {
    return { ...result, pushes: await pushPendingAlerts(env.DB, vapid, post) };
  } catch (err) {
    report("Pushing Alerts failed", err);
    return result;
  }
}

export async function checkStatus(db: D1Database, now = Date.now()): Promise<CheckStatus> {
  const last = await db.prepare("SELECT finished_at FROM checks WHERE ok = 1 ORDER BY started_at DESC LIMIT 1").first<{ finished_at: string }>();
  const anyFailure = await db.prepare("SELECT 1 AS x FROM checks WHERE ok = 0 LIMIT 1").first();
  const lastCheckedAt = last?.finished_at ?? null;
  // Before the very first Check nothing is late; after that, a day without a good Check is.
  const stale = lastCheckedAt ? now - Date.parse(lastCheckedAt) > STALE_MS : !!anyFailure;
  return { lastCheckedAt, stale };
}

/** Whether a Watch has gone over a day without a successful check: whoever can see it should know. */
export const isFailing = (failingSince: string | null, now = Date.now()) => !!failingSince && now - Date.parse(failingSince) > STALE_MS;
