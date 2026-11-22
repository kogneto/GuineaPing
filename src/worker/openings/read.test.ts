import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ClinicItem } from "../../shared/api";
import { as, createWorkerEnv } from "../../test/worker-env";
import { app } from "../app";
import { plainFetch, readDueSource, type Fetcher } from "./read";
import type { Found, Source } from "./types";

let env: Env;
let dispose: () => Promise<void>;

beforeAll(async () => {
  ({ env, dispose } = await createWorkerEnv());
});
afterAll(() => dispose());
beforeEach(async () => {
  await env.DB.batch([env.DB.prepare("DELETE FROM clinic_openings"), env.DB.prepare("DELETE FROM clinic_sources")]);
});

const PAGE = "https://www.fortreaclinicaltrials.com/en-us/clinical-research/browse-studies";
const opening = (key: string, over: Partial<Found> = {}): Found => ({
  key,
  clinicId: "fortrea-madison",
  title: `Study ${key}`,
  pay: "$1,000",
  when: null,
  stay: "1 stay of 2 nights",
  who: "Age 18-55",
  code: key,
  url: `https://www.fortreaclinicaltrials.com/en-us/${key}`,
  ...over,
});
/** A source whose "page" is a JSON list of entries, so each test says plainly what the site shows. */
const source = (id: Source["id"] = "fortrea", pages = [PAGE]): Source => ({ id, pages, parse: (htmls) => htmls.flatMap((h) => JSON.parse(h) as Found[]) });
const serving =
  (entries: Found[], calls: string[] = []): Fetcher =>
  async (url) => {
    calls.push(url);
    return new Response(JSON.stringify(entries));
  };
const noWait = async () => {};
const DAY1 = "2026-11-22T09:47:00.000Z";
const LATER_DAY1 = "2026-11-22T20:47:00.000Z";
const DAY2 = "2026-11-23T09:47:00.000Z";
const current = async () => (await env.DB.prepare("SELECT id FROM clinic_openings WHERE gone_at IS NULL ORDER BY id").all<{ id: string }>()).results.map((r) => r.id);

