/**
 * A Member's Profile: a few facts about them that only they can see. It fills in new Watches and
 * says where "near you" is for Trials found by a Watch with no ZIP code of its own.
 */
import { DISTANCES, SEXES, type Near, type Profile, type Sex } from "../shared/api";

type Row = { birth_year: number | null; sex: Sex | null; zip: string | null; miles: number | null; lat: number | null; lon: number | null; healthy: number; conditions: string };

const EMPTY: Profile = { birthYear: null, sex: null, zip: null, miles: null, healthyVolunteer: false, conditions: [] };

export async function getProfile(db: D1Database, memberId: string): Promise<Profile> {
  const row = await db.prepare("SELECT birth_year, sex, zip, miles, healthy, conditions FROM profiles WHERE member_id = ?").bind(memberId).first<Row>();
  if (!row) return EMPTY;
  return { birthYear: row.birth_year, sex: row.sex, zip: row.zip, miles: row.miles, healthyVolunteer: row.healthy === 1, conditions: JSON.parse(row.conditions) as string[] };
}

/** Where "near you" is for each of these Members who has given a ZIP code. */
export async function nearByMember(db: D1Database, memberIds: string[]): Promise<Map<string, Near>> {
  const near = new Map<string, Near>();
  if (!memberIds.length) return near;
  const { results } = await db
    .prepare("SELECT member_id, zip, miles, lat, lon FROM profiles WHERE lat IS NOT NULL AND member_id IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify([...new Set(memberIds)]))
    .all<{ member_id: string; zip: string; miles: number; lat: number; lon: number }>();
  for (const r of results) near.set(r.member_id, { zip: r.zip, miles: r.miles, lat: r.lat, lon: r.lon });
  return near;
}

const DEFAULT_MILES = 50;
const MAX_CONDITIONS = 20;

/** Validates and stores a Profile. Every field is optional; an empty Profile is a fine Profile. */
export async function saveProfile(db: D1Database, memberId: string, input: unknown, now: string): Promise<Profile | { error: string }> {
  const raw = (input ?? {}) as Record<string, unknown>;
  const thisYear = new Date(now).getUTCFullYear();
  let birthYear: number | null = null;
  if (raw.birthYear != null && raw.birthYear !== "") {
    birthYear = Number(raw.birthYear);
    if (!Number.isInteger(birthYear) || birthYear < thisYear - 120 || birthYear > thisYear) return { error: "Enter the year you were born, as four digits" };
  }
  let sex: Sex | null = null;
  if (raw.sex != null && raw.sex !== "") {
    if (!(SEXES as readonly unknown[]).includes(raw.sex)) return { error: `Unknown sex ${String(raw.sex)}` };
    sex = raw.sex as Sex;
  }
  let zip: string | null = null;
  let miles: number | null = null;
  let point: { lat: number; lon: number } | null = null;
  if (typeof raw.zip === "string" && raw.zip.trim()) {
    zip = raw.zip.trim();
    if (!/^\d{5}$/.test(zip)) return { error: "Enter a 5-digit US ZIP code" };
    point = await db.prepare("SELECT lat, lon FROM zips WHERE zip = ?").bind(zip).first<{ lat: number; lon: number }>();
    if (!point) return { error: `GuineaPing doesn't know the ZIP code ${zip}. Check it, or try a nearby one.` };
    miles = raw.miles == null ? DEFAULT_MILES : (raw.miles as number);
    if (!(DISTANCES as readonly number[]).includes(miles)) return { error: "Pick one of the distances offered" };
  }
  const conditions = Array.isArray(raw.conditions)
    ? [...new Set(raw.conditions.filter((s): s is string => typeof s === "string").map((s) => s.trim().slice(0, 100)).filter(Boolean))].slice(0, MAX_CONDITIONS)
    : [];
  const healthy = raw.healthyVolunteer === true;
  await db
    .prepare(
      `INSERT INTO profiles (member_id, birth_year, sex, zip, miles, lat, lon, healthy, conditions, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
       ON CONFLICT(member_id) DO UPDATE SET birth_year = ?2, sex = ?3, zip = ?4, miles = ?5, lat = ?6, lon = ?7, healthy = ?8, conditions = ?9, updated_at = ?10`,
    )
    .bind(memberId, birthYear, sex, zip, miles, point?.lat ?? null, point?.lon ?? null, healthy ? 1 : 0, JSON.stringify(conditions), now)
    .run();
  return { birthYear, sex, zip, miles, healthyVolunteer: healthy, conditions };
}
