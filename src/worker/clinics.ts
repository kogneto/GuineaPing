/** The Clinics page: every Clinic GuineaPing knows, with the Openings read from those it reads. */
import type { ClinicItem, Near, Opening } from "../shared/api";
import { CLINICS } from "../shared/clinics";
import { milesBetween } from "../shared/ctgov";

type Row = { id: string; clinic_id: string; title: string; pay: string | null; when_text: string | null; stay: string | null; who: string | null; code: string | null; url: string; first_seen_at: string };

export async function listClinics(db: D1Database, near: Near | null): Promise<ClinicItem[]> {
  const [openings, sources] = await db.batch([
    db.prepare("SELECT id, clinic_id, title, pay, when_text, stay, who, code, url, first_seen_at FROM clinic_openings WHERE gone_at IS NULL ORDER BY first_seen_at DESC, title"),
    db.prepare("SELECT source, read_at, refused_at FROM clinic_sources"),
  ]);
  const byClinic = new Map<string, Opening[]>();
  for (const r of (openings?.results ?? []) as Row[]) {
    const list = byClinic.get(r.clinic_id) ?? [];
    list.push({ id: r.id, title: r.title, pay: r.pay, when: r.when_text, stay: r.stay, who: r.who, code: r.code, url: r.url, firstSeen: r.first_seen_at.slice(0, 10) });
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
      openings: byClinic.get(clinic.id) ?? [],
    };
  });
  return items.sort((a, b) => (a.miles ?? 0) - (b.miles ?? 0) || a.name.localeCompare(b.name) || a.place.localeCompare(b.place));
}
