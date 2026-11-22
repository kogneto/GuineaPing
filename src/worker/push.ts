/**
 * Pushes: how new Alerts are announced on Members' Devices. The Alert list stays the record of
 * truth, so nothing here can fail a Check; a Push that doesn't arrive just means the Member sees
 * the Alert next time they open the app.
 */
import type { Trial } from "../shared/api";
import { keyFacts } from "../shared/plain";
import { b64url, sendPush, type PushMessage, type PushOutcome, type Subscription, type Vapid } from "./webpush";

/** Above this many new Alerts for one Member in one Check, they get a single summary Push. */
export const MAX_SEPARATE_PUSHES = 3;

/** An Alert a Check just created, with what its Push needs to say. */
export type NewAlert = { id: string; memberId: string; trial: Trial; watchNames: string[]; viaPrivateWatch: boolean; sentBy?: string | null };

export function vapidFrom(env: Env): Vapid | null {
  const e = env as Env & Partial<Record<"VAPID_PUBLIC_KEY" | "VAPID_PRIVATE_KEY" | "VAPID_SUBJECT", string>>;
  if (!e.VAPID_PUBLIC_KEY || !e.VAPID_PRIVATE_KEY || !e.VAPID_SUBJECT) return null;
  return { publicKey: e.VAPID_PUBLIC_KEY, privateKey: e.VAPID_PRIVATE_KEY, subject: e.VAPID_SUBJECT };
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * The words on the lock screen. A trial found through a Private watch is never named there, since
 * its title can reveal a condition to whoever glances at the phone.
 */
export function messagesFor(alerts: NewAlert[]): PushMessage[] {
  if (alerts.length > MAX_SEPARATE_PUSHES) {
    return [{ title: `${alerts.length} new trials for you`, body: "Open GuineaPing to see them all.", url: "/", tag: "summary" }];
  }
  return alerts.map((a) =>
    a.viaPrivateWatch
      ? { title: "New trial for your private Watch", body: "Open GuineaPing to see it.", url: `/alerts/${a.id}`, tag: a.id }
      : a.sentBy
        ? { title: clip(`${a.sentBy} sent you a trial`, 120), body: clip(a.trial.title, 240), url: `/alerts/${a.id}`, tag: a.id }
        : {
            title: clip(`New trial: ${a.trial.title}`, 120),
            body: clip([keyFacts(a.trial).join(" · "), `Watch: ${a.watchNames.join(", ")}`].filter(Boolean).join("\n"), 240),
            url: `/alerts/${a.id}`,
            tag: a.id,
          },
  );
}

type DeviceRow = { id: string; member_id: string; endpoint: string; p256dh: string; auth: string };

/**
 * Sends one Member's messages to all their Devices; forgets Devices the push service says are gone.
 * `settled` is false only when the Member has Devices and none of them got anything: worth retrying.
 */
async function deliver(db: D1Database, vapid: Vapid, devices: DeviceRow[], messages: PushMessage[], post: typeof fetch) {
  const jobs = devices.flatMap((d) => messages.map((m) => ({ d, m })));
  const outcomes = await Promise.all(
    jobs.map(({ d, m }) =>
      sendPush(d as Subscription & DeviceRow, m, vapid, post).catch((err): PushOutcome => {
        console.error("Push failed:", err);
        return "failed";
      }),
    ),
  );
  const gone = new Set<string>();
  const sent = new Set<string>();
  outcomes.forEach((o, i) => {
    if (o === "gone") gone.add(jobs[i]!.d.id);
    else if (o === "sent") sent.add(jobs[i]!.d.id);
  });
  const now = new Date().toISOString();
  const statements = [
    ...[...gone].map((id) => db.prepare("DELETE FROM devices WHERE id = ?").bind(id)),
    ...[...sent].filter((id) => !gone.has(id)).map((id) => db.prepare("UPDATE devices SET last_sent_at = ? WHERE id = ?").bind(now, id)),
  ];
  if (statements.length) await db.batch(statements);
  return { sent: outcomes.filter((o) => o === "sent").length, gone: gone.size, settled: sent.size > 0 || !outcomes.includes("failed") };
}

/** How long an Alert no Device has received keeps being retried. After that it lives in the Alert list only. */
const RETRY_MS = 24 * 60 * 60 * 1000;

type PendingRow = { id: string; member_id: string; trial: string; watch_names: string; via_private: number; sent_by: string | null };

/**
 * Announces every Alert not yet pushed: per Member, one Push per Alert, or one summary if there
 * are many. An Alert is settled once any of the Member's Devices got it, or they have no Device
 * to send to; otherwise the next Check tries again, for up to a day.
 */
export async function pushPendingAlerts(db: D1Database, vapid: Vapid, post: typeof fetch = fetch, now = Date.now()) {
  const { results: pending } = await db
    .prepare("SELECT id, member_id, trial, watch_names, via_private, sent_by FROM alerts WHERE pushed_at IS NULL AND created_at > ? ORDER BY created_at")
    .bind(new Date(now - RETRY_MS).toISOString())
    .all<PendingRow>();
  const byMember = new Map<string, NewAlert[]>();
  for (const r of pending) {
    const alert: NewAlert = { id: r.id, memberId: r.member_id, trial: JSON.parse(r.trial) as Trial, watchNames: JSON.parse(r.watch_names) as string[], viaPrivateWatch: r.via_private === 1, sentBy: r.sent_by };
    byMember.set(r.member_id, [...(byMember.get(r.member_id) ?? []), alert]);
  }
  if (!byMember.size) return { sent: 0, gone: 0 };
  const { results: devices } = await db
    .prepare("SELECT id, member_id, endpoint, p256dh, auth FROM devices WHERE member_id IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify([...byMember.keys()]))
    .all<DeviceRow>();
  const totals = { sent: 0, gone: 0 };
  const settled: string[] = [];
  await Promise.all(
    [...byMember].map(async ([memberId, list]) => {
      const mine = devices.filter((d) => d.member_id === memberId);
      // No Device: the Alert list is how this Member hears. Pushes aren't saved up for a later Device.
      const r = mine.length ? await deliver(db, vapid, mine, messagesFor(list), post) : { sent: 0, gone: 0, settled: true };
      totals.sent += r.sent;
      totals.gone += r.gone;
      if (r.settled) settled.push(...list.map((a) => a.id));
    }),
  );
  if (settled.length) {
    await db
      .prepare("UPDATE alerts SET pushed_at = ?1 WHERE id IN (SELECT value FROM json_each(?2))")
      .bind(new Date(now).toISOString(), JSON.stringify(settled))
      .run();
  }
  return totals;
}

/** Sends the "Send test" Push to one Device. */
export async function pushTest(db: D1Database, vapid: Vapid, device: DeviceRow, post: typeof fetch = fetch): Promise<PushOutcome> {
  const message = { title: "GuineaPing test", body: "Notifications work on this device.", url: "/devices", tag: "test" };
  const outcome = await sendPush(device, message, vapid, post).catch((): PushOutcome => "failed");
  await deliverOutcome(db, device.id, outcome);
  return outcome;
}

async function deliverOutcome(db: D1Database, id: string, outcome: PushOutcome) {
  if (outcome === "gone") await db.prepare("DELETE FROM devices WHERE id = ?").bind(id).run();
  if (outcome === "sent") await db.prepare("UPDATE devices SET last_sent_at = ? WHERE id = ?").bind(new Date().toISOString(), id).run();
}

/** Checks a browser's PushSubscription keys look like what RFC 8291 needs. */
export function validKeys(p256dh: unknown, auth: unknown): p256dh is string {
  if (typeof p256dh !== "string" || typeof auth !== "string") return false;
  try {
    const pub = b64url.decode(p256dh);
    return pub.length === 65 && pub[0] === 4 && b64url.decode(auth).length === 16;
  } catch {
    return false;
  }
}
