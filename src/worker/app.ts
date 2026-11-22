import { Hono } from "hono";
import type { AlertListItem, Criteria, Trial, WatchInput } from "../shared/api";
import { fetchJson, findTrials, normalizeCriteria } from "../shared/ctgov";
import { isDevRequest, requireMember, type AppEnv } from "./auth";
import { checkStatus, daysBefore, RECENT_DAYS, runCheck } from "./check";
import { createWatch, deleteWatch, getWatch, listWatches, parseWatchInput, setFollowing, updateWatch } from "./watches";

export const app = new Hono<AppEnv>();

app.use("*", async (c, next) => {
  await next();
  c.header("X-Robots-Tag", "noindex, nofollow");
});

app.get("/api/health", (c) => c.json({ ok: true }));

app.use("/api/*", requireMember);

const now = () => new Date().toISOString();

/** Recent matches: newest first, capped for display; `all` pages further, for seeding. */
function recentMatches(criteria: Criteria, all = false): Promise<Trial[]> {
  return findTrials(criteria, daysBefore(now(), RECENT_DAYS), fetchJson, all ? { pageSize: 100, maxPages: 10 } : { pageSize: 50, maxPages: 1 });
}

const upstreamError = { error: "Couldn't reach ClinicalTrials.gov just now. Please try again in a minute." };

async function readWatchInput(body: unknown): Promise<WatchInput | { error: string }> {
  const criteria = normalizeCriteria((body as { criteria?: unknown } | null)?.criteria);
  if ("error" in criteria) return criteria;
  return parseWatchInput(body, criteria);
}

app.get("/api/me", (c) => c.json(c.get("me")));

app.get("/api/status", async (c) => c.json(await checkStatus(c.env.DB)));

app.get("/api/watches", async (c) => c.json(await listWatches(c.env.DB, c.get("me"))));

app.post("/api/watches", async (c) => {
  const input = await readWatchInput(await c.req.json().catch(() => null));
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
  const input = await readWatchInput(await c.req.json().catch(() => null));
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
    return c.json(await recentMatches(watch.criteria));
  } catch {
    return c.json(upstreamError, 502);
  }
});

/** Recent matches for criteria still being edited, before the Watch is saved. */
app.post("/api/preview", async (c) => {
  const criteria = normalizeCriteria((await c.req.json().catch(() => null))?.criteria);
  if ("error" in criteria) return c.json(criteria, 400);
  try {
    return c.json(await recentMatches(criteria));
  } catch {
    return c.json(upstreamError, 502);
  }
});

type AlertRow = { id: string; trial: string; watch_names: string; created_at: string; read_at: string | null };
type NoteRow = { id: string; message: string; created_at: string; read_at: string | null };

const toAlert = (r: AlertRow): AlertListItem => ({
  kind: "alert",
  id: r.id,
  trial: JSON.parse(r.trial) as Trial,
  watchNames: JSON.parse(r.watch_names) as string[],
  createdAt: r.created_at,
  read: r.read_at !== null,
});

/** The Alert list: the latest 200 Alerts and notes, newest first. */
app.get("/api/alerts", async (c) => {
  const id = c.get("me").memberId;
  const [alerts, notes] = await c.env.DB.batch<AlertRow | NoteRow>([
    c.env.DB.prepare("SELECT id, trial, watch_names, created_at, read_at FROM alerts WHERE member_id = ? ORDER BY created_at DESC LIMIT 200").bind(id),
    c.env.DB.prepare("SELECT id, message, created_at, read_at FROM notes WHERE member_id = ? ORDER BY created_at DESC LIMIT 200").bind(id),
  ]);
  const items: AlertListItem[] = [
    ...(alerts!.results as AlertRow[]).map(toAlert),
    ...(notes!.results as NoteRow[]).map((r): AlertListItem => ({ kind: "note", id: r.id, message: r.message, createdAt: r.created_at, read: r.read_at !== null })),
  ];
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return c.json(items.slice(0, 200));
});

app.get("/api/alerts/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT id, trial, watch_names, created_at, read_at FROM alerts WHERE id = ? AND member_id = ?")
    .bind(c.req.param("id"), c.get("me").memberId)
    .first<AlertRow>();
  return row ? c.json(toAlert(row)) : c.json({ error: "No such Alert" }, 404);
});

for (const [path, table] of [["/api/alerts/:id/read", "alerts"], ["/api/notes/:id/read", "notes"]] as const) {
  app.post(path, async (c) => {
    await c.env.DB.prepare(`UPDATE ${table} SET read_at = COALESCE(read_at, ?) WHERE id = ? AND member_id = ?`)
      .bind(now(), c.req.param("id"), c.get("me").memberId)
      .run();
    return c.body(null, 204);
  });
}

/** Runs a Check on demand during local development; Vite's Cloudflare plugin has no cron trigger. */
app.post("/api/dev/check", async (c) => {
  if (!isDevRequest(c)) return c.json({ error: "Not found" }, 404);
  return c.json(await runCheck(c.env.DB, fetchJson));
});
