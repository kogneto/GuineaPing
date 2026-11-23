import * as Sentry from "@sentry/cloudflare";
import { Hono, type Context } from "hono";
import { type Criteria, type Near, type Device, type MemberList, type Trial, type WatchInput } from "../shared/api";
import { normalizeCriteria, sameCriteria } from "../shared/criteria";
import { fetchJson, findTrials, forList } from "../shared/ctgov";
import { accessFrom, setAllowed } from "./access";
import { getAlert, listAlerts, markRead, sendAlert, sortAlert } from "./alerts";
import { isDevRequest, requireMember, type AppEnv } from "./auth";
import { checkAndPush, checkStatus, daysBefore, knownMatches, RECENT_DAYS, type Known } from "./check";
import { listClinics, markOpening, setClinicPush } from "./clinics";
import { addMember, listMembers, looksLikeEmail, removeMember } from "./members";
import { plainFetch, readDueSource } from "./openings/read";
import { SOURCES } from "./openings/sources";
import { getProfile, nearByMember, saveProfile } from "./profile";
import { pushPendingAlerts, pushTest, validKeys, vapidFrom } from "./push";
import { report } from "./report";
import { addPastStudy, changePastStudy, listPastStudies, removePastStudy } from "./waiting";
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
 * Recent matches: newest first, capped for display. `nearestTo` is where the viewer is, for
 * Criteria that have no ZIP code of their own.
 */
async function recentMatches(criteria: Criteria, nearestTo: Near | null = null): Promise<Trial[]> {
  const trials = await findTrials(criteria, daysBefore(now(), RECENT_DAYS), fetchJson, { pageSize: 50, maxPages: 1, nearestTo });
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
  let known: Known;
  try {
    known = await knownMatches(input.criteria, fetchJson);
  } catch {
    return c.json(upstreamError, 502);
  }
  const id = await createWatch(c.env.DB, c.get("me"), input, known, now());
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
  let known: Known | null = null;
  if (!sameCriteria(input.criteria, existing.criteria)) {
    try {
      known = await knownMatches(input.criteria, fetchJson);
    } catch {
      return c.json(upstreamError, 502);
    }
  }
  await updateWatch(c.env.DB, me, existing.id, input, known, now());
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
    return c.json(await recentMatches(watch.criteria, await myNear(c)));
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
    return c.json(await recentMatches(criteria, await myNear(c)));
  } catch {
    return c.json(upstreamError, 502);
  }
});

/** The Alert list: the latest Alerts and notes, newest first. */
app.get("/api/alerts", async (c) => c.json(await listAlerts(c.env.DB, c.get("me").memberId)));

app.get("/api/alerts/:id", async (c) => {
  const alert = await getAlert(c.env.DB, c.get("me").memberId, c.req.param("id"));
  return alert ? c.json(alert) : c.json({ error: "No such Alert" }, 404);
});

/** A Member sorts one of their own Alerts: a mark, a private note, or both. */
app.put("/api/alerts/:id", async (c) => {
  const sorted = await sortAlert(c.env.DB, c.get("me").memberId, c.req.param("id"), await c.req.json().catch(() => null));
  return "error" in sorted ? c.json({ error: sorted.error }, sorted.status) : c.json(sorted);
});

/** Sends one of the Member's Alerts to another Member, named by email. */
app.post("/api/alerts/:id/send", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { email?: unknown } | null;
  const sent = await sendAlert(c.env.DB, c.get("me"), c.req.param("id"), body?.email, now());
  if ("error" in sent) return c.json({ error: sent.error }, sent.status);
  // Push it now rather than with the next Check. If that fails, the next Check retries.
  const vapid = vapidFrom(c.env);
  if (sent.created && vapid) {
    const pushing = pushPendingAlerts(c.env.DB, vapid).catch((err) => report("Pushing a sent Alert failed", err));
    try {
      c.executionCtx.waitUntil(pushing);
    } catch {
      await pushing;
    }
  }
  return c.json({ ok: true });
});

for (const [path, what] of [["/api/alerts/:id/read", "alerts"], ["/api/notes/:id/read", "notes"]] as const) {
  app.post(path, async (c) => {
    await markRead(c.env.DB, c.get("me").memberId, what, c.req.param("id"), now());
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

/** The signed-in Member's own Past studies and waiting periods. Nobody else's are ever returned. */
app.get("/api/past-studies", async (c) => c.json(await listPastStudies(c.env.DB, c.get("me").memberId)));

app.post("/api/past-studies", async (c) => {
  const saved = await addPastStudy(c.env.DB, c.get("me").memberId, await c.req.json().catch(() => null), now());
  return "error" in saved ? c.json(saved, 400) : c.json(saved, 201);
});

app.put("/api/past-studies/:id", async (c) => {
  const saved = await changePastStudy(c.env.DB, c.get("me").memberId, c.req.param("id"), await c.req.json().catch(() => null), now());
  if (!saved) return c.json({ error: "Not found" }, 404);
  return "error" in saved ? c.json(saved, 400) : c.json(saved);
});

app.delete("/api/past-studies/:id", async (c) => {
  if (!(await removePastStudy(c.env.DB, c.get("me").memberId, c.req.param("id")))) return c.json({ error: "Not found" }, 404);
  return c.body(null, 204);
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

/** Every Clinic, nearest first when the Member's Profile has a ZIP code, each with its current Openings. */
app.get("/api/clinics", async (c) => c.json(await listClinics(c.env.DB, await myNear(c), c.get("me").memberId)));

/** Sets one Opening aside for the signed-in Member, or puts it back. The id goes in the body: it holds slashes. */
app.post("/api/openings/mark", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { id?: unknown; mark?: unknown } | null;
  const done = await markOpening(c.env.DB, c.get("me").memberId, body?.id, body?.mark ?? null, now());
  return "error" in done ? c.json({ error: done.error }, done.status) : c.json(done);
});

/** Turns the signed-in Member's Push for new Openings at one Clinic on or off. */
app.post("/api/clinics/push", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { id?: unknown; on?: unknown } | null;
  const done = await setClinicPush(c.env.DB, c.get("me").memberId, body?.id, body?.on, now());
  return "error" in done ? c.json({ error: done.error }, done.status) : c.json(done);
});

/** Reads the next due Clinic source on demand during local development. Still at most once an hour each. */
app.post("/api/dev/read-clinic", async (c) => {
  if (!isDevRequest(c)) return c.json({ error: "Not found" }, 404);
  return c.json((await readDueSource(c.env.DB, SOURCES, plainFetch)) ?? { status: "nothing due" });
});

/** Runs a Check (and its Pushes) on demand during local development; Vite's Cloudflare plugin has no cron trigger. */
app.post("/api/dev/check", async (c) => {
  if (!isDevRequest(c)) return c.json({ error: "Not found" }, 404);
  const { newAlerts, ...result } = await checkAndPush(c.env);
  return c.json({ ...result, alertsCreated: newAlerts.length });
});