describe("reading a Clinic's list", () => {
  it("stores what it finds and reports it", async () => {
    const r = await readDueSource(env.DB, [source()], serving([opening("a"), opening("b")]), DAY1, noWait);
    expect(r).toEqual({ source: "fortrea", status: "ok", found: 2 });
    expect(await current()).toEqual(["fortrea:a", "fortrea:b"]);
  });

  it("reads a source at most once a day, however often it is asked", async () => {
    const calls: string[] = [];
    await readDueSource(env.DB, [source()], serving([opening("a")], calls), DAY1, noWait);
    expect(await readDueSource(env.DB, [source()], serving([opening("a")], calls), LATER_DAY1, noWait)).toBeNull();
    expect(calls).toHaveLength(1);
    expect(await readDueSource(env.DB, [source()], serving([opening("a")], calls), DAY2, noWait)).toMatchObject({ status: "ok" });
    expect(calls).toHaveLength(2);
  });

  it("reads one source per run, the one that has waited longest", async () => {
    const calls: string[] = [];
    const two = [source("fortrea"), source("celerion", ["https://helpresearch.com/studies"])];
    expect((await readDueSource(env.DB, two, serving([], calls), DAY1, noWait))?.source).toBe("fortrea");
    expect((await readDueSource(env.DB, two, serving([], calls), LATER_DAY1, noWait))?.source).toBe("celerion");
    expect(await readDueSource(env.DB, two, serving([], calls), LATER_DAY1, noWait)).toBeNull();
    expect(calls).toEqual([PAGE, "https://helpresearch.com/studies"]);
  });

  it("stops for good when the site says no, and does not retry", async () => {
    const calls: string[] = [];
    const refusing: Fetcher = async (url) => {
      calls.push(url);
      return new Response("Forbidden", { status: 403 });
    };
    expect(await readDueSource(env.DB, [source()], refusing, DAY1, noWait)).toMatchObject({ status: "refused" });
    expect(await readDueSource(env.DB, [source()], refusing, DAY2, noWait)).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("treats a challenge page as a no", async () => {
    const challenge: Fetcher = async () => new Response("<html><head><title>Just a moment...</title></head></html>");
    expect(await readDueSource(env.DB, [source()], challenge, DAY1, noWait)).toMatchObject({ status: "refused" });
  });

  it("does not ask for the next page once one page is refused", async () => {
    const calls: string[] = [];
    const refusing: Fetcher = async (url) => {
      calls.push(url);
      return new Response("", { status: 429 });
    };
    await readDueSource(env.DB, [source("fortrea", [PAGE, `${PAGE}?page=1`])], refusing, DAY1, noWait);
    expect(calls).toEqual([PAGE]);
  });

  it("waits between two pages of one source", async () => {
    const waits: number[] = [];
    await readDueSource(env.DB, [source("fortrea", [PAGE, `${PAGE}?page=1`])], serving([]), DAY1, async (ms) => {
      waits.push(ms);
    });
    expect(waits).toEqual([3000]);
  });

  it("tries again the next day after an ordinary failure, keeping what it had", async () => {
    await readDueSource(env.DB, [source()], serving([opening("a")]), DAY1, noWait);
    const down: Fetcher = async () => new Response("down", { status: 503 });
    expect(await readDueSource(env.DB, [source()], down, DAY2, noWait)).toMatchObject({ status: "failed", detail: "answered 503" });
    expect(await current()).toEqual(["fortrea:a"]);
    expect(await readDueSource(env.DB, [source()], serving([opening("a")]), "2026-11-24T09:47:00.000Z", noWait)).toMatchObject({ status: "ok" });
  });

  it("keeps yesterday's Openings when today's page yields nothing: the page has probably changed", async () => {
    await readDueSource(env.DB, [source()], serving([opening("a")]), DAY1, noWait);
    expect(await readDueSource(env.DB, [source()], serving([]), DAY2, noWait)).toMatchObject({ status: "nothing found" });
    expect(await current()).toEqual(["fortrea:a"]);
  });

  it("marks an Opening gone when the list no longer has it, and remembers when it was first seen", async () => {
    await readDueSource(env.DB, [source()], serving([opening("a"), opening("b")]), DAY1, noWait);
    await readDueSource(env.DB, [source()], serving([opening("b")]), DAY2, noWait);
    expect(await current()).toEqual(["fortrea:b"]);
    const b = await env.DB.prepare("SELECT first_seen_at, last_seen_at FROM clinic_openings WHERE id = 'fortrea:b'").first();
    expect(b).toEqual({ first_seen_at: DAY1, last_seen_at: DAY2 });
  });

  it("drops an entry whose link leaves the Clinic's site or whose Clinic it does not know", async () => {
    const entries = [opening("a", { url: "https://elsewhere.example/a" }), opening("b", { clinicId: "celerion-lincoln" }), opening("c", { url: "javascript:alert(1)" }), opening("d")];
    expect(await readDueSource(env.DB, [source()], serving(entries), DAY1, noWait)).toMatchObject({ found: 1 });
    expect(await current()).toEqual(["fortrea:d"]);
  });

  it("refuses to follow the list to another site", async () => {
    const moved: Fetcher = async () => Object.defineProperty(new Response("[]"), "url", { value: "https://elsewhere.example/list" });
    expect(await readDueSource(env.DB, [source()], moved, DAY1, noWait)).toMatchObject({ status: "failed", detail: "moved to another site" });
  });

  it("sends no browser identity: the request sets no headers at all", () => {
    expect(plainFetch.toString()).not.toMatch(/user-agent|headers/i);
  });
});

describe("the Clinics page", () => {
  it("lists every Clinic, with Openings for those that are read and a link for the rest", async () => {
    await readDueSource(env.DB, [source()], serving([opening("a")]), DAY1, noWait);
    const { status, json } = await as(app, env, "ann@example.com")<ClinicItem[]>("/api/clinics");
    expect(status).toBe(200);
    const madison = json.find((c) => c.id === "fortrea-madison");
    expect(madison).toMatchObject({ read: true, lastReadAt: DAY1, refused: false, miles: null });
    expect(madison?.openings).toEqual([
      { id: "fortrea:a", title: "Study a", pay: "$1,000", when: null, stay: "1 stay of 2 nights", who: "Age 18-55", code: "a", url: "https://www.fortreaclinicaltrials.com/en-us/a", firstSeen: "2026-11-22" },
    ]);
    const icon = json.find((c) => c.id === "icon-lenexa");
    expect(icon).toMatchObject({ read: false, lastReadAt: null, openings: [], url: "https://iconstudies.com/All-Clinical-Research-Studies/" });
  });

  it("puts the nearest Clinic first once the Member's Profile has a ZIP code", async () => {
    await env.DB.prepare("INSERT OR IGNORE INTO zips (zip, lat, lon) VALUES ('68508', 40.81, -96.7)").run();
    const ann = as(app, env, "ann@example.com");
    expect((await ann("/api/profile", "PUT", { zip: "68508", miles: 50 })).status).toBe(200);
    const { json } = await ann<ClinicItem[]>("/api/clinics");
    expect(json[0]).toMatchObject({ id: "celerion-lincoln" });
    expect(json[0]?.miles).toBeLessThan(10);
  });
});
