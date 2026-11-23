/**
 * Pushes: how new Alerts are announced on Members' Devices. The Alert list stays the record of
 * truth, so nothing here can fail a Check; a Push that doesn't arrive just means the Member sees
 * the Alert next time they open the app.
 */
import { alertsToPush, notesToPush, settleNotesPushed, settlePushed } from "./alerts";
import type { Trial } from "../shared/api";
import { keyFacts } from "../shared/plain";
import { b64url, sendPush, type PushMessage, type PushOutcome, type Subscription, type Vapid } from "./webpush";

/** Above this many new Alerts for one Member in one Check, they get a single summary Push. */
export const MAX_SEPARATE_PUSHES = 3;

/** An Alert a Check just created, with what its Push needs to say. */
export type NewAlert = { id: string; memberId: string; trial: Trial; watchNames: string[]; viaPrivateWatch: boolean; sentBy?: string | null; changes?: string[] | null };

export function vapidFrom(env: Env): Vapid | null {
  const e = env as Env & Partial<Record<"VAPID_PUBLIC_KEY" | "VAPID_PRIVATE_KEY" | "VAPID_SUBJECT", string>>;
  if (!e.VAPID_PUBLIC_KEY || !e.VAPID_PRIVATE_KEY || !e.VAPID_SUBJECT) return null;
  return { publicKey: e.VAPID_PUBLIC_KEY, privateKey: e.VAPID_PRIVATE_KEY, subject: e.VAPID_SUBJECT };
}

export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * The words on the lock screen. A trial found through a Private watch is never named there, since
 * its title can reveal a condition to whoever glances at the phone.
 */
export function messagesFor(alerts: NewAlert[]): PushMessage[] {
  if (alerts.length > MAX_SEPARATE_PUSHES) {
    return [{ title: `${alerts.length} trial Alerts for you`, body: "Open GuineaPing to see them all.", url: "/", tag: "summary" }];
  }
  return alerts.map((a) =>
    a.viaPrivateWatch
      ? { title: a.changes ? "Update on a trial from your private Watch" : "New trial for your private Watch", body: "Open GuineaPing to see it.", url: `/alerts/${a.id}`, tag: a.id }
      : a.changes
        ? { title: clip(`Update: ${a.trial.title}`, 120), body: clip(a.changes.join(" · "), 240), url: `/alerts/${a.id}`, tag: a.id }
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

/**
 * The words for a note in the Alert list that is announced, such as a waiting period ending. They
 * say only that there is a note: what it is about could tell whoever glances at the phone that
 * the Member takes part in studies. One Push covers however many notes are waiting.
 */
export const NOTE_MESSAGE: PushMessage = { title: "A note for you in GuineaPing", body: "Open GuineaPing to read it.", url: "/", tag: "note" };

export type DeviceRow = { id: string; member_id: string; endpoint: string; p256dh: string; auth: string };

/**
 * Sends one Member's messages to all their Devices; forgets Devices the push service says are gone.
 * `settled` is false only when the Member has Devices and none of them got anything: worth retrying.
 */
export async function deliver(db: D1Database, vapid: Vapid, devices: DeviceRow[], messages: PushMessage[], post: typeof fetch) {
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

/**
 * Announces every Alert not yet pushed: per Member, one Push per Alert, or one summary if there
 * are many; and one more Push when notes written to be announced are waiting, which never counts
 * as an Alert. Each is settled once any of the Member's Devices got it, or they have no Device to
 * send to; otherwise the next Check tries again, for up to a day.
 */
export async function pushPendingAlerts(db: D1Database, vapid: Vapid, post: typeof fetch = fetch, now = Date.now()) {
  const since = new Date(now - RETRY_MS).toISOString();
  const byMember = new Map<string, { alerts: NewAlert[]; notes: string[] }>();
  const of = (memberId: string) => byMember.get(memberId) ?? byMember.set(memberId, { alerts: [], notes: [] }).get(memberId)!;
  for (const alert of await alertsToPush(db, since)) of(alert.memberId).alerts.push(alert);
  for (const note of await notesToPush(db, since)) of(note.memberId).notes.push(note.id);
  if (!byMember.size) return { sent: 0, gone: 0 };
  const { results: devices } = await db
    .prepare("SELECT id, member_id, endpoint, p256dh, auth FROM devices WHERE member_id IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify([...byMember.keys()]))
    .all<DeviceRow>();
  const totals = { sent: 0, gone: 0 };
  const settled: string[] = [];
  const settledNotes: string[] = [];
  await Promise.all(
    [...byMember].map(async ([memberId, { alerts, notes }]) => {
      const mine = devices.filter((d) => d.member_id === memberId);
      const messages = [...messagesFor(alerts), ...(notes.length ? [NOTE_MESSAGE] : [])];
      // No Device: the Alert list is how this Member hears. Pushes aren't saved up for a later Device.
      const r = mine.length ? await deliver(db, vapid, mine, messages, post) : { sent: 0, gone: 0, settled: true };
      totals.sent += r.sent;
      totals.gone += r.gone;
      if (r.settled) {
        settled.push(...alerts.map((a) => a.id));
        settledNotes.push(...notes);
      }
    }),
  );
  await settlePushed(db, settled, new Date(now).toISOString());
  await settleNotesPushed(db, settledNotes, new Date(now).toISOString());
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
