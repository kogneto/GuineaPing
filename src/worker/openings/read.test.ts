import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ClinicItem } from "../../shared/api";
import { as, createWorkerEnv } from "../../test/worker-env";
import { app } from "../app";
import { b64url } from "../webpush";
import { openingMessages, pushNewOpenings } from "./announce";
import { plainFetch, readDueSource, type Fetcher, type FreshOpening } from "./read";
import type { Found, Source } from "./types";

let env: Env;
let dispose: () => Promise<void>;

beforeAll(async () => {
  ({ env, dispose } = await createWorkerEnv());
});
afterAll(() => dispose());
beforeEach(async () => {
  await env.DB.batch([env.DB.prepare("DELETE FROM clinic_openings"), env.DB.prepare("DELETE FROM clinic_sources"), env.DB.prepare("DELETE FROM opening_marks"), env.DB.prepare("DELETE FROM clinic_pushes")]);
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
const SAME_HOUR = "2026-11-22T10:41:00.000Z";
const NEXT_HOUR = "2026-11-22T10:45:00.000Z";
const LATER_DAY1 = "2026-11-22T20:47:00.000Z";
const DAY2 = "2026-11-23T09:47:00.000Z";
const current = async () => (await env.DB.prepare("SELECT id FROM clinic_openings WHERE gone_at IS NULL ORDER BY id").all<{ id: string }>()).results.map((r) => r.id);

describe("what a read calls new", () => {
  const at = (h: number) => `2026-11-22T${String(h).padStart(2, "0")}:47:00.000Z`;
  const read = async (h: number, entries: Found[]) => (await readDueSource(env.DB, [source()], serving(entries), at(h), noWait))!.fresh.map((f) => f.id);

  it("calls nothing new on a source's first good read, even after a failed one", async () => {
    const down: Fetcher = async () => new Response("down", { status: 503 });
    await readDueSource(env.DB, [source()], down, at(1), noWait);
    expect(await read(2, [opening("a"), opening("b")])).toEqual([]);
  });

  it("calls an entry new when the list did not have it before", async () => {
    await read(1, [opening("a")]);
    expect(await read(2, [opening("a"), opening("b")])).toEqual(["fortrea:b"]);
    expect(await read(3, [opening("a"), opening("b")])).toEqual([]);
  });

  it("calls an entry new when it had gone and is back", async () => {
    await read(1, [opening("a"), opening("b")]);
    await read(2, [opening("b")]);
    expect(await read(3, [opening("a"), opening("b")])).toEqual(["fortrea:a"]);
  });

  it("calls an entry new when its page stays but the group or the dates change", async () => {
    await read(1, [opening("a", { code: "780798 G5", when: "12/01/2026" }), opening("b", { when: "12/01/2026" })]);
    expect(await read(2, [opening("a", { code: "780798 G6", when: "12/01/2026" }), opening("b", { when: "12/01/2026" })])).toEqual(["fortrea:a"]);
    expect(await read(3, [opening("a", { code: "780798 G6", when: "12/01/2026" }), opening("b", { when: "12/30/2026" })])).toEqual(["fortrea:b"]);
  });

  it("counts an entry that is new as first seen then, so the page shows it as new too", async () => {
    await read(1, [opening("a", { code: "780798 G5" }), opening("b")]);
    await read(2, [opening("a", { code: "780798 G6" }), opening("b")]);
    const { results } = await env.DB.prepare("SELECT id, first_seen_at FROM clinic_openings ORDER BY id").all();
    expect(results).toEqual([
      { id: "fortrea:a", first_seen_at: at(2) },
      { id: "fortrea:b", first_seen_at: at(1) },
    ]);
  });

  it("does not call an entry new for a change of pay or wording, or for losing its dates", async () => {
    await read(1, [opening("a", { when: "12/01/2026" })]);
    expect(await read(2, [opening("a", { when: null, pay: "$2,000", title: "Reworded" })])).toEqual([]);
  });
});

describe("Pushes for new Openings", () => {
  let n = 0;
  beforeEach(() => void n++);
  const fresh = (key: string, over: Partial<Found> = {}): FreshOpening => ({ ...opening(key, over), id: `fortrea:${key}` });
  const vapid = () => {
    const e = env as Env & { VAPID_PUBLIC_KEY: string; VAPID_PRIVATE_KEY: string; VAPID_SUBJECT: string };
    return { publicKey: e.VAPID_PUBLIC_KEY, privateKey: e.VAPID_PRIVATE_KEY, subject: e.VAPID_SUBJECT };
  };
  /** A Member with one Device, and the push service's record of what reached it. */
  async function memberWithDevice(name: string) {
    const who = as(app, env, `${name}${n}@x`);
    const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
    const keys = { p256dh: b64url.encode((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer), auth: b64url.encode(crypto.getRandomValues(new Uint8Array(16))) };
    const endpoint = `https://fcm.googleapis.com/fcm/send/${name}-${n}`;
    expect((await who("/api/devices", "POST", { endpoint, keys, label: "Phone" })).status).toBe(201);
    return { who, endpoint };
  }
  function pushService() {
    const calls: string[] = [];
    const post = (async (url: string) => {
      calls.push(url);
      return new Response(null, { status: 201 });
    }) as typeof fetch;
    return { calls, post };
  }

  it("go only to Members who asked about that Clinic", async () => {
    const ann = await memberWithDevice("ann");
    const bob = await memberWithDevice("bob");
    const cat = await memberWithDevice("cat");
    expect((await ann.who("/api/clinics/push", "POST", { id: "fortrea-madison", on: true })).status).toBe(200);
    await bob.who("/api/clinics/push", "POST", { id: "fortrea-dallas", on: true });
    const service = pushService();
    const r = await pushNewOpenings(env.DB, vapid(), "fortrea", [fresh("a")], service.post);
    expect(r.sent).toBe(1);
    expect(service.calls).toEqual([ann.endpoint]);
    expect(cat.endpoint).not.toBe(ann.endpoint);
  });

  it("stop when the Member turns them off, and show on the Clinics page meanwhile", async () => {
    const ann = await memberWithDevice("off");
    await ann.who("/api/clinics/push", "POST", { id: "fortrea-madison", on: true });
    const chosen = async () => (await ann.who<ClinicItem[]>("/api/clinics")).json.filter((c) => c.pushNew).map((c) => c.id);
    expect(await chosen()).toEqual(["fortrea-madison"]);
    await ann.who("/api/clinics/push", "POST", { id: "fortrea-madison", on: false });
    expect(await chosen()).toEqual([]);
    const service = pushService();
    await pushNewOpenings(env.DB, vapid(), "fortrea", [fresh("a")], service.post);
    expect(service.calls).toEqual([]);
  });

  it("leave out a study the Member marked Not for me", async () => {
    const ann = await memberWithDevice("nfm");
    await ann.who("/api/clinics/push", "POST", { id: "fortrea-madison", on: true });
    await readDueSource(env.DB, [source()], serving([opening("a", { code: "780798 G5" })]), DAY1, noWait);
    expect((await ann.who("/api/openings/mark", "POST", { id: "fortrea:a", mark: "not_for_me" })).status).toBe(200);
    const service = pushService();
    await pushNewOpenings(env.DB, vapid(), "fortrea", [fresh("a", { code: "780798 G6" })], service.post);
    expect(service.calls).toEqual([]);
    await pushNewOpenings(env.DB, vapid(), "fortrea", [fresh("b", { code: "781111 G1" })], service.post);
    expect(service.calls).toEqual([ann.endpoint]);
  });

  it("can't be asked for at a Clinic that isn't read, or one that doesn't exist", async () => {
    const ann = as(app, env, `ask${n}@x`);
    const linkOnly = (await ann<ClinicItem[]>("/api/clinics")).json.find((c) => !c.read)!;
    expect((await ann("/api/clinics/push", "POST", { id: linkOnly.id, on: true })).status).toBe(400);
    expect((await ann("/api/clinics/push", "POST", { id: "nowhere", on: true })).status).toBe(404);
    expect((await ann("/api/clinics/push", "POST", { id: "fortrea-madison" })).status).toBe(400);
  });

  it("name the Clinic and give the entry in its own words", () => {
    expect(openingMessages([fresh("a", { clinicId: "fortrea-daytona", title: "Healthy Men & Women Needed!", pay: "$5,100", when: "12/30/2026", stay: "2 stays of 4 nights" })])).toEqual([
      { title: "New at Fortrea, Daytona Beach, FL", body: "Healthy Men & Women Needed! · $5,100 · 12/30/2026 · 2 stays of 4 nights", url: "/clinics", tag: "fortrea:a" },
    ]);
  });

  it("become one Push when there are more than three at once", () => {
    expect(openingMessages(["a", "b", "c", "d"].map((k) => fresh(k)))).toEqual([{ title: "4 new Openings at Clinics you chose", body: "Open GuineaPing to see them.", url: "/clinics", tag: "openings" }]);
  });
});

describe("reading a Clinic's list", () => {
  it("stores what it finds and reports it", async () => {
    const r = await readDueSource(env.DB, [source()], serving([opening("a"), opening("b")]), DAY1, noWait);
    expect(r).toEqual({ source: "fortrea", status: "ok", found: 2, fresh: [], statusChanged: true });
    expect(await current()).toEqual(["fortrea:a", "fortrea:b"]);
  });

  it("reads a source at most once an hour, however often it is asked", async () => {
    const calls: string[] = [];
    await readDueSource(env.DB, [source()], serving([opening("a")], calls), DAY1, noWait);
    expect(await readDueSource(env.DB, [source()], serving([opening("a")], calls), SAME_HOUR, noWait)).toBeNull();
    expect(calls).toHaveLength(1);
    expect(await readDueSource(env.DB, [source()], serving([opening("a")], calls), NEXT_HOUR, noWait)).toMatchObject({ status: "ok" });
    expect(calls).toHaveLength(2);
  });

  it("reads one source per run, the one that has waited longest", async () => {
    const calls: string[] = [];
    const two = [source("fortrea"), source("celerion", ["https://helpresearch.com/studies"])];
    expect((await readDueSource(env.DB, two, serving([], calls), DAY1, noWait))?.source).toBe("fortrea");
    expect((await readDueSource(env.DB, two, serving([], calls), "2026-11-22T09:53:00.000Z", noWait))?.source).toBe("celerion");
    expect(await readDueSource(env.DB, two, serving([], calls), "2026-11-22T09:59:00.000Z", noWait)).toBeNull();
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

  it("says a lasting problem has changed only when it starts and when it ends", async () => {
    const down: Fetcher = async () => new Response("down", { status: 503 });
    const at = (h: number) => `2026-11-22T${String(h).padStart(2, "0")}:47:00.000Z`;
    expect(await readDueSource(env.DB, [source()], serving([opening("a")]), at(1), noWait)).toMatchObject({ status: "ok", statusChanged: true });
    expect(await readDueSource(env.DB, [source()], serving([opening("a")]), at(2), noWait)).toMatchObject({ status: "ok", statusChanged: false });
    expect(await readDueSource(env.DB, [source()], down, at(3), noWait)).toMatchObject({ status: "failed", statusChanged: true });
    expect(await readDueSource(env.DB, [source()], down, at(4), noWait)).toMatchObject({ status: "failed", statusChanged: false });
    expect(await readDueSource(env.DB, [source()], serving([opening("a")]), at(5), noWait)).toMatchObject({ status: "ok", statusChanged: true });
  });

  it("tries again the next day after an ordinary failure, keeping what it had", async () => {
    await readDueSource(env.DB, [source()], serving([opening("a")]), DAY1, noWait);
    const down: Fetcher = async () => new Response("down", { status: 503 });
    expect(await readDueSource(env.DB, [source()], down, DAY2, noWait)).toMatchObject({ status: "failed", detail: "answered 503" });
    expect(await current()).toEqual(["fortrea:a"]);
    expect(await readDueSource(env.DB, [source()], serving([opening("a")]), "2026-11-24T09:47:00.000Z", noWait)).toMatchObject({ status: "ok" });
  });

  it("does not call an empty result a good read, even the first time", async () => {
    expect(await readDueSource(env.DB, [source()], serving([]), DAY1, noWait)).toMatchObject({ status: "nothing found" });
    expect(await env.DB.prepare("SELECT read_at FROM clinic_sources WHERE source = 'fortrea'").first()).toEqual({ read_at: null });
  });

  it("treats a challenge page as a no whatever status it comes with", async () => {
    const challenge: Fetcher = async () => new Response("<html><head><title>Attention Required! | Cloudflare</title></head></html>", { status: 503 });
    expect(await readDueSource(env.DB, [source()], challenge, DAY1, noWait)).toMatchObject({ status: "refused" });
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

describe("setting an Opening aside", () => {
  const DAY3 = "2026-11-24T09:47:00.000Z";
  const DAY4 = "2026-11-25T09:47:00.000Z";
  const ann = () => as(app, env, "ann@example.com");
  const marksOf = async (who: ReturnType<typeof as>) => {
    const { json } = await who<ClinicItem[]>("/api/clinics");
    return Object.fromEntries(json.flatMap((c) => c.openings).map((o) => [o.id, o.mark]));
  };
  const mark = (who: ReturnType<typeof as>, id: string, how: string | null) => who<{ error?: string }>("/api/openings/mark", "POST", { id, mark: how });
  /** A Fortrea entry: its page is the study's, and the group is only in the code. */
  const group = (study: string, grp: string, when: string) => opening(study, { code: `${study} ${grp}`, when });
  const read = (entries: Found[], day: string) => readDueSource(env.DB, [source()], serving(entries), day, noWait);

  it("hides nothing by itself: a marked Opening is still listed, with its mark", async () => {
    await read([group("778951", "9b", "Dec 07 - Dec 16"), group("781236", "1", "Dec 03 - Dec 29")], DAY1);
    expect(await marksOf(ann())).toEqual({ "fortrea:778951": null, "fortrea:781236": null });
    expect((await mark(ann(), "fortrea:778951", "not_this_time")).status).toBe(200);
    expect(await marksOf(ann())).toEqual({ "fortrea:778951": "not_this_time", "fortrea:781236": null });
  });

  it("keeps Not this time through later reads while the entry says the same", async () => {
    await read([group("778951", "9b", "Dec 07 - Dec 16")], DAY1);
    await mark(ann(), "fortrea:778951", "not_this_time");
    await read([group("778951", "9b", "Dec 07 - Dec 16")], DAY2);
    await read([group("778951", "9b", "Dec 07 - Dec 16")], DAY3);
    expect(await marksOf(ann())).toEqual({ "fortrea:778951": "not_this_time" });
  });

  it("shows a Not this time study again when it is listed with a new group, though its page is the same", async () => {
    await read([group("778951", "9b", "Dec 07 - Dec 16")], DAY1);
    await mark(ann(), "fortrea:778951", "not_this_time");
    await read([group("778951", "10a", "Dec 07 - Dec 16")], DAY2);
    expect(await marksOf(ann())).toEqual({ "fortrea:778951": null });
  });

  it("shows a Not this time study again when its dates change", async () => {
    await read([group("778951", "9b", "Dec 07 - Dec 16")], DAY1);
    await mark(ann(), "fortrea:778951", "not_this_time");
    await read([group("778951", "9b", "Jan 04 - Jan 13")], DAY2);
    expect(await marksOf(ann())).toEqual({ "fortrea:778951": null });
  });

  it("shows a Not this time study again when it went from the list and came back unchanged", async () => {
    const other = group("781236", "1", "Dec 03 - Dec 29");
    await read([group("778951", "9b", "Dec 07 - Dec 16"), other], DAY1);
    await mark(ann(), "fortrea:778951", "not_this_time");
    await read([other], DAY2);
    expect(await marksOf(ann())).toEqual({ "fortrea:781236": null });
    await read([group("778951", "9b", "Dec 07 - Dec 16"), other], DAY3);
    expect(await marksOf(ann())).toEqual({ "fortrea:778951": null, "fortrea:781236": null });
    // Marked again, it holds again.
    await mark(ann(), "fortrea:778951", "not_this_time");
    await read([group("778951", "9b", "Dec 07 - Dec 16"), other], DAY4);
    expect((await marksOf(ann()))["fortrea:778951"]).toBe("not_this_time");
  });

  it("keeps Not for me through a new group, new dates, and going and coming back", async () => {
    const other = group("781236", "1", "Dec 03 - Dec 29");
    await read([group("778951", "9b", "Dec 07 - Dec 16"), other], DAY1);
    await mark(ann(), "fortrea:778951", "not_for_me");
    await read([group("778951", "10a", "Jan 04 - Jan 13"), other], DAY2);
    expect(await marksOf(ann())).toEqual({ "fortrea:778951": "not_for_me", "fortrea:781236": null });
    await read([other], DAY3);
    await read([group("778951", "11", "Feb 01 - Feb 10"), other], DAY4);
    expect(await marksOf(ann())).toEqual({ "fortrea:778951": "not_for_me", "fortrea:781236": null });
  });

  it("covers the study at that one Clinic with Not for me, not the same study in another city", async () => {
    // Fortrea runs one study in several cities, each its own entry on the one list.
    const at = (city: string, grp: string) => opening(`781236-${city}`, { clinicId: `fortrea-${city}`, code: `781236 ${grp}`.trim(), when: null });
    await read([at("madison", ""), at("dallas", "1"), at("daytona", "3"), opening("781236-daytona-b", { clinicId: "fortrea-daytona", code: "781236 4" })], DAY1);
    await mark(ann(), "fortrea:781236-daytona", "not_for_me");
    expect(await marksOf(ann())).toEqual({ "fortrea:781236-madison": null, "fortrea:781236-dallas": null, "fortrea:781236-daytona": "not_for_me", "fortrea:781236-daytona-b": "not_for_me" });
  });

  it("covers every group of the study with Not for me, at that Clinic only", async () => {
    const celerion = (code: string): Found => ({ key: code, clinicId: "celerion-lincoln", title: `Study ${code}`, pay: "$3,000*", when: "Dec 02 to Dec 10", stay: null, who: null, code, url: `https://helpresearch.com/medical-study/${code}` });
    const helpresearch: Source = { id: "celerion", pages: ["https://helpresearch.com/studies"], parse: (htmls) => htmls.flatMap((h) => JSON.parse(h) as Found[]) };
    await readDueSource(env.DB, [helpresearch], serving([celerion("CA48121-6"), celerion("CA48121-6A"), celerion("CA49982-3"), celerion("CB48121-21")]), DAY1, noWait);
    // Another Clinic that happens to use the same code for a study of its own.
    await read([opening("x", { code: "CA48121" })], DAY2);
    await mark(ann(), "celerion:CA48121-6", "not_for_me");
    expect(await marksOf(ann())).toEqual({ "celerion:CA48121-6": "not_for_me", "celerion:CA48121-6A": "not_for_me", "celerion:CA49982-3": null, "celerion:CB48121-21": null, "fortrea:x": null });
    // A group listed later is covered too, and undoing from any group brings them all back.
    await readDueSource(env.DB, [helpresearch], serving([celerion("CA48121-6A"), celerion("CA48121-7"), celerion("CA49982-3")]), DAY3, noWait);
    expect(await marksOf(ann())).toMatchObject({ "celerion:CA48121-6A": "not_for_me", "celerion:CA48121-7": "not_for_me", "celerion:CA49982-3": null });
    await mark(ann(), "celerion:CA48121-7", null);
    expect(await marksOf(ann())).toMatchObject({ "celerion:CA48121-6A": null, "celerion:CA48121-7": null });
  });

  it("holds one mark at a time, and puts an Opening back", async () => {
    await read([group("778951", "9b", "Dec 07 - Dec 16")], DAY1);
    await mark(ann(), "fortrea:778951", "not_this_time");
    await mark(ann(), "fortrea:778951", "not_for_me");
    expect(await marksOf(ann())).toEqual({ "fortrea:778951": "not_for_me" });
    await mark(ann(), "fortrea:778951", "not_this_time");
    // No longer the whole study: a new group shows again.
    await read([group("778951", "10a", "Dec 07 - Dec 16")], DAY2);
    expect(await marksOf(ann())).toEqual({ "fortrea:778951": null });
    await mark(ann(), "fortrea:778951", "not_for_me");
    await mark(ann(), "fortrea:778951", null);
    expect(await marksOf(ann())).toEqual({ "fortrea:778951": null });
    const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM opening_marks").first<{ n: number }>();
    expect(left?.n).toBe(0);
  });

  it("offers only Not this time for an entry with no study code", async () => {
    await read([opening("nocode", { code: null })], DAY1);
    const { json } = await ann()<ClinicItem[]>("/api/clinics");
    expect(json.flatMap((c) => c.openings)[0]).toMatchObject({ id: "fortrea:nocode", canMarkStudy: false });
    const refused = await mark(ann(), "fortrea:nocode", "not_for_me");
    expect(refused.status).toBe(400);
    expect(refused.json.error).toMatch(/no study code/);
    expect((await mark(ann(), "fortrea:nocode", "not_this_time")).status).toBe(200);
    expect(await marksOf(ann())).toEqual({ "fortrea:nocode": "not_this_time" });
  });

  it("keeps each Member's marks to themselves, and forgets them when they leave", async () => {
    const bob = as(app, env, "bob@example.com");
    const carol = as(app, env, "carol@example.com");
    await read([group("778951", "9b", "Dec 07 - Dec 16"), group("781236", "1", "Dec 03 - Dec 29")], DAY1);
    await mark(carol, "fortrea:778951", "not_for_me");
    await mark(carol, "fortrea:781236", "not_this_time");
    expect(await marksOf(bob)).toEqual({ "fortrea:778951": null, "fortrea:781236": null });
    await mark(bob, "fortrea:778951", null);
    expect(await marksOf(carol)).toEqual({ "fortrea:778951": "not_for_me", "fortrea:781236": "not_this_time" });

    const members = (await bob<{ members: { id: string; email: string }[] }>("/api/members")).json.members;
    const carolId = members.find((m) => m.email === "carol@example.com")!.id;
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM opening_marks WHERE member_id = ?").bind(carolId).first<{ n: number }>())?.n).toBe(2);
    expect((await bob(`/api/members/${carolId}`, "DELETE")).status).toBe(204);
    const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM opening_marks WHERE member_id = ?").bind(carolId).first<{ n: number }>();
    expect(left?.n).toBe(0);
  });

  it("refuses a mark it doesn't know and an Opening that isn't there", async () => {
    await read([group("778951", "9b", "Dec 07 - Dec 16")], DAY1);
    expect((await mark(ann(), "fortrea:778951", "maybe")).status).toBe(400);
    expect((await mark(ann(), "fortrea:nope", "not_this_time")).status).toBe(404);
    expect((await ann()("/api/openings/mark", "POST", { mark: "not_this_time" })).status).toBe(404);
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
      { id: "fortrea:a", title: "Study a", pay: "$1,000", when: null, stay: "1 stay of 2 nights", who: "Age 18-55", code: "a", url: "https://www.fortreaclinicaltrials.com/en-us/a", firstSeen: "2026-11-22", mark: null, canMarkStudy: true },
    ]);
    const icon = json.find((c) => c.id === "icon-lenexa");
    expect(icon).toMatchObject({ read: false, lastReadAt: null, openings: [], url: "https://iconstudies.com/All-Clinical-Research-Studies/" });
  });

  it("counts an entry that went from the list and came back as first seen on the day it came back", async () => {
    const DAY3 = "2026-11-24T09:47:00.000Z";
    await readDueSource(env.DB, [source()], serving([opening("a"), opening("b")]), DAY1, noWait);
    await readDueSource(env.DB, [source()], serving([opening("b")]), DAY2, noWait);
    await readDueSource(env.DB, [source()], serving([opening("a"), opening("b")]), DAY3, noWait);
    const { json } = await as(app, env, "ann@example.com")<ClinicItem[]>("/api/clinics");
    const seen = Object.fromEntries(json.find((c) => c.id === "fortrea-madison")!.openings.map((o) => [o.id, o.firstSeen]));
    expect(seen).toEqual({ "fortrea:a": "2026-11-24", "fortrea:b": "2026-11-22" });
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
