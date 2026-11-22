/**
 * The hourly Check: ask ClinicalTrials.gov what each followed Watch matches, record what each Watch
 * finds for the first time, and turn that into Alerts, at most one per Member per Trial.
 */
import type { CheckStatus, Criteria, Trial } from "../shared/api";
import { findTrials, type FetchJson } from "../shared/ctgov";

/**
 * How far before the last successful Check's day to look again. ClinicalTrials.gov refreshes its
 * data about once a day, so a Trial can appear dated a day or two back. Re-finding it is harmless:
 * watch_trials remembers what each Watch has already found.
 */
export const OVERLAP_DAYS = 3;
/** Recent matches look back this far, and a new Watch's Recent matches never cause Alerts. */
export const RECENT_DAYS = 30;
/** How long Checks may fail before every Member is told. */
const STALE_MS = 24 * 60 * 60 * 1000;

export const daysBefore = (iso: string, days: number) =>
  new Date(Date.parse(iso) - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

export type CheckResult = { ok: boolean; watchesChecked: number; alertsCreated: number; error?: string };

export async function runCheck(db: D1Database, get: FetchJson, now = new Date().toISOString()): Promise<CheckResult> {
  const last = await db.prepare("SELECT started_at FROM checks WHERE ok = 1 ORDER BY started_at DESC LIMIT 1").first<{ started_at: string }>();
  const since = daysBefore(last?.started_at ?? now, OVERLAP_DAYS);

  // Every Watch is asked about, even one nobody follows right now: it must keep recording what it
  // finds, or whoever follows it next would be alerted on Trials posted before they followed.
  const { results: watches } = await db
    .prepare("SELECT w.id, w.name, w.criteria FROM watches w WHERE w.deleted_at IS NULL")
    .all<{ id: string; name: string; criteria: string }>();

  const record = (result: CheckResult) =>
    db
      .prepare(
        "INSERT INTO checks (id, started_at, finished_at, ok, since, watches_checked, alerts_created, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(crypto.randomUUID(), now, new Date().toISOString(), result.ok ? 1 : 0, since, result.watchesChecked, result.alertsCreated, result.error ?? null);

  // Ask about every Watch before writing anything: a Check succeeds whole or not at all, so a
  // failure never moves `since` past Trials nobody was told about.
  const found: { watchId: string; watchName: string; trials: Trial[] }[] = [];
  try {
    for (const w of watches) {
      found.push({ watchId: w.id, watchName: w.name, trials: await findTrials(JSON.parse(w.criteria) as Criteria, since, get) });
    }
  } catch (err) {
    const result: CheckResult = { ok: false, watchesChecked: 0, alertsCreated: 0, error: String(err instanceof Error ? err.message : err).slice(0, 500) };
    await record(result).run();
    return result;
  }

  // Which of those each Watch is seeing for the first time, and who follows it.
  const firstFinds: { watchId: string; watchName: string; trial: Trial }[] = [];
  for (const { watchId, watchName, trials } of found) {
    if (!trials.length) continue;
    const { results: known } = await db
      .prepare("SELECT nct_id FROM watch_trials WHERE watch_id = ?1 AND nct_id IN (SELECT value FROM json_each(?2))")
      .bind(watchId, JSON.stringify(trials.map((t) => t.nctId)))
      .all<{ nct_id: string }>();
    const knownIds = new Set(known.map((k) => k.nct_id));
    for (const trial of trials) if (!knownIds.has(trial.nctId)) firstFinds.push({ watchId, watchName, trial });
  }

  const watchIds = [...new Set(firstFinds.map((f) => f.watchId))];
  const { results: follows } = watchIds.length
    ? await db
        .prepare("SELECT watch_id, member_id FROM follows WHERE ended_at IS NULL AND watch_id IN (SELECT value FROM json_each(?))")
        .bind(JSON.stringify(watchIds))
        .all<{ watch_id: string; member_id: string }>()
    : { results: [] };

  // One Alert per Member per Trial, naming every Watch of theirs that found it.
  const alerts = new Map<string, { id: string; member_id: string; nct_id: string; trial: string; watchNames: string[] }>();
  for (const { watchId, watchName, trial } of firstFinds) {
    for (const f of follows) {
      if (f.watch_id !== watchId) continue;
      const key = `${f.member_id} ${trial.nctId}`;
      const alert = alerts.get(key) ?? { id: crypto.randomUUID(), member_id: f.member_id, nct_id: trial.nctId, trial: JSON.stringify(trial), watchNames: [] };
      if (!alert.watchNames.includes(watchName)) alert.watchNames.push(watchName);
      alerts.set(key, alert);
    }
  }

  const rows = [...alerts.values()].map((a) => ({ ...a, watch_names: JSON.stringify(a.watchNames) }));
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT OR IGNORE INTO watch_trials (watch_id, nct_id, found_at)
         SELECT json_extract(value, '$.w'), json_extract(value, '$.n'), ?1 FROM json_each(?2)`,
      )
      .bind(now, JSON.stringify(firstFinds.map((f) => ({ w: f.watchId, n: f.trial.nctId })))),
    // A Member alerted on this Trial by an earlier Check (through another Watch) is skipped here.
    db
      .prepare(
        `INSERT OR IGNORE INTO alerts (id, member_id, nct_id, trial, watch_names, created_at)
         SELECT json_extract(value, '$.id'), json_extract(value, '$.member_id'), json_extract(value, '$.nct_id'),
                json_extract(value, '$.trial'), json_extract(value, '$.watch_names'), ?1
         FROM json_each(?2)`,
      )
      .bind(now, JSON.stringify(rows)),
  ];
  const [, inserted] = await db.batch([...statements]);
  const result: CheckResult = { ok: true, watchesChecked: watches.length, alertsCreated: inserted?.meta.changes ?? 0 };
  await record(result).run();
  return result;
}

export async function checkStatus(db: D1Database, now = Date.now()): Promise<CheckStatus> {
  const last = await db.prepare("SELECT finished_at FROM checks WHERE ok = 1 ORDER BY started_at DESC LIMIT 1").first<{ finished_at: string }>();
  const anyFailure = await db.prepare("SELECT 1 AS x FROM checks WHERE ok = 0 LIMIT 1").first();
  const lastCheckedAt = last?.finished_at ?? null;
  // Before the very first Check nothing is late; after that, a day without a good Check is.
  const stale = lastCheckedAt ? now - Date.parse(lastCheckedAt) > STALE_MS : !!anyFailure;
  return { lastCheckedAt, stale };
}
