import * as Sentry from "@sentry/cloudflare";
import { Hono, type Context } from "hono";
import { MARKS, MAX_NOTE_CHARS, type AlertListItem, type Criteria, type Near, type Device, type Mark, type MemberList, type Trial, type WatchInput } from "../shared/api";
import { fetchJson, findTrials, forList, normalizeCriteria } from "../shared/ctgov";
import { accessFrom, setAllowed } from "./access";
import { isDevRequest, requireMember, type AppEnv } from "./auth";
import { checkAndPush, checkStatus, daysBefore, RECENT_DAYS } from "./check";
import { addMember, listMembers, looksLikeEmail, removeMember } from "./members";
import { getProfile, nearByMember, saveProfile } from "./profile";
import { pushPendingAlerts, pushTest, validKeys, vapidFrom } from "./push";
import { report } from "./report";
import { isPushEndpoint } from "./webpush";
import { createWatch, deleteWatch, getWatch, listWatches, parseWatchInput, setFollowing, updateWatch } from "./watches";

export const app = new Hono<AppEnv>();

app.use("*", async (c, next) => {
  await next();
  c.header("X-Robots-Tag", "noindex, nofollow");
});

// Hono turns a thrown error into a 500 by itself, which would hide it from Sentry.
app.onError((err, c) => {
  console.error(err);
  Sentry.captureException(err);
  return c.json({ error: "Something went wrong on our side. Please try again." }, 500);
});

app.get("/api/health", (c) => c.json({ ok: true }));

app.use("/api/*", requireMember);

const now = () => new Date().toISOString();

/**
 * Recent matches: newest first, capped for display; `all` pages further, for seeding. `nearestTo`
 * is where the viewer is, for Criteria that have no ZIP code of their own.
 */
async function recentMatches(criteria: Criteria, all = false, nearestTo: Near | null = null): Promise<Trial[]> {
  const trials = await findTrials(criteria, daysBefore(now(), RECENT_DAYS), fetchJson, { ...(all ? { pageSize: 100, maxPages: 10 } : { pageSize: 50, maxPages: 1 }), nearestTo });
  return trials.map(forList);
}

/** Where the signed-in Member's Profile says they are, if it does. */
const myNear = async (c: Context<AppEnv>) => (await nearByMember(c.env.DB, [c.get("me").memberId])).get(c.get("me").memberId) ?? null;

const upstreamError = { error: "Couldn't reach ClinicalTrials.gov just now. Please try again in a minute." };

/** Validates criteria from the browser and turns a ZIP code into the point ClinicalTrials.gov needs. */
async function readCriteria(db: D1Database, raw: unknown): Promise<Criteria | { error: string }> {
  const input = normalizeCriteria(raw);
  if ("error" in input) return input;
  if (!input.near) return { ...input, near: null };
  const point = await db.prepare("SELECT lat, lon FROM zips WHERE zip = ?").bind(input.near.zip).first<{ lat: number; lon: number }>();
  if (!point) return { error: `GuineaPing doesn't know the ZIP code ${input.near.zip}. Check it, or try a nearby one.` };
  return { ...input, near: { ...input.near, lat: point.lat, lon: point.lon } };
}

async function readWatchInput(db: D1Database, body: unknown): Promise<WatchInput | { error: string }> {
  const criteria = await readCriteria(db, (body as { criteria?: unknown } | null)?.criteria);
  if ("error" in criteria) return criteria;
  return parseWatchInput(body, criteria);
}

app.get("/api/me", (c) => c.json(c.get("me")));

app.get("/api/status", async (c) => c.json(await checkStatus(c.env.DB)));

app.get("/api/watches", async (c) => c.json(await listWatches(c.env.DB, c.get("me"))));

app.post("/api/watches", async (c) => {
  const input = await readWatchInput(c.env.DB, await c.req.json().catch(() => null));
  if ("error" in input) return c.json(input, 400);
  let recent: Trial[];
  try {
    recent = await recentMatches(input.criteria, true);
  } catch {
    return c.json(upstreamError, 502);
  }
  const id = await createWatch(c.env.DB, c.get("me"), input, recent, now());
  return c.json(await getWatch(c.env.DB, c.get("me"), id), 201);
});

app.get("/api/watches/:id", async (c) => {
  const watch = await getWatch(c.env.DB, c.get("me"), c.req.param("id"));
  return watch ? c.json(watch) : c.json({ error: "No such Watch" }, 404);
});

