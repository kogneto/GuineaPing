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
export type NewAlert = { id: string; memberId: string; trial: Trial; watchNames: string[]; viaPrivateWatch: boolean };

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
    return [{ title: `${alerts.length} new trials match your Watches`, body: "Open GuineaPing to see them all.", url: "/", tag: "summary" }];
  }
  return alerts.map((a) =>
    a.viaPrivateWatch
      ? { title: "New trial for your private Watch", body: "Open GuineaPing to see it.", url: `/alerts/${a.id}`, tag: a.id }
      : {
          title: clip(`New trial: ${a.trial.title}`, 120),
          body: clip([keyFacts(a.trial).join(" · "), `Watch: ${a.watchNames.join(", ")}`].filter(Boolean).join("\n"), 240),
          url: `/alerts/${a.id}`,
          tag: a.id,
        },
  );
}

type DeviceRow = { id: string; member_id: string; endpoint: string; p256dh: string; auth: string };

/** Sends one Member's messages to all their Devices; forgets Devices the push service says are gone. */
async function deliver(db: D1Database, vapid: Vapid, devices: DeviceRow[], messages: PushMessage[], post: typeof fetch) {
  const jobs = devices.flatMap((d) => messages.map((m) => ({ d, m })));
  const outcomes = await Promise.allSettled(jobs.map(({ d, m }) => sendPush(d as Subscription & DeviceRow, m, vapid, post)));
  const gone = new Set<string>();
  const sent = new Set<string>();
  outcomes.forEach((o, i) => {
    const id = jobs[i]!.d.id;
    if (o.status === "fulfilled" && o.value === "gone") gone.add(id);
    else if (o.status === "fulfilled" && o.value === "sent") sent.add(id);
    else if (o.status === "rejected") console.error("Push failed:", o.reason);
  });
  const now = new Date().toISOString();
  const statements = [
    ...[...gone].map((id) => db.prepare("DELETE FROM devices WHERE id = ?").bind(id)),
    ...[...sent].filter((id) => !gone.has(id)).map((id) => db.prepare("UPDATE devices SET last_sent_at = ? WHERE id = ?").bind(now, id)),
  ];
  if (statements.length) await db.batch(statements);
  return { sent: outcomes.filter((o) => o.status === "fulfilled" && o.value === "sent").length, gone: gone.size };
}

/** Announces a Check's new Alerts: per Member, one Push per Alert, or one summary if there are many. */
export async function pushNewAlerts(db: D1Database, vapid: Vapid, alerts: NewAlert[], post: typeof fetch = fetch) {
  const byMember = new Map<string, NewAlert[]>();
  for (const a of alerts) byMember.set(a.memberId, [...(byMember.get(a.memberId) ?? []), a]);
  if (!byMember.size) return { sent: 0, gone: 0 };
  const { results: devices } = await db
    .prepare("SELECT id, member_id, endpoint, p256dh, auth FROM devices WHERE member_id IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify([...byMember.keys()]))
    .all<DeviceRow>();
  const totals = { sent: 0, gone: 0 };
  await Promise.all(
    [...byMember].map(async ([memberId, list]) => {
      const mine = devices.filter((d) => d.member_id === memberId);
      if (!mine.length) return;
      const r = await deliver(db, vapid, mine, messagesFor(list), post);
      totals.sent += r.sent;
      totals.gone += r.gone;
    }),
  );
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
