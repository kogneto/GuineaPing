/**
 * The Clinics page: every Clinic GuineaPing knows, with the Openings read from those it reads, and
 * a Member's own choices about a Clinic: taking it off their list, and asking for a Push about
 * new Openings there. How an Opening is set aside is worked out in openings/marks.ts. All of it
 * is each Member's own: every query is by member_id.
 */
import type { ClinicItem, Near, Opening } from "../shared/api";
import { CLINICS } from "../shared/clinics";
import { milesBetween } from "../shared/ctgov";
import { marksQuery, readMarks, studyAtClinic, type Markable } from "./openings/marks";

type Row = Markable & { title: string; pay: string | null; stay: string | null; who: string | null; url: string };

export async function listClinics(db: D1Database, near: Near | null, memberId: string): Promise<ClinicItem[]> {
  const [openings, sources, marks, pushes, off] = await db.batch([
    db.prepare("SELECT id, source, clinic_id, title, pay, when_text, stay, who, code, url, first_seen_at FROM clinic_openings WHERE gone_at IS NULL ORDER BY first_seen_at DESC, title"),
    db.prepare("SELECT source, read_at, refused_at FROM clinic_sources"),
    marksQuery(db, memberId),
    db.prepare("SELECT clinic_id FROM clinic_pushes WHERE member_id = ?").bind(memberId),
    db.prepare("SELECT clinic_id FROM clinics_off_list WHERE member_id = ?").bind(memberId),
  ]);
  const offList = new Set(((off?.results ?? []) as { clinic_id: string }[]).map((p) => p.clinic_id));
  const pushed = new Set(((pushes?.results ?? []) as { clinic_id: string }[]).map((p) => p.clinic_id));
  const markOf = readMarks(marks?.results ?? []);
  const byClinic = new Map<string, Opening[]>();
  for (const r of (openings?.results ?? []) as Row[]) {
    const list = byClinic.get(r.clinic_id) ?? [];
    list.push({ id: r.id, title: r.title, pay: r.pay, when: r.when_text, stay: r.stay, who: r.who, code: r.code, url: r.url, firstSeen: r.first_seen_at.slice(0, 10), mark: markOf(r), canMarkStudy: studyAtClinic(r) !== null });
    byClinic.set(r.clinic_id, list);
  }
  const state = new Map(((sources?.results ?? []) as { source: string; read_at: string | null; refused_at: string | null }[]).map((s) => [s.source, s]));
  const items = CLINICS.map((clinic): ClinicItem => {
    const s = clinic.source ? state.get(clinic.source) : undefined;
    return {
      id: clinic.id,
      name: clinic.name,
      place: clinic.place,
      url: clinic.url,
      miles: near ? Math.round(milesBetween(near, clinic)) : null,
      read: clinic.source !== null,
      lastReadAt: s?.read_at ?? null,
      refused: !!s?.refused_at,
      pushNew: pushed.has(clinic.id),
      offList: offList.has(clinic.id),
      openings: byClinic.get(clinic.id) ?? [],
    };
  });
  return items.sort((a, b) => (a.miles ?? 0) - (b.miles ?? 0) || a.name.localeCompare(b.name) || a.place.localeCompare(b.place));
}

/** Turns a Member's Push for new Openings at one Clinic on or off. Only a Clinic that is read can have one. */
export async function setClinicPush(db: D1Database, memberId: string, clinicId: unknown, on: unknown, now: string): Promise<{ ok: true } | { error: string; status: 400 | 404 }> {
  const clinic = CLINICS.find((c) => c.id === clinicId);
  if (!clinic) return { error: "No such Clinic", status: 404 };
  if (typeof on !== "boolean") return { error: "Say whether the Push is on or off", status: 400 };
  if (on && !clinic.source) return { error: "GuineaPing doesn't read this Clinic's list, so it can't tell you about new Openings there.", status: 400 };
  if (on && (await db.prepare("SELECT 1 FROM clinics_off_list WHERE member_id = ? AND clinic_id = ?").bind(memberId, clinic.id).first())) {
    return { error: "You took this Clinic off your list. Put it back first.", status: 400 };
  }
  await (on
    ? db.prepare("INSERT INTO clinic_pushes (member_id, clinic_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING").bind(memberId, clinic.id, now)
    : db.prepare("DELETE FROM clinic_pushes WHERE member_id = ? AND clinic_id = ?").bind(memberId, clinic.id)
  ).run();
  return { ok: true };
}

/**
 * Takes a Clinic off a Member's own list, or puts it back. Off the list means they asked not to
 * hear about it, so their Push for new Openings there is turned off too, and stays off when the
 * Clinic is put back.
 */
export async function setClinicOffList(db: D1Database, memberId: string, clinicId: unknown, off: unknown, now: string): Promise<{ ok: true } | { error: string; status: 400 | 404 }> {
  const clinic = CLINICS.find((c) => c.id === clinicId);
  if (!clinic) return { error: "No such Clinic", status: 404 };
  if (typeof off !== "boolean") return { error: "Say whether the Clinic is off your list or on it", status: 400 };
  await db.batch(
    off
      ? [
          db.prepare("INSERT INTO clinics_off_list (member_id, clinic_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING").bind(memberId, clinic.id, now),
          db.prepare("DELETE FROM clinic_pushes WHERE member_id = ? AND clinic_id = ?").bind(memberId, clinic.id),
        ]
      : [db.prepare("DELETE FROM clinics_off_list WHERE member_id = ? AND clinic_id = ?").bind(memberId, clinic.id)],
  );
  return { ok: true };
}