app.put("/api/watches/:id", async (c) => {
  const me = c.get("me");
  const existing = await getWatch(c.env.DB, me, c.req.param("id"));
  if (!existing) return c.json({ error: "No such Watch" }, 404);
  if (!existing.isOwner) return c.json({ error: "Only the Watch's Owner can change it" }, 403);
  const input = await readWatchInput(c.env.DB, await c.req.json().catch(() => null));
  if ("error" in input) return c.json(input, 400);
  let recent: Trial[] | null = null;
  if (JSON.stringify(input.criteria) !== JSON.stringify(existing.criteria)) {
    try {
      recent = await recentMatches(input.criteria, true);
    } catch {
      return c.json(upstreamError, 502);
    }
  }
  await updateWatch(c.env.DB, me, existing.id, input, recent, now());
  return c.json(await getWatch(c.env.DB, me, existing.id));
});

app.delete("/api/watches/:id", async (c) => {
  const result = await deleteWatch(c.env.DB, c.get("me"), c.req.param("id"), now());
  if (result === "not-found") return c.json({ error: "No such Watch" }, 404);
  if (result === "not-owner") return c.json({ error: "Only the Watch's Owner can delete it" }, 403);
  return c.body(null, 204);
});

for (const [method, follow] of [["post", true], ["delete", false]] as const) {
  app[method]("/api/watches/:id/follow", async (c) => {
    const ok = await setFollowing(c.env.DB, c.get("me"), c.req.param("id"), follow, now());
    return ok ? c.json(await getWatch(c.env.DB, c.get("me"), c.req.param("id"))) : c.json({ error: "No such Watch" }, 404);
  });
}

app.get("/api/watches/:id/recent", async (c) => {
  const watch = await getWatch(c.env.DB, c.get("me"), c.req.param("id"));
  if (!watch) return c.json({ error: "No such Watch" }, 404);
  try {
    return c.json(await recentMatches(watch.criteria, false, await myNear(c)));
  } catch {
    return c.json(upstreamError, 502);
  }
});

/**
 * Condition suggestions while an Owner types, from ClinicalTrials.gov's own suggestion endpoint.
 * It is internal and undocumented, so any trouble returns no suggestions and typing still works.
 */
app.get("/api/suggest", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 2 || q.length > 60) return c.json([]);
  try {
    const res = await fetch(`https://clinicaltrials.gov/api/int/suggest?${new URLSearchParams({ input: q, dictionary: "Condition" })}`, {
      headers: { "User-Agent": "GuineaPing/0.1 (+https://github.com/kogneto/GuineaPing)", Accept: "application/json" },
    });
    if (!res.ok) return c.json([]);
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return c.json([]);
    const words = data
      .filter((s): s is string => typeof s === "string")
      // The endpoint escapes some characters with backslashes, e.g. "Lung Cancer\(NSCLC\)".
      .map((s) => s.replace(/\\(.)/g, "$1").trim())
      .filter(Boolean);
    return c.json([...new Set(words)].slice(0, 8));
  } catch {
    return c.json([]);
  }
});

/** Recent matches for criteria still being edited, before the Watch is saved. */
app.post("/api/preview", async (c) => {
  const criteria = await readCriteria(c.env.DB, (await c.req.json().catch(() => null))?.criteria);
  if ("error" in criteria) return c.json(criteria, 400);
  try {
    return c.json(await recentMatches(criteria, false, await myNear(c)));
  } catch {
    return c.json(upstreamError, 502);
  }
});

type AlertRow = { id: string; trial: string; watch_names: string; created_at: string; read_at: string | null; mark: Mark | null; note: string | null; sent_by: string | null; via_private: number; update_text: string | null; updated_at: string | null };
const ALERT_COLUMNS = "id, trial, watch_names, created_at, read_at, mark, note, sent_by, via_private, update_text, updated_at";
type NoteRow = { id: string; message: string; created_at: string; read_at: string | null };

/** `full` keeps the eligibility text, for an Alert's own page; the Alert list leaves it out. */
const toAlert = (r: AlertRow, full = false): AlertListItem => ({
  kind: "alert",
  id: r.id,
  trial: full ? (JSON.parse(r.trial) as Trial) : forList(JSON.parse(r.trial) as Trial),
  watchNames: JSON.parse(r.watch_names) as string[],
  createdAt: r.created_at,
  read: r.read_at !== null,
  mark: r.mark,
  note: r.note ?? "",
  sentBy: r.sent_by,
  update: r.update_text && r.updated_at ? { at: r.updated_at, changes: JSON.parse(r.update_text) as string[] } : null,
  viaPrivateWatch: r.via_private === 1,
});

