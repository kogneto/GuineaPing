/**
 * Updates: telling a Member when a Trial they already have an Alert for changes in a way that
 * matters to them. It starts recruiting, or adds a site within the distance of the Watch that
 * found it, or of their Profile. The Alert itself is refreshed and turns unread; there is still one Alert per Trial.
 */
import type { Criteria, Near, Trial } from "../shared/api";
import { findUpdated, milesBetween, sitesOf, toTrial, type FetchJson } from "../shared/ctgov";
import { alertsFollowed, refreshAlert } from "./alerts";
import { daysBefore, OVERLAP_DAYS } from "./check";
import { nearByMember } from "./profile";

/** Alerts older than this are no longer followed for Updates. */
const FOLLOW_DAYS = 730;
/** How many new nearby sites an Update names before saying "and N more". */
const SITES_NAMED = 2;

/** What changed for one Alert, in the words the Member reads. Empty when nothing worth telling. */
export function changesFor(old: Trial, fresh: Trial, sites: ReturnType<typeof sitesOf>, nears: Near[]): string[] {
  const changes: string[] = [];
  if (fresh.status === "RECRUITING" && old.status !== "RECRUITING") changes.push("Now recruiting");
  const added = new Map<string, number>();
  for (const site of sites) {
    if (old.locations.includes(site.place)) continue;
    for (const near of nears) {
      const miles = Math.round(milesBetween(near, site));
      if (miles <= near.miles && miles < (added.get(site.short) ?? Infinity)) added.set(site.short, miles);
    }
  }
  const named = [...added].sort((a, b) => a[1] - b[1]);
  if (named.length) {
    const list = named.slice(0, SITES_NAMED).map(([place, miles]) => `${place} (${miles < 1 ? "under 1" : miles} mi)`);
    const more = named.length > SITES_NAMED ? ` and ${named.length - SITES_NAMED} more` : "";
    changes.push(`New site${named.length > 1 ? "s" : ""} near you: ${list.join("; ")}${more}`);
  }
  return changes;
}

export async function runUpdates(db: D1Database, get: FetchJson, now = new Date().toISOString()): Promise<{ updated: number }> {
  const state = await db.prepare("SELECT checked_at FROM update_state WHERE id = 1").first<{ checked_at: string }>();
  const since = daysBefore(state?.checked_at ?? now, OVERLAP_DAYS);
  const saveState = db.prepare("INSERT INTO update_state (id, checked_at) VALUES (1, ?1) ON CONFLICT(id) DO UPDATE SET checked_at = ?1").bind(now);

  // "Not for me" means exactly that: those Alerts stay quiet.
  const alerts = await alertsFollowed(db, daysBefore(now, FOLLOW_DAYS));
  const changed = await findUpdated([...new Set(alerts.map((a) => a.nctId))], since, get);
  const affected = alerts.filter((a) => changed.has(a.nctId));
  if (!affected.length) {
    await saveState.run();
    return { updated: 0 };
  }

  // Where "near you" is for each Alert: the ZIP codes of the Watches the Member still follows that found this Trial.
  const { results: places } = await db
    .prepare(
      `SELECT a.id AS alert_id, w.criteria FROM alerts a
       JOIN follows f ON f.member_id = a.member_id AND f.ended_at IS NULL
       JOIN watches w ON w.id = f.watch_id AND w.deleted_at IS NULL
       JOIN watch_trials wt ON wt.watch_id = w.id AND wt.nct_id = a.nct_id
       WHERE a.id IN (SELECT value FROM json_each(?))`,
    )
    .bind(JSON.stringify(affected.map((a) => a.id)))
    .all<{ alert_id: string; criteria: string }>();
  const nearsOf = new Map<string, Near[]>();
  for (const p of places) {
    const near = (JSON.parse(p.criteria) as Partial<Criteria>).near;
    if (near) nearsOf.set(p.alert_id, [...(nearsOf.get(p.alert_id) ?? []), near]);
  }

  // And the Member's own Profile, when it gives a ZIP code.
  const profileNear = await nearByMember(db, affected.map((a) => a.memberId));
  for (const a of affected) {
    const near = profileNear.get(a.memberId);
    if (near) nearsOf.set(a.id, [...(nearsOf.get(a.id) ?? []), near]);
  }

  const statements: D1PreparedStatement[] = [];
  let updated = 0;
  for (const a of affected) {
    const raw = changed.get(a.nctId);
    const fresh = toTrial(raw);
    if (!fresh) continue;
    const old = a.trial;
    const nears = nearsOf.get(a.id) ?? [];
    const sites = sitesOf(raw);
    // Keep "nearest site" meaning what it meant when alerted: nearest to the Watches' ZIP codes.
    let nearest = old.nearest;
    for (const site of sites) {
      for (const near of nears) {
        const miles = Math.round(milesBetween(near, site));
        if (!nearest || miles < nearest.miles) nearest = { place: site.short, miles };
      }
    }
    const changes = changesFor(old, fresh, sites, nears);
    if (changes.length) updated++;
    const statement = refreshAlert(db, a, { ...fresh, ...(nearest !== undefined ? { nearest } : {}) }, changes, now);
    if (statement) statements.push(statement);
  }
  await db.batch([...statements, saveState]);
  return { updated };
}
