/**
 * Pushes for new Openings: a Member who asked for them at a Clinic hears as soon as a Clinic read
 * finds one there. Sent once, straight after the read. Nothing is saved to retry: the Clinics page
 * is the record, and an Opening that was not pushed is still there, marked New.
 */
import { CLINICS } from "../../shared/clinics";
import { studyKey } from "../clinics";
import { clip, deliver, MAX_SEPARATE_PUSHES, type DeviceRow } from "../push";
import type { PushMessage, Vapid } from "../webpush";
import type { FreshOpening } from "./read";

/**
 * The words on the lock screen. They name the Clinic and give the entry in the Clinic's own words,
 * which is what makes the Push worth having; the Member chose that per Clinic, and is told so
 * where they choose. Many at once become one Push, so a redesigned list cannot flood a phone.
 */
export function openingMessages(fresh: FreshOpening[]): PushMessage[] {
  if (fresh.length > MAX_SEPARATE_PUSHES) {
    return [{ title: `${fresh.length} new Openings at Clinics you chose`, body: "Open GuineaPing to see them.", url: "/clinics", tag: "openings" }];
  }
  return fresh.map((o) => {
    const clinic = CLINICS.find((c) => c.id === o.clinicId);
    return {
      title: clip(`New at ${clinic ? `${clinic.name}, ${clinic.place}` : "a Clinic"}`, 120),
      body: clip([o.title, o.pay, o.when, o.stay].filter(Boolean).join(" · "), 240),
      url: "/clinics",
      tag: o.id,
    };
  });
}

/**
 * Tells each Member who asked about these Clinics, leaving out any Opening of a study they marked
 * "Not for me". A Member with no Device gets nothing: they see it on the Clinics page.
 */
export async function pushNewOpenings(db: D1Database, vapid: Vapid, source: string, fresh: FreshOpening[], post: typeof fetch = fetch): Promise<{ sent: number; gone: number }> {
  const totals = { sent: 0, gone: 0 };
  if (!fresh.length) return totals;
  const clinicIds = JSON.stringify([...new Set(fresh.map((o) => o.clinicId))]);
  const [asked, marks, devices] = await db.batch([
    db.prepare("SELECT p.member_id, p.clinic_id FROM clinic_pushes p JOIN members m ON m.id = p.member_id AND m.removed_at IS NULL WHERE p.clinic_id IN (SELECT value FROM json_each(?1))").bind(clinicIds),
    db.prepare("SELECT member_id, key FROM opening_marks WHERE kind = 'study' AND member_id IN (SELECT member_id FROM clinic_pushes WHERE clinic_id IN (SELECT value FROM json_each(?1)))").bind(clinicIds),
    db.prepare("SELECT id, member_id, endpoint, p256dh, auth FROM devices WHERE member_id IN (SELECT member_id FROM clinic_pushes WHERE clinic_id IN (SELECT value FROM json_each(?1)))").bind(clinicIds),
  ]);
  const chosen = new Map<string, Set<string>>();
  for (const r of (asked?.results ?? []) as { member_id: string; clinic_id: string }[]) chosen.set(r.member_id, (chosen.get(r.member_id) ?? new Set()).add(r.clinic_id));
  const notForMe = new Set(((marks?.results ?? []) as { member_id: string; key: string }[]).map((m) => `${m.member_id} ${m.key}`));
  const allDevices = (devices?.results ?? []) as DeviceRow[];
  await Promise.all(
    [...chosen].map(async ([memberId, clinics]) => {
      const mine = allDevices.filter((d) => d.member_id === memberId);
      const theirs = fresh.filter((o) => {
        const study = studyKey({ source, clinic_id: o.clinicId, code: o.code });
        return clinics.has(o.clinicId) && !(study && notForMe.has(`${memberId} ${study}`));
      });
      if (!mine.length || !theirs.length) return;
      const r = await deliver(db, vapid, mine, openingMessages(theirs), post);
      totals.sent += r.sent;
      totals.gone += r.gone;
    }),
  );
  return totals;
}