/** The Alert list: the latest 200 Alerts and notes, newest first. */
app.get("/api/alerts", async (c) => {
  const id = c.get("me").memberId;
  const [alerts, notes] = await c.env.DB.batch<AlertRow | NoteRow>([
    c.env.DB.prepare(`SELECT ${ALERT_COLUMNS} FROM alerts WHERE member_id = ? ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 200`).bind(id),
    c.env.DB.prepare("SELECT id, message, created_at, read_at FROM notes WHERE member_id = ? ORDER BY created_at DESC LIMIT 200").bind(id),
  ]);
  const items: AlertListItem[] = [
    ...(alerts!.results as AlertRow[]).map((r) => toAlert(r)),
    ...(notes!.results as NoteRow[]).map((r): AlertListItem => ({ kind: "note", id: r.id, message: r.message, createdAt: r.created_at, read: r.read_at !== null })),
  ];
  // An Alert with an Update sits where the Update happened, not where the Alert first did.
  const when = (i: AlertListItem) => (i.kind === "alert" && i.update ? i.update.at : i.createdAt);
  items.sort((a, b) => when(b).localeCompare(when(a)));
  return c.json(items.slice(0, 200));
});

app.get("/api/alerts/:id", async (c) => {
  const row = await c.env.DB.prepare(`SELECT ${ALERT_COLUMNS} FROM alerts WHERE id = ? AND member_id = ?`)
    .bind(c.req.param("id"), c.get("me").memberId)
    .first<AlertRow>();
  return row ? c.json(toAlert(row, true)) : c.json({ error: "No such Alert" }, 404);
});

/** A Member sorts one of their own Alerts: a mark, a private note, or both. */
app.put("/api/alerts/:id", async (c) => {
  const body = ((await c.req.json().catch(() => null)) ?? {}) as { mark?: unknown; note?: unknown };
  const sets: string[] = [];
  const values: (string | null)[] = [];
  if ("mark" in body) {
    if (body.mark !== null && !MARKS.includes(body.mark as Mark)) return c.json({ error: "Unknown mark" }, 400);
    sets.push("mark = ?");
    values.push(body.mark as Mark | null);
  }
  if ("note" in body) {
    if (typeof body.note !== "string" || body.note.length > MAX_NOTE_CHARS) return c.json({ error: `Keep the note under ${MAX_NOTE_CHARS} characters` }, 400);
    sets.push("note = ?");
    values.push(body.note.trim() || null);
  }
  if (!sets.length) return c.json({ error: "Nothing to change" }, 400);
  const row = await c.env.DB.prepare(`UPDATE alerts SET ${sets.join(", ")} WHERE id = ? AND member_id = ? RETURNING ${ALERT_COLUMNS}`)
    .bind(...values, c.req.param("id"), c.get("me").memberId)
    .first<AlertRow>();
  return row ? c.json(toAlert(row, true)) : c.json({ error: "No such Alert" }, 404);
});

/**
 * Sends one of the Member's Alerts to another Member, named by email. They get it as an Alert of
 * their own, or, if the Trial is already in their Alert list, a note saying who sent it. The sender
 * is told the same thing either way, so sending never reveals what someone else has been alerted on.
 */
