/**
 * Members joining and leaving. Only the Organiser invites someone or removes another Member, and
 * any Member can leave: app.ts decides who may, and these functions do what they are asked. When
 * a Member leaves, each Watch they own passes to its longest-standing follower, or is deleted if
 * nobody else follows it.
 */
import type { Me, MemberItem } from "../shared/api";

type MemberRow = { id: string; email: string; created_at: string; invited_by: string | null; removed_at: string | null };

export async function listMembers(db: D1Database, me: Me): Promise<MemberItem[]> {
  const { results } = await db.prepare("SELECT id, email, created_at, invited_by FROM members WHERE removed_at IS NULL ORDER BY email").all<MemberRow>();
  return results.map((m) => ({ id: m.id, email: m.email, since: m.created_at, invitedBy: m.invited_by, isYou: m.id === me.memberId }));
}

export const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;

/** "already" when they are a Member now; otherwise they become one (again, if they had left). */
export async function addMember(db: D1Database, me: Me, email: string, now: string): Promise<"added" | "already"> {
  const existing = await db.prepare("SELECT id, removed_at FROM members WHERE email = ?").bind(email).first<{ id: string; removed_at: string | null }>();
  if (existing && !existing.removed_at) return "already";
  if (existing) await db.prepare("UPDATE members SET removed_at = NULL, invited_by = ?, created_at = ? WHERE id = ?").bind(me.email, now, existing.id).run();
  else await db.prepare("INSERT INTO members (id, email, created_at, invited_by) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), email, now, me.email).run();
  return "added";
}

/**
 * Takes a Member out of the group. Their Follows end, their Devices are forgotten, and each Watch
 * they own goes to its longest-standing other follower (who is told), or is deleted. Their Alert
 * list is kept in case they come back. Returns null if there is no such Member.
 */
export async function removeMember(db: D1Database, id: string, now: string): Promise<{ email: string } | null> {
  const member = await db.prepare("SELECT email FROM members WHERE id = ? AND removed_at IS NULL").bind(id).first<{ email: string }>();
  if (!member) return null;
  const { results: owned } = await db
    .prepare(
      `SELECT w.id, w.name,
              (SELECT f.member_id FROM follows f JOIN members m ON m.id = f.member_id AND m.removed_at IS NULL
               WHERE f.watch_id = w.id AND f.ended_at IS NULL AND f.member_id != ?1
               ORDER BY f.followed_at, f.id LIMIT 1) AS heir
       FROM watches w WHERE w.owner_id = ?1 AND w.deleted_at IS NULL`,
    )
    .bind(id)
    .all<{ id: string; name: string; heir: string | null }>();
  const statements: D1PreparedStatement[] = [];
  for (const w of owned) {
    if (w.heir) {
      statements.push(
        db.prepare("UPDATE watches SET owner_id = ?, updated_at = ? WHERE id = ?").bind(w.heir, now, w.id),
        db
          .prepare("INSERT INTO notes (id, member_id, message, created_at) VALUES (?, ?, ?, ?)")
          .bind(crypto.randomUUID(), w.heir, `You are now the Owner of “${w.name}”, because its Owner left the group. You have followed it the longest.`, now),
      );
    } else {
      statements.push(db.prepare("UPDATE watches SET deleted_at = ? WHERE id = ?").bind(now, w.id));
    }
  }
  statements.push(
    db.prepare("UPDATE follows SET ended_at = ?1 WHERE member_id = ?2 AND ended_at IS NULL").bind(now, id),
    db.prepare("DELETE FROM devices WHERE member_id = ?").bind(id),
    db.prepare("DELETE FROM past_studies WHERE member_id = ?").bind(id),
    db.prepare("DELETE FROM opening_marks WHERE member_id = ?").bind(id),
    db.prepare("DELETE FROM clinic_pushes WHERE member_id = ?").bind(id),
    db.prepare("DELETE FROM clinics_off_list WHERE member_id = ?").bind(id),
    db.prepare("UPDATE members SET removed_at = ? WHERE id = ?").bind(now, id),
  );
  await db.batch(statements);
  return member;
}