app.post("/api/alerts/:id/send", async (c) => {
  const me = c.get("me");
  const email = String(((await c.req.json().catch(() => null)) as { email?: unknown } | null)?.email ?? "").trim().toLowerCase();
  if (!email) return c.json({ error: "Enter the email address of the Member to send it to" }, 400);
  if (email === me.email) return c.json({ error: "That's your own email address" }, 400);
  const alert = await c.env.DB.prepare("SELECT nct_id, trial FROM alerts WHERE id = ? AND member_id = ?").bind(c.req.param("id"), me.memberId).first<{ nct_id: string; trial: string }>();
  if (!alert) return c.json({ error: "No such Alert" }, 404);
  const to = await c.env.DB.prepare("SELECT id FROM members WHERE email = ? AND removed_at IS NULL").bind(email).first<{ id: string }>();
  if (!to) return c.json({ error: "No Member has signed in with that email address. Check the spelling." }, 404);
  const created = await c.env.DB.prepare(
    `INSERT OR IGNORE INTO alerts (id, member_id, nct_id, trial, watch_names, via_private, sent_by, created_at) VALUES (?, ?, ?, ?, '[]', 0, ?, ?) RETURNING id`,
  )
    .bind(crypto.randomUUID(), to.id, alert.nct_id, alert.trial, me.email, now())
    .first<{ id: string }>();
  if (!created) {
    const title = (JSON.parse(alert.trial) as Trial).title;
    await c.env.DB.prepare("INSERT INTO notes (id, member_id, message, created_at) VALUES (?, ?, ?, ?)")
      .bind(crypto.randomUUID(), to.id, `${me.email} sent you “${title}”. It's already in your Alerts.`, now())
      .run();
  }
  // Push it now rather than with the next Check. If that fails, the next Check retries.
  const vapid = vapidFrom(c.env);
  if (created && vapid) {
    const pushing = pushPendingAlerts(c.env.DB, vapid).catch((err) => report("Pushing a sent Alert failed", err));
    try {
      c.executionCtx.waitUntil(pushing);
    } catch {
      await pushing;
    }
  }
  return c.json({ ok: true });
});

for (const [path, table] of [["/api/alerts/:id/read", "alerts"], ["/api/notes/:id/read", "notes"]] as const) {
  app.post(path, async (c) => {
    await c.env.DB.prepare(`UPDATE ${table} SET read_at = COALESCE(read_at, ?) WHERE id = ? AND member_id = ?`)
      .bind(now(), c.req.param("id"), c.get("me").memberId)
      .run();
    return c.body(null, 204);
  });
}

type DeviceRow = { id: string; member_id: string; endpoint: string; p256dh: string; auth: string; label: string; created_at: string; last_sent_at: string | null };

/** The key browsers subscribe with; null until VAPID keys are configured. */
app.get("/api/push/key", (c) => c.json({ publicKey: vapidFrom(c.env)?.publicKey ?? null }));

/** The signed-in Member's Devices. Endpoints and keys never leave the Worker. */
app.get("/api/devices", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, label, created_at, last_sent_at, endpoint FROM devices WHERE member_id = ? ORDER BY created_at")
    .bind(c.get("me").memberId)
    .all<DeviceRow>();
  const current = c.req.query("endpoint");
  return c.json(
    results.map((d): Device => ({ id: d.id, label: d.label, createdAt: d.created_at, lastSentAt: d.last_sent_at, thisDevice: !!current && d.endpoint === current })),
  );
});

/**
 * Registers this browser as a Device. The endpoint identifies the browser, so registering one that
 * already exists moves it to the signed-in Member: a shared family iPad gets the Pushes of
 * whoever turned notifications on last.
 */
app.post("/api/devices", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown }; label?: unknown } | null;
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  if (!isPushEndpoint(endpoint)) return c.json({ error: "That isn't a push service this app can send to" }, 400);
  if (!validKeys(body?.keys?.p256dh, body?.keys?.auth)) return c.json({ error: "The browser's push keys look wrong" }, 400);
  const label = (typeof body?.label === "string" && body.label.trim().slice(0, 60)) || "This device";
  const id = crypto.randomUUID();
  const row = await c.env.DB.prepare(
    `INSERT INTO devices (id, member_id, endpoint, p256dh, auth, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET member_id = excluded.member_id, p256dh = excluded.p256dh, auth = excluded.auth, label = excluded.label
     RETURNING id, label, created_at, last_sent_at`,
  )
    .bind(id, c.get("me").memberId, endpoint, body!.keys!.p256dh, body!.keys!.auth, label, now())
    .first<DeviceRow>();
  return c.json({ id: row!.id, label: row!.label, createdAt: row!.created_at, lastSentAt: row!.last_sent_at, thisDevice: true } satisfies Device, 201);
});

async function ownDevice(c: Context<AppEnv>): Promise<DeviceRow | null> {
  return c.env.DB.prepare("SELECT * FROM devices WHERE id = ? AND member_id = ?").bind(c.req.param("id"), c.get("me").memberId).first<DeviceRow>();
}

app.delete("/api/devices/:id", async (c) => {
  const device = await ownDevice(c);
  if (!device) return c.json({ error: "No such Device" }, 404);
  await c.env.DB.prepare("DELETE FROM devices WHERE id = ?").bind(device.id).run();
  return c.body(null, 204);
});

app.post("/api/devices/:id/test", async (c) => {
  const device = await ownDevice(c);
  if (!device) return c.json({ error: "No such Device" }, 404);
  const vapid = vapidFrom(c.env);
  if (!vapid) return c.json({ error: "Push isn't set up on the server yet" }, 503);
  const outcome = await pushTest(c.env.DB, vapid, device);
  if (outcome === "sent") return c.json({ ok: true });
  if (outcome === "gone") return c.json({ error: "This device no longer accepts notifications, so it was removed. Turn them on again to re-add it." }, 410);
  return c.json({ error: "The push service didn't accept the test. Try again in a minute." }, 502);
});

/** The signed-in Member's own Profile. Nobody else's is ever returned. */
app.get("/api/profile", async (c) => c.json(await getProfile(c.env.DB, c.get("me").memberId)));

app.put("/api/profile", async (c) => {
  const saved = await saveProfile(c.env.DB, c.get("me").memberId, await c.req.json().catch(() => null), now());
  return "error" in saved ? c.json(saved, 400) : c.json(saved);
});

/** Whether inviting and removing work here: always on localhost, elsewhere once the API token is set. */
const canChangeMembers = (c: Context<AppEnv>) => isDevRequest(c) || !!accessFrom(c.env);

/** Keeps Cloudflare Access's sign-in list in step. Skipped on localhost, where there is no Access. */
async function syncAccess(c: Context<AppEnv>, email: string, allowed: boolean) {
  const cfg = accessFrom(c.env);
  if (cfg) await setAllowed(cfg, email, allowed);
}

const accessTrouble = { error: "Couldn't change the sign-in list at Cloudflare just now, so nothing was changed. Please try again in a minute." };

app.get("/api/members", async (c) => c.json({ members: await listMembers(c.env.DB, c.get("me")), canChange: canChangeMembers(c) } satisfies MemberList));

/** Invites someone: they are allowed to sign in, and become a Member. */
app.post("/api/members", async (c) => {
  if (!canChangeMembers(c)) return c.json({ error: "Inviting isn't switched on yet" }, 503);
  const email = String(((await c.req.json().catch(() => null)) as { email?: unknown } | null)?.email ?? "").trim().toLowerCase();
  if (!looksLikeEmail(email)) return c.json({ error: "Enter a full email address" }, 400);
  // Sign-in list first: a Member who can't sign in would be worse than no Member.
  try {
    await syncAccess(c, email, true);
  } catch (err) {
    report("Inviting failed", err);
    return c.json(accessTrouble, 502);
  }
  const outcome = await addMember(c.env.DB, c.get("me"), email, now());
  return outcome === "already" ? c.json({ error: "They're already a Member" }, 409) : c.json({ ok: true }, 201);
});

/** Removes a Member, or lets the signed-in Member leave. */
app.delete("/api/members/:id", async (c) => {
  if (!canChangeMembers(c)) return c.json({ error: "Removing Members isn't switched on yet" }, 503);
  const target = await c.env.DB.prepare("SELECT email FROM members WHERE id = ? AND removed_at IS NULL").bind(c.req.param("id")).first<{ email: string }>();
  if (!target) return c.json({ error: "No such Member" }, 404);
  const others = await c.env.DB.prepare("SELECT count(*) AS n FROM members WHERE removed_at IS NULL AND id != ?").bind(c.req.param("id")).first<{ n: number }>();
  if (!others?.n) return c.json({ error: "You're the only Member. Invite someone before you leave, or nobody could get back in." }, 409);
  // Here first: the Worker refuses them from this moment, whatever Access still remembers.
  await removeMember(c.env.DB, c.req.param("id"), now());
  try {
    await syncAccess(c, target.email, false);
  } catch (err) {
    report("Taking a removed Member off the sign-in list failed", err);
    return c.json({ error: "They're removed and can't use GuineaPing, but Cloudflare's sign-in list couldn't be updated. Take their email off the Members policy in the Cloudflare dashboard." }, 502);
  }
  return c.body(null, 204);
});

/** Runs a Check (and its Pushes) on demand during local development; Vite's Cloudflare plugin has no cron trigger. */
app.post("/api/dev/check", async (c) => {
  if (!isDevRequest(c)) return c.json({ error: "Not found" }, 404);
  const { newAlerts, ...result } = await checkAndPush(c.env);
  return c.json({ ...result, alertsCreated: newAlerts.length });
});
