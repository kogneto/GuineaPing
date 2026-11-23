import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AlertItem, AlertListItem, MemberList, Profile, Watch } from "../shared/api";
import { as, createWorkerEnv, study } from "../test/worker-env";
import { setAllowed } from "./access";
import { app } from "./app";
import { checkStatus, runCheck } from "./check";
import { runUpdates } from "./updates";
import { addDays } from "../shared/days";
import type { PastStudy } from "../shared/waiting";
import { tellWaitsOver } from "./waiting";
import { fetchJson } from "../shared/ctgov";

let env: Env;
let dispose: () => Promise<void>;

/** What the fake ClinicalTrials.gov returns, by condition. A thrown value makes it fail. */
let catalog: Record<string, unknown[]> = {};
/** What the fake ClinicalTrials.gov says has changed, when asked about Trials by NCT ID. */
let changed: { protocolSection: { identificationModule: { nctId: string } } }[] = [];
let failing = false;
/** Every `filter.advanced` the fake ClinicalTrials.gov has been sent since the test began. */
let filtersSent: string[] = [];
/** The same, with the condition each was asked about, for tests that follow one Watch among many. */
let asked: { cond: string; filter: string }[] = [];
/** Conditions the fake ClinicalTrials.gov says match more Trials than fit in one answer. */
let tooBroad: string[] = [];
/** Trials first posted long ago: the fake leaves them out when asked by first-posted date. */
let longPosted: string[] = [];

beforeAll(async () => {
  ({ env, dispose } = await createWorkerEnv());
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    if (failing) return new Response("down", { status: 503 });
    const params = new URL(String(input instanceof Request ? input.url : input)).searchParams;
    const ids = params.get("filter.ids")?.split(",");
    if (ids) return Response.json({ studies: changed.filter((s) => ids.includes(s.protocolSection.identificationModule.nctId)) });
    filtersSent.push(params.get("filter.advanced") ?? "");
    const cond = params.get("query.cond") ?? "";
    asked.push({ cond, filter: params.get("filter.advanced") ?? "" });
    const byPosted = (params.get("filter.advanced") ?? "").includes("AREA[StudyFirstPostDate]");
    const studies = Object.entries(catalog)
      .filter(([c]) => cond.includes(`"${c}"`))
      .flatMap(([, s]) => s)
      .filter((s) => !(byPosted && longPosted.includes((s as { protocolSection: { identificationModule: { nctId: string } } }).protocolSection.identificationModule.nctId)));
    // Asked for everything a Watch matches, and it is too much: there is a next page.
    if (params.get("pageSize") === "1000" && tooBroad.some((c) => cond.includes(`"${c}"`))) return Response.json({ studies, nextPageToken: "more" });
    return Response.json({ studies });
  });
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await dispose();
});

let n = 0;
beforeEach(async () => {
  catalog = {};
  changed = [];
  failing = false;
  filtersSent = [];
  asked = [];
  tooBroad = [];
  longPosted = [];
  // Each test gets its own Members and Watches; the Check history is shared, so clear it.
  await env.DB.prepare("DELETE FROM checks").run();
  n++;
});

const watchBody = (condition: string, extra: object = {}) => ({
  name: `${condition} watch`,
  criteria: { conditions: [condition], terms: [], phases: [], statuses: [] },
  private: false,
  ...extra,
});
const check = () => runCheck(env.DB, fetchJson);
const alertsOf = async (who: ReturnType<typeof as>) => (await who<AlertListItem[]>("/api/alerts")).json;

describe("sign-in", () => {
  it("turns away anyone Cloudflare Access did not let in", async () => {
    expect((await app.request("https://guineaping.example/api/watches", {}, env)).status).toBe(401);
    const forged = await app.request("https://guineaping.example/api/me", { headers: { "X-Dev-Email": "x@y.z" } }, env);
    expect(forged.status).toBe(401);
  });

  it("makes every signed-in person a Member", async () => {
    const me = await as(app, env, `Mum${n}@Example.com`)<{ email: string }>("/api/me");
    expect(me.json.email).toBe(`mum${n}@example.com`);
  });
});

describe("New trials and Alerts", () => {
  it("never alerts on a Watch's Recent matches, only on what a Check finds later", async () => {
    const mum = as(app, env, `mum${n}@x`);
    const cond = `ms${n}`;
    catalog[cond] = [study("NCT10000001")];
    expect((await mum("/api/watches", "POST", watchBody(cond))).status).toBe(201);

    await check();
    expect(await alertsOf(mum)).toEqual([]);

    catalog[cond]!.push(study("NCT10000002", "A new MS trial"));
    expect(await check()).toMatchObject({ ok: true, alertsCreated: 1 });
    const [alert] = await alertsOf(mum);
    expect(alert).toMatchObject({ kind: "alert", read: false, watchNames: [`${cond} watch`], trial: { nctId: "NCT10000002", title: "A new MS trial" } });

    expect(await check()).toMatchObject({ alertsCreated: 0 });
  });

  it("sends one Alert per Member per Trial, naming every Watch that found it", async () => {
    const dad = as(app, env, `dad${n}@x`);
    const [a, b] = [`lung${n}`, `mgh${n}`];
    await dad("/api/watches", "POST", watchBody(a));
    await dad("/api/watches", "POST", watchBody(b));
    catalog[a] = [study("NCT20000001")];
    catalog[b] = [study("NCT20000001")];
    await check();
    const alerts = await alertsOf(dad);
    expect(alerts).toHaveLength(1);
    expect((alerts[0] as { watchNames: string[] }).watchNames.sort()).toEqual([`${a} watch`, `${b} watch`]);

    // Found again later by a third Watch: still no second Alert.
    const c = `third${n}`;
    await dad("/api/watches", "POST", watchBody(c));
    catalog[c] = [study("NCT20000001")];
    await check();
    expect(await alertsOf(dad)).toHaveLength(1);
  });

  it("alerts a late follower only on Trials found after they followed", async () => {
    const owner = as(app, env, `owner${n}@x`);
    const late = as(app, env, `late${n}@x`);
    const cond = `asthma${n}`;
    const { json: watch } = await owner<Watch>("/api/watches", "POST", watchBody(cond));
    catalog[cond] = [study("NCT30000001")];
    await check();

    expect((await late<Watch>(`/api/watches/${watch.id}/follow`, "POST")).json.following).toBe(true);
    await check();
    expect(await alertsOf(late)).toEqual([]);

    catalog[cond]!.push(study("NCT30000002"));
    await check();
    expect((await alertsOf(late)).map((a) => a.kind === "alert" && a.trial.nctId)).toEqual(["NCT30000002"]);
  });

  it("keeps recording finds while nobody follows a Watch, so a later follower isn't alerted on older Trials", async () => {
    const owner = as(app, env, `quiet${n}@x`);
    const later = as(app, env, `next${n}@x`);
    const cond = `quiet${n}`;
    const { json: watch } = await owner<Watch>("/api/watches", "POST", watchBody(cond));
    await owner(`/api/watches/${watch.id}/follow`, "DELETE");
    catalog[cond] = [study("NCT70000001")];
    await check();

    await later(`/api/watches/${watch.id}/follow`, "POST");
    await check();
    expect(await alertsOf(later)).toEqual([]);

    catalog[cond]!.push(study("NCT70000002"));
    await check();
    expect((await alertsOf(later)).map((a) => a.kind === "alert" && a.trial.nctId)).toEqual(["NCT70000002"]);
  });

  it("marks Alerts read", async () => {
    const mum = as(app, env, `reader${n}@x`);
    const cond = `read${n}`;
    await mum("/api/watches", "POST", watchBody(cond));
    catalog[cond] = [study("NCT40000001")];
    await check();
    const [alert] = await alertsOf(mum);
    expect((await mum(`/api/alerts/${alert!.id}/read`, "POST")).status).toBe(204);
    expect((await alertsOf(mum))[0]!.read).toBe(true);
    // Nobody else can read or mark it.
    expect((await as(app, env, `nosy${n}@x`)(`/api/alerts/${alert!.id}`)).status).toBe(404);
  });
});

describe("failed Checks", () => {
  it("records the failure, writes nothing, and catches up next time", async () => {
    const mum = as(app, env, `fail${n}@x`);
    const cond = `fail${n}`;
    await mum("/api/watches", "POST", watchBody(cond));
    catalog[cond] = [study("NCT50000001")];
    failing = true;
    expect(await check()).toMatchObject({ ok: false });
    expect(await alertsOf(mum)).toEqual([]);
    failing = false;
    expect(await check()).toMatchObject({ ok: true, alertsCreated: 1 });
  });

  it("keeps checking the other Watches when one can't be asked about, and lets that one catch up", async () => {
    const mum = as(app, env, `part${n}@x`);
    const [good, bad] = [`good${n}`, `bad${n}`];
    await mum("/api/watches", "POST", watchBody(good));
    const { json: badWatch } = await mum<Watch>("/api/watches", "POST", watchBody(bad));
    catalog[good] = [study("NCT51000001")];
    catalog[bad] = [study("NCT51000002")];
    const real = globalThis.fetch;
    const sinces: string[] = [];
    vi.stubGlobal("fetch", async (input: string | URL | Request) => {
      const params = new URL(String(input instanceof Request ? input.url : input)).searchParams;
      if (params.get("query.cond")?.includes(`"${bad}"`)) {
        sinces.push(params.get("filter.advanced") ?? "");
        if (breaking) return new Response("bad query", { status: 400 });
      }
      return real(input);
    });
    let breaking = true;
    try {
      const t = Date.parse("2026-12-01T12:00:00Z");
      const at = (days: number) => new Date(t + days * 86_400_000).toISOString();
      expect(await runCheck(env.DB, fetchJson, at(0))).toMatchObject({ ok: true, alertsCreated: 1, watchesFailed: 1 });
      expect((await alertsOf(mum)).map((a) => a.kind === "alert" && a.trial.nctId)).toEqual(["NCT51000001"]);
      // Failing for a week: its followers are told, and it still looks back from where it last worked.
      await runCheck(env.DB, fetchJson, at(7));
      const row = await env.DB.prepare("SELECT failing_since, check_error FROM watches WHERE id = ?").bind(badWatch.id).first<{ failing_since: string; check_error: string }>();
      expect(row).toMatchObject({ failing_since: at(0), check_error: expect.stringContaining("400") });
      breaking = false;
      expect(await runCheck(env.DB, fetchJson, at(8))).toMatchObject({ ok: true, alertsCreated: 1, watchesFailed: 0 });
      expect(sinces.at(-1)).toBe(sinces[0]);
      expect((await mum<Watch>(`/api/watches/${badWatch.id}`)).json.failing).toBe(false);
    } finally {
      vi.stubGlobal("fetch", real);
    }
  });

  it("tells everyone once Checks have failed for over a day", async () => {
    const t = Date.parse("2026-11-22T12:00:00Z");
    await runCheck(env.DB, fetchJson, new Date(t).toISOString());
    expect((await checkStatus(env.DB, t + 60_000)).stale).toBe(false);
    failing = true;
    await runCheck(env.DB, fetchJson, new Date(t + 3_600_000).toISOString());
    expect((await checkStatus(env.DB, t + 25 * 3_600_000)).stale).toBe(true);
  });
});

describe("Where", () => {
  it("turns a ZIP code into a point, and refuses ZIP codes it doesn't know", async () => {
    const mum = as(app, env, `zip${n}@x`);
    const body = (zip: string) => watchBody(`zip${n}`, { criteria: { conditions: [`zip${n}`], terms: [], phases: [], statuses: [], near: { zip, miles: 25 } } });
    const { status, json } = await mum<Watch>("/api/watches", "POST", body("02139"));
    expect(status).toBe(201);
    expect(json.criteria.near).toMatchObject({ zip: "02139", miles: 25, lat: expect.closeTo(42.36, 1), lon: expect.closeTo(-71.1, 1) });
    const bad = await mum<{ error: string }>("/api/watches", "POST", body("00000"));
    expect(bad.status).toBe(400);
    expect(bad.json.error).toMatch(/doesn't know the ZIP code 00000/);
  });
});

describe("Owners and Private watches", () => {
  it("lets only the Owner change or delete a Watch", async () => {
    const owner = as(app, env, `o${n}@x`);
    const other = as(app, env, `p${n}@x`);
    const { json: watch } = await owner<Watch>("/api/watches", "POST", watchBody(`own${n}`));
    expect((await other(`/api/watches/${watch.id}`, "PUT", watchBody(`own${n}`, { name: "Mine now" }))).status).toBe(403);
    expect((await other(`/api/watches/${watch.id}`, "DELETE")).status).toBe(403);
    expect((await owner<Watch>(`/api/watches/${watch.id}`, "PUT", watchBody(`own${n}`, { name: "Renamed" }))).json.name).toBe("Renamed");
  });

  it("hides a Private watch from everyone but its Owner, everywhere", async () => {
    const owner = as(app, env, `priv${n}@x`);
    const other = as(app, env, `peek${n}@x`);
    const { json: watch } = await owner<Watch>("/api/watches", "POST", watchBody(`hiv${n}`, { private: true }));
    expect((await other<Watch[]>("/api/watches")).json.some((w) => w.id === watch.id)).toBe(false);
    for (const [path, method] of [[`/api/watches/${watch.id}`, "GET"], [`/api/watches/${watch.id}/recent`, "GET"], [`/api/watches/${watch.id}/follow`, "POST"], [`/api/watches/${watch.id}`, "DELETE"]] as const) {
      expect((await other(path, method)).status, `${method} ${path}`).toBe(404);
    }
  });

  it("never reveals who follows a Watch", async () => {
    const owner = as(app, env, `sec${n}@x`);
    await owner("/api/watches", "POST", watchBody(`sec${n}`));
    const body = JSON.stringify((await owner("/api/watches")).json);
    expect(body).not.toMatch(/follower|member_id|email/i);
  });

  it("ends other Members' Follows when a Watch is made private or deleted, and tells them once", async () => {
    const owner = as(app, env, `del${n}@x`);
    const fan = as(app, env, `fan${n}@x`);
    const cond = `gone${n}`;
    const { json: a } = await owner<Watch>("/api/watches", "POST", watchBody(cond));
    const { json: b } = await owner<Watch>("/api/watches", "POST", watchBody(`${cond}b`));
    await fan(`/api/watches/${a.id}/follow`, "POST");
    await fan(`/api/watches/${b.id}/follow`, "POST");
    catalog[cond] = [study("NCT60000001")];
    await check();

    await owner(`/api/watches/${a.id}`, "DELETE");
    await owner(`/api/watches/${b.id}`, "PUT", watchBody(`${cond}b`, { private: true }));

    const items = await alertsOf(fan);
    expect(items.filter((i) => i.kind === "note").map((i) => i.kind === "note" && i.message)).toEqual([
      `“${cond}b watch” was made private by its Owner, so you no longer get Alerts for it.`,
      `“${cond} watch” was deleted by its Owner, so you no longer get Alerts for it.`,
    ]);
    // Past Alerts stay.
    expect(items.some((i) => i.kind === "alert" && i.trial.nctId === "NCT60000001")).toBe(true);
    expect((await alertsOf(owner)).some((i) => i.kind === "note")).toBe(false);

    catalog[cond]!.push(study("NCT60000002"));
    await check();
    expect((await alertsOf(fan)).filter((i) => i.kind === "alert")).toHaveLength(1);
  });
});

describe("sorting and sending Alerts", () => {
  const withAlert = async (who: ReturnType<typeof as>, cond: string, nct: string, extra: object = {}) => {
    await who("/api/watches", "POST", watchBody(cond, extra));
    catalog[cond] = [study(nct, `Trial for ${cond}`)];
    await check();
    return (await alertsOf(who)).find((a) => a.kind === "alert" && a.trial.nctId === nct) as AlertItem;
  };

  it("lets a Member mark an Alert and keep a private note on it", async () => {
    const mum = as(app, env, `sort${n}@x`);
    const alert = await withAlert(mum, `sort${n}`, "NCT90000001");
    expect(alert).toMatchObject({ mark: null, note: "", sentBy: null });
    const marked = await mum<AlertItem>(`/api/alerts/${alert.id}`, "PUT", { mark: "interested", note: "  Ask Dr Lee  " });
    expect(marked.json).toMatchObject({ mark: "interested", note: "Ask Dr Lee" });
    expect((await mum<AlertItem>(`/api/alerts/${alert.id}`, "PUT", { mark: null })).json).toMatchObject({ mark: null, note: "Ask Dr Lee" });
    expect((await mum(`/api/alerts/${alert.id}`, "PUT", { mark: "maybe" })).status).toBe(400);
    expect((await as(app, env, `nosy${n}@x`)(`/api/alerts/${alert.id}`, "PUT", { note: "hi" })).status).toBe(404);
  });

  it("sends an Alert to another Member as an Alert of their own, without the sender's mark or note", async () => {
    const mum = as(app, env, `from${n}@x`);
    const dad = as(app, env, `to${n}@x`);
    await dad("/api/me");
    const alert = await withAlert(mum, `send${n}`, "NCT90000002", { private: true });
    await mum(`/api/alerts/${alert.id}`, "PUT", { mark: "interested", note: "private thought" });
    expect((await mum(`/api/alerts/${alert.id}/send`, "POST", { email: ` TO${n}@X ` })).status).toBe(200);
    const [got] = (await alertsOf(dad)) as AlertItem[];
    expect(got).toMatchObject({ kind: "alert", trial: { nctId: "NCT90000002" }, watchNames: [], sentBy: `from${n}@x`, mark: null, note: "", read: false, viaPrivateWatch: false });
    expect(JSON.stringify(await alertsOf(dad))).not.toMatch(/private thought|send\d+ watch/);
  });

  it("tells the sender the same thing when the other Member already has the Trial, and leaves them a note", async () => {
    const mum = as(app, env, `a${n}@x`);
    const dad = as(app, env, `b${n}@x`);
    const cond = `both${n}`;
    const { json: watch } = await mum<Watch>("/api/watches", "POST", watchBody(cond));
    await dad(`/api/watches/${watch.id}/follow`, "POST");
    catalog[cond] = [study("NCT90000003", "Shared already")];
    await check();
    const [alert] = await alertsOf(mum);
    expect((await mum<{ ok: boolean }>(`/api/alerts/${alert!.id}/send`, "POST", { email: `b${n}@x` })).json).toEqual({ ok: true });
    const items = await alertsOf(dad);
    expect(items.filter((i) => i.kind === "alert")).toHaveLength(1);
    expect(items.find((i) => i.kind === "note")).toMatchObject({ message: `a${n}@x sent you “Shared already”. It's already in your Alerts.` });
  });

  it("refuses to send to someone who isn't a Member, to yourself, or an Alert that isn't yours", async () => {
    const mum = as(app, env, `me${n}@x`);
    const alert = await withAlert(mum, `mine${n}`, "NCT90000004");
    expect((await mum(`/api/alerts/${alert.id}/send`, "POST", { email: "stranger@nowhere.example" })).status).toBe(404);
    expect((await mum(`/api/alerts/${alert.id}/send`, "POST", { email: `me${n}@x` })).status).toBe(400);
    expect((await as(app, env, `thief${n}@x`)(`/api/alerts/${alert.id}/send`, "POST", { email: `me${n}@x` })).status).toBe(404);
  });
});

describe("Updates", () => {
  const raw = (nctId: string, status: string, sites: { city: string; lat: number; lon: number }[] = []) => ({
    protocolSection: {
      identificationModule: { nctId, briefTitle: `Trial ${nctId}` },
      statusModule: { overallStatus: status, studyFirstPostDateStruct: { date: "2026-11-20" } },
      contactsLocationsModule: { locations: sites.map((s) => ({ city: s.city, state: "Massachusetts", country: "United States", geoPoint: { lat: s.lat, lon: s.lon } })) },
    },
  });
  const boston = { city: "Boston", lat: 42.3584, lon: -71.0598 };
  const update = () => runUpdates(env.DB, fetchJson);

  it("turns an Alert unread and says so when its Trial starts recruiting, once", async () => {
    const mum = as(app, env, `upd${n}@x`);
    const cond = `upd${n}`;
    await mum("/api/watches", "POST", watchBody(cond));
    catalog[cond] = [raw("NCT91000001", "NOT_YET_RECRUITING")];
    await check();
    const [alert] = (await alertsOf(mum)) as AlertItem[];
    await mum(`/api/alerts/${alert!.id}/read`, "POST");

    // Changed, but not in a way worth telling anyone.
    changed = [raw("NCT91000001", "NOT_YET_RECRUITING", [boston])];
    expect(await update()).toEqual({ updated: 0 });
    expect((await alertsOf(mum))[0]).toMatchObject({ read: true, update: null });

    changed = [raw("NCT91000001", "RECRUITING", [boston])];
    expect(await update()).toEqual({ updated: 1 });
    const [after] = (await alertsOf(mum)) as AlertItem[];
    expect(after).toMatchObject({ id: alert!.id, read: false, update: { changes: ["Now recruiting"] }, trial: { status: "RECRUITING" } });
    expect(await alertsOf(mum)).toHaveLength(1);

    await mum(`/api/alerts/${alert!.id}/read`, "POST");
    expect(await update()).toEqual({ updated: 0 });
    expect((await alertsOf(mum))[0]!.read).toBe(true);
  });

  it("tells a Member about a new site within their Watch's distance, and not about far ones", async () => {
    const mum = as(app, env, `site${n}@x`);
    const cond = `site${n}`;
    await mum("/api/watches", "POST", { ...watchBody(cond), criteria: { conditions: [cond], terms: [], phases: [], statuses: [], near: { zip: "02139", miles: 25 } } });
    catalog[cond] = [raw("NCT91000002", "RECRUITING", [boston])];
    await check();
    changed = [raw("NCT91000002", "RECRUITING", [boston, { city: "Cambridge", lat: 42.3736, lon: -71.1097 }, { city: "Springfield", lat: 42.1015, lon: -72.5898 }])];
    expect(await update()).toEqual({ updated: 1 });
    const [alert] = (await alertsOf(mum)) as AlertItem[];
    expect(alert!.update!.changes).toEqual(["New site near you: Cambridge, Massachusetts (1 mi)"]);
    expect(alert!.trial.nearest).toEqual({ place: "Cambridge, Massachusetts", miles: 1 });
  });

  it("leaves Alerts marked Not for me alone", async () => {
    const mum = as(app, env, `quietupd${n}@x`);
    const cond = `quietupd${n}`;
    await mum("/api/watches", "POST", watchBody(cond));
    catalog[cond] = [raw("NCT91000003", "NOT_YET_RECRUITING")];
    await check();
    const [alert] = await alertsOf(mum);
    await mum(`/api/alerts/${alert!.id}`, "PUT", { mark: "not_for_me" });
    await mum(`/api/alerts/${alert!.id}/read`, "POST");
    changed = [raw("NCT91000003", "RECRUITING")];
    await update();
    expect((await alertsOf(mum))[0]).toMatchObject({ read: true, update: null });
  });
});

describe("Members joining and leaving", () => {
  const members = async (who: ReturnType<typeof as>) => (await who<MemberList>("/api/members")).json.members;

  it("lets any Member invite someone, who can then sign in and is listed", async () => {
    const mum = as(app, env, `inviter${n}@x.org`);
    expect((await mum("/api/members", "POST", { email: ` Gran${n}@X.org ` })).status).toBe(201);
    expect((await mum("/api/members", "POST", { email: `gran${n}@x.org` })).status).toBe(409);
    expect((await mum("/api/members", "POST", { email: "not an email" })).status).toBe(400);
    const gran = (await members(mum)).find((m) => m.email === `gran${n}@x.org`);
    expect(gran).toMatchObject({ invitedBy: `inviter${n}@x.org`, isYou: false });
    expect((await as(app, env, `gran${n}@x.org`)<{ email: string }>("/api/me")).status).toBe(200);
  });

  it("passes a leaver's Watches to the longest-standing follower, deletes the ones nobody else follows, and locks them out", async () => {
    const owner = as(app, env, `leaver${n}@x.org`);
    const first = as(app, env, `first${n}@x.org`);
    const second = as(app, env, `second${n}@x.org`);
    const { json: shared } = await owner<Watch>("/api/watches", "POST", watchBody(`shared${n}`));
    const { json: lonely } = await owner<Watch>("/api/watches", "POST", watchBody(`lonely${n}`));
    const { json: secret } = await owner<Watch>("/api/watches", "POST", watchBody(`secret${n}`, { private: true }));
    await first(`/api/watches/${shared.id}/follow`, "POST");
    await second(`/api/watches/${shared.id}/follow`, "POST");
    const leaver = (await members(first)).find((m) => m.email === `leaver${n}@x.org`)!;

    expect((await second(`/api/members/${leaver.id}`, "DELETE")).status).toBe(204);

    expect((await first<Watch>(`/api/watches/${shared.id}`)).json).toMatchObject({ isOwner: true, following: true });
    expect((await second<Watch>(`/api/watches/${shared.id}`)).json).toMatchObject({ isOwner: false, following: true });
    expect((await alertsOf(first)).find((i) => i.kind === "note")).toMatchObject({ message: expect.stringContaining(`You are now the Owner of “shared${n} watch”`) });
    expect((await first(`/api/watches/${lonely.id}`)).status).toBe(404);
    const gone = await env.DB.prepare("SELECT deleted_at FROM watches WHERE id = ?").bind(secret.id).first<{ deleted_at: string | null }>();
    expect(gone?.deleted_at).not.toBeNull();

    // Removed: refused even with a valid sign-in, not listed, and no longer alerted.
    expect((await owner("/api/watches")).status).toBe(403);
    expect((await members(first)).some((m) => m.id === leaver.id)).toBe(false);
    catalog[`shared${n}`] = [study("NCT92000001")];
    await check();
    const row = await env.DB.prepare("SELECT count(*) AS n FROM alerts WHERE member_id = ?").bind(leaver.id).first<{ n: number }>();
    expect(row?.n).toBe(0);

    // Invited again, they're back, without their old Watches.
    await first("/api/members", "POST", { email: `leaver${n}@x.org` });
    expect((await owner<Watch[]>("/api/watches")).json.some((w) => w.isOwner)).toBe(false);
  });

  it("lets a Member leave, and refuses to remove someone who isn't there", async () => {
    const me = as(app, env, `bye${n}@x.org`);
    const mine = (await members(me)).find((m) => m.isYou)!;
    expect((await me(`/api/members/${mine.id}`, "DELETE")).status).toBe(204);
    expect((await me("/api/me")).status).toBe(403);
    expect((await as(app, env, `other${n}@x.org`)(`/api/members/${mine.id}`, "DELETE")).status).toBe(404);
  });
});

describe("the Cloudflare Access sign-in list", () => {
  const cfg = { accountId: "acct", appId: "app", policyId: "pol", token: "t" };
  const cloudflare = (include: object[], putStatus = 200) => {
    const puts: { include: object[]; name: string; session_duration?: string }[] = [];
    const call = (async (_url: string, init?: RequestInit) => {
      if (init?.method !== "PUT") return Response.json({ result: { name: "Members", decision: "allow", include, exclude: [], require: [], session_duration: "720h", id: "pol" } });
      puts.push(JSON.parse(String(init.body)));
      return new Response("{}", { status: putStatus });
    }) as typeof fetch;
    return { puts, call };
  };

  it("adds and removes one address and leaves every other rule alone", async () => {
    const existing = [{ email: { email: "Andy@x.org" } }, { email_domain: { domain: "family.example" } }];
    const add = cloudflare(existing);
    await setAllowed(cfg, "gran@x.org", true, add.call);
    expect(add.puts).toEqual([expect.objectContaining({ name: "Members", session_duration: "720h", include: [...existing, { email: { email: "gran@x.org" } }] })]);
    const remove = cloudflare(existing);
    await setAllowed(cfg, "andy@x.org", false, remove.call);
    expect(remove.puts[0]!.include).toEqual([{ email_domain: { domain: "family.example" } }]);
    const same = cloudflare(existing);
    await setAllowed(cfg, "andy@x.org", true, same.call);
    expect(same.puts).toEqual([]);
  });

  it("fails loudly when Cloudflare refuses, and never empties the list", async () => {
    await expect(setAllowed(cfg, "gran@x.org", true, cloudflare([], 403).call)).rejects.toThrow(/403/);
    await expect(setAllowed(cfg, "andy@x.org", false, cloudflare([{ email: { email: "andy@x.org" } }]).call)).rejects.toThrow(/empty/);
  });
});

describe("Profiles", () => {
  const geoStudy = (nctId: string) => ({
    protocolSection: {
      identificationModule: { nctId, briefTitle: `Trial ${nctId}` },
      statusModule: { overallStatus: "RECRUITING", studyFirstPostDateStruct: { date: "2026-11-20" } },
      contactsLocationsModule: { locations: [{ city: "Boston", state: "Massachusetts", country: "United States", geoPoint: { lat: 42.3584, lon: -71.0598 } }] },
    },
  });

  it("keeps a Member's Profile to themselves and checks what goes in", async () => {
    const mum = as(app, env, `prof${n}@x.org`);
    expect((await mum<Profile>("/api/profile")).json).toEqual({ birthYear: null, sex: null, zip: null, miles: null, healthyVolunteer: true, conditions: [], heightIn: null, weightLb: null, nicotine: null, lastDonationOn: null });
    const saved = await mum<Profile>("/api/profile", "PUT", { birthYear: "1981", sex: "FEMALE", zip: " 02139 ", healthyVolunteer: true, conditions: [" MS ", "MS", ""] });
    expect(saved.json).toEqual({ birthYear: 1981, sex: "FEMALE", zip: "02139", miles: 50, healthyVolunteer: true, conditions: ["MS"], heightIn: null, weightLb: null, nicotine: null, lastDonationOn: null });
    expect((await mum<Profile>("/api/profile")).json).toEqual(saved.json);
    expect((await as(app, env, `other${n}@x.org`)<Profile>("/api/profile")).json.zip).toBeNull();
    for (const bad of [{ birthYear: 1700 }, { sex: "ALL" }, { zip: "00000" }, { zip: "02139", miles: 7 }]) {
      expect((await mum("/api/profile", "PUT", bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect(JSON.stringify((await mum("/api/members")).json)).not.toMatch(/1981|02139/);
  });

  it("lets a volunteer watch for healthy-volunteer studies near them, with no condition at all", async () => {
    const vol = as(app, env, `vol${n}@x.org`);
    const made = await vol<Watch>("/api/watches", "POST", { name: "Near me", criteria: { conditions: [], terms: [], phases: [], statuses: [], healthy: true, near: { zip: "02139", miles: 50 } }, private: false });
    expect(made.status).toBe(201);
    expect(made.json.criteria).toMatchObject({ conditions: [], healthy: true, near: { zip: "02139" } });
    const refused = await vol<{ error: string }>("/api/watches", "POST", { name: "Everything", criteria: { conditions: [], terms: [], phases: [], statuses: [], healthy: true }, private: false });
    expect(refused.status).toBe(400);
  });

  it("measures each Member's distance from their own Profile when the Watch has no ZIP code", async () => {
    const near = as(app, env, `near${n}@x.org`);
    const noProfile = as(app, env, `nowhere${n}@x.org`);
    await near("/api/profile", "PUT", { zip: "02139", miles: 25 });
    const cond = `dist${n}`;
    const { json: watch } = await near<Watch>("/api/watches", "POST", watchBody(cond));
    await noProfile(`/api/watches/${watch.id}/follow`, "POST");
    catalog[cond] = [geoStudy("NCT93000001")];
    await check();
    expect(((await alertsOf(near))[0] as AlertItem).trial.nearest).toEqual({ place: "Boston, Massachusetts", miles: 2 });
    expect(((await alertsOf(noProfile))[0] as AlertItem).trial.nearest).toBeUndefined();
    expect((await near<{ nearest?: object }[]>(`/api/watches/${watch.id}/recent`)).json[0]!.nearest).toEqual({ place: "Boston, Massachusetts", miles: 2 });
    expect((await noProfile<{ nearest?: object }[]>(`/api/watches/${watch.id}/recent`)).json[0]!.nearest).toBeUndefined();
  });
});

describe("kind of study", () => {
  /** A study as the fake ClinicalTrials.gov returns it, of the given type and intervention types. */
  const studyOfKind = (nctId: string, studyType: string, ...types: string[]) => {
    const s = study(nctId);
    return { protocolSection: { ...s.protocolSection, designModule: { ...s.protocolSection.designModule, studyType }, armsInterventionsModule: { interventions: types.map((type) => ({ type })) } } };
  };
  const criteriaOf = (cond: string, kinds?: unknown) => ({ conditions: [cond], terms: [], phases: [], statuses: [], ...(kinds === undefined ? {} : { kinds }) });

  it("saves the kinds a Watch asks for, and searches ClinicalTrials.gov for only those", async () => {
    const vol = as(app, env, `kinds${n}@x`);
    const cond = `kinds${n}`;
    const made = await vol<Watch>("/api/watches", "POST", watchBody(cond, { criteria: criteriaOf(cond, ["DRUG", "OBSERVATIONAL"]) }));
    expect(made.status).toBe(201);
    expect((await vol<Watch>(`/api/watches/${made.json.id}`)).json.criteria.kinds).toEqual(["DRUG", "OBSERVATIONAL"]);

    filtersSent = [];
    await check();
    const wanted = "(AREA[StudyType]OBSERVATIONAL OR (AREA[StudyType]INTERVENTIONAL AND AREA[InterventionType](DRUG)))";
    expect(filtersSent.filter((f) => f.includes(wanted))).toHaveLength(1);

    // Editing the Watch back to any kind stops the narrowing.
    await vol(`/api/watches/${made.json.id}`, "PUT", watchBody(cond, { criteria: criteriaOf(cond, []) }));
    filtersSent = [];
    await check();
    expect(filtersSent.some((f) => f.includes("InterventionType") || f.includes("StudyType"))).toBe(false);
  });

  it("treats a Watch saved without kinds as taking any kind", async () => {
    const vol = as(app, env, `anykind${n}@x`);
    const cond = `anykind${n}`;
    const made = await vol<Watch>("/api/watches", "POST", watchBody(cond));
    expect(made.json.criteria.kinds).toEqual([]);
    await check();
    expect(filtersSent.some((f) => f.includes("InterventionType") || f.includes("StudyType"))).toBe(false);
  });

  it("refuses a kind of study it doesn't offer, on a new Watch and in a preview", async () => {
    const vol = as(app, env, `badkind${n}@x`);
    const cond = `badkind${n}`;
    const refused = await vol<{ error: string }>("/api/watches", "POST", watchBody(cond, { criteria: criteriaOf(cond, ["SURGERY"]) }));
    expect(refused.status).toBe(400);
    expect(refused.json.error).toBe("Unknown kind of study SURGERY");
    expect((await vol("/api/preview", "POST", { criteria: criteriaOf(cond, ["SURGERY"]) })).status).toBe(400);
    expect(filtersSent).toEqual([]);
  });

  it("shows what kind each Trial is in Recent matches and on its Alert", async () => {
    const vol = as(app, env, `shown${n}@x`);
    const cond = `shown${n}`;
    catalog[cond] = [studyOfKind("NCT81000001", "OBSERVATIONAL", "DEVICE")];
    const watch = (await vol<Watch>("/api/watches", "POST", watchBody(cond))).json;
    const [recent] = (await vol<{ nctId: string; kinds?: string[] }[]>(`/api/watches/${watch.id}/recent`)).json;
    expect(recent).toMatchObject({ nctId: "NCT81000001", kinds: ["OBSERVATIONAL"] });

    await check();
    catalog[cond]!.push(studyOfKind("NCT81000002", "INTERVENTIONAL", "DRUG", "DRUG", "PROCEDURE"), study("NCT81000003"));
    await check();
    const alerts = (await alertsOf(vol)) as AlertItem[];
    const kindsByTrial = Object.fromEntries(alerts.map((a) => [a.trial.nctId, a.trial.kinds]));
    expect(kindsByTrial).toEqual({ NCT81000002: ["DRUG", "PROCEDURE"], NCT81000003: undefined });
    // The Alert's own page gets the same Trial.
    const drugAlert = alerts.find((a) => a.trial.nctId === "NCT81000002")!;
    expect((await vol<AlertItem>(`/api/alerts/${drugAlert.id}`)).json.trial.kinds).toEqual(["DRUG", "PROCEDURE"]);
  });
});

describe("Clinics in a Watch", () => {
  const at = (nctId: string, facility: string, city: string) => {
    const s = study(nctId);
    return { protocolSection: { ...s.protocolSection, contactsLocationsModule: { locations: [{ facility, city, state: "Nebraska", country: "United States", geoPoint: { lat: 40.8, lon: -96.667 } }] } } };
  };
  const lincoln = 'SEARCH[Location](AREA[LocationFacility]("Celerion") AND AREA[LocationCity]("Lincoln"))';

  it("takes a Watch that asks only for a Clinic, and asks ClinicalTrials.gov for that Clinic's site", async () => {
    const vol = as(app, env, `clinic${n}@x`);
    const made = await vol<Watch>("/api/watches", "POST", { name: "Celerion", criteria: { clinics: ["celerion-lincoln"], healthy: true }, private: false });
    expect(made.status).toBe(201);
    expect(made.json.criteria).toMatchObject({ clinics: ["celerion-lincoln"], conditions: [], healthy: true });
    filtersSent = [];
    await check();
    expect(filtersSent.filter((f) => f.includes(lincoln) && f.includes("AREA[HealthyVolunteers]true"))).toHaveLength(1);

    const refused = await vol<{ error: string }>("/api/watches", "POST", { name: "Nowhere", criteria: { clinics: ["nowhere"] }, private: false });
    expect(refused.status).toBe(400);
    expect(refused.json.error).toBe("Unknown Clinic nowhere");
  });

  it("puts the Clinic on the Alert, and an older Alert without one gets no Update for it", async () => {
    const vol = as(app, env, `clinicalert${n}@x`);
    const cond = `clinicalert${n}`;
    await vol("/api/watches", "POST", watchBody(cond, { criteria: { conditions: [cond], clinics: ["celerion-lincoln"] } }));
    catalog[cond] = [at("NCT93000001", "Celerion, Inc.", "Lincoln")];
    await check();
    const [alert] = (await alertsOf(vol)) as AlertItem[];
    expect(alert!.trial.clinics).toEqual(["celerion-lincoln"]);

    // An Alert stored before Clinics were kept: the same Trial, read again, is not a change.
    const old = { ...alert!.trial } as { clinics?: string[] };
    delete old.clinics;
    await env.DB.prepare("UPDATE alerts SET trial = ?, read_at = ? WHERE id = ?").bind(JSON.stringify(old), new Date().toISOString(), alert!.id).run();
    changed = [at("NCT93000001", "Celerion, Inc.", "Lincoln")];
    expect(await runUpdates(env.DB, fetchJson)).toEqual({ updated: 0 });
    expect((await alertsOf(vol))[0]).toMatchObject({ read: true, update: null });
  });
});

describe("Past studies and waiting periods", () => {
  const today = () => new Date().toISOString().slice(0, 10);
  const notesOf = async (who: ReturnType<typeof as>) => (await alertsOf(who)).filter((a) => a.kind === "note");

  it("works out when the wait ends, and keeps each Member's Past studies to themselves", async () => {
    const vol = as(app, env, `wait${n}@x.org`);
    const other = as(app, env, `waitother${n}@x.org`);
    expect((await vol<PastStudy[]>("/api/past-studies")).json).toEqual([]);

    const ended = addDays(today(), -10);
    const dose = addDays(today(), -5);
    const made = await vol<PastStudy>("/api/past-studies", "POST", { label: " Celerion ", endedOn: ended, lastDoseOn: dose });
    expect(made.status).toBe(201);
    expect(made.json).toMatchObject({ label: "Celerion", endedOn: ended, lastDoseOn: dose, waitDays: 30, freeOn: addDays(dose, 30) });
    await vol("/api/past-studies", "POST", { endedOn: ended, waitDays: 90 });
    // The one that keeps them waiting longest comes first.
    expect((await vol<PastStudy[]>("/api/past-studies")).json.map((s) => s.freeOn)).toEqual([addDays(ended, 90), addDays(dose, 30)]);

    expect((await vol("/api/past-studies", "POST", { endedOn: "not a day" })).status).toBe(400);
    expect((await vol("/api/past-studies", "POST", { endedOn: ended, waitDays: 1000 })).status).toBe(400);

    // Nobody else sees them or can remove them.
    expect((await other<PastStudy[]>("/api/past-studies")).json).toEqual([]);
    expect((await other(`/api/past-studies/${made.json.id}`, "DELETE")).status).toBe(404);
    expect((await vol(`/api/past-studies/${made.json.id}`, "DELETE")).status).toBe(204);
    expect((await vol<PastStudy[]>("/api/past-studies")).json).toHaveLength(1);
  });

  it("tells a Member once, in their Alert list, when the wait is over, and names no study", async () => {
    const vol = as(app, env, `waitover${n}@x.org`);
    const ends = addDays(today(), 3);
    await vol("/api/past-studies", "POST", { label: "Secret study name", endedOn: addDays(ends, -30) });
    // A wait already over when it is written down is never announced.
    await vol("/api/past-studies", "POST", { endedOn: addDays(today(), -200) });

    await tellWaitsOver(env.DB);
    // Not on the day itself by UTC, which is still the evening before in the United States.
    await tellWaitsOver(env.DB, `${ends}T12:00:00.000Z`);
    expect(await notesOf(vol)).toEqual([]);

    await tellWaitsOver(env.DB, `${addDays(ends, 1)}T00:17:00.000Z`);
    await tellWaitsOver(env.DB, `${addDays(ends, 1)}T01:17:00.000Z`);
    const notes = await notesOf(vol);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ read: false, message: `Your waiting period ended on ${ends}, going by the dates you gave. Each study sets its own rule, so ask the clinic before you book a screening.` });
  });

  it("lets a Member change a Past study of their own, and nobody else's", async () => {
    const vol = as(app, env, `waitedit${n}@x.org`);
    const other = as(app, env, `waiteditother${n}@x.org`);
    const ended = addDays(today(), -10);
    const made = await vol<PastStudy>("/api/past-studies", "POST", { label: "Celerion", endedOn: ended });
    const changed = await vol<PastStudy>(`/api/past-studies/${made.json.id}`, "PUT", { label: " Celerion, October ", endedOn: ended, lastDoseOn: addDays(ended, 2), waitDays: 60 });
    expect(changed.status).toBe(200);
    expect(changed.json).toEqual({ id: made.json.id, label: "Celerion, October", endedOn: ended, lastDoseOn: addDays(ended, 2), waitDays: 60, freeOn: addDays(ended, 62) });
    expect((await vol<PastStudy[]>("/api/past-studies")).json).toEqual([changed.json]);

    expect((await vol(`/api/past-studies/${made.json.id}`, "PUT", { endedOn: "not a day" })).status).toBe(400);
    expect((await vol("/api/past-studies/no-such-id", "PUT", { endedOn: ended })).status).toBe(404);
    expect((await other(`/api/past-studies/${made.json.id}`, "PUT", { label: "Mine now", endedOn: ended })).status).toBe(404);
    expect((await vol<PastStudy[]>("/api/past-studies")).json).toEqual([changed.json]);
  });

  it("still tells a Member once after a Past study is changed", async () => {
    const vol = as(app, env, `waitretell${n}@x.org`);
    const ends = addDays(today(), 3);
    const made = await vol<PastStudy>("/api/past-studies", "POST", { endedOn: addDays(ends, -30) });
    await tellWaitsOver(env.DB, `${addDays(ends, 1)}T00:17:00.000Z`);
    expect(await notesOf(vol)).toHaveLength(1);

    // Moved into the future: told again when the new wait ends, and only then.
    const later = addDays(today(), 40);
    await vol(`/api/past-studies/${made.json.id}`, "PUT", { endedOn: addDays(later, -30) });
    await tellWaitsOver(env.DB, `${addDays(ends, 2)}T00:17:00.000Z`);
    expect(await notesOf(vol)).toHaveLength(1);
    await tellWaitsOver(env.DB, `${addDays(later, 1)}T00:17:00.000Z`);
    await tellWaitsOver(env.DB, `${addDays(later, 1)}T01:17:00.000Z`);
    expect((await notesOf(vol)).map((x) => (x as { message: string }).message)).toEqual([expect.stringContaining(`ended on ${later}`), expect.stringContaining(`ended on ${ends}`)]);
  });

  it("announces nothing late for a wait changed to be already over", async () => {
    const vol = as(app, env, `waitpast${n}@x.org`);
    const made = await vol<PastStudy>("/api/past-studies", "POST", { endedOn: addDays(today(), -5) });
    await vol(`/api/past-studies/${made.json.id}`, "PUT", { endedOn: addDays(today(), -100) });
    await tellWaitsOver(env.DB, `${addDays(today(), 1)}T00:17:00.000Z`);
    await tellWaitsOver(env.DB, `${addDays(today(), 400)}T00:17:00.000Z`);
    expect(await notesOf(vol)).toEqual([]);
  });

  it("says nothing while another Past study still keeps the Member waiting", async () => {
    const vol = as(app, env, `waittwo${n}@x.org`);
    const first = addDays(today(), 2);
    const second = addDays(today(), 20);
    await vol("/api/past-studies", "POST", { endedOn: addDays(first, -30) });
    await vol("/api/past-studies", "POST", { endedOn: addDays(second, -30) });
    await tellWaitsOver(env.DB, `${addDays(first, 1)}T00:17:00.000Z`);
    expect(await notesOf(vol)).toEqual([]);
    await tellWaitsOver(env.DB, `${addDays(second, 1)}T00:17:00.000Z`);
    expect((await notesOf(vol)).map((x) => (x as { message: string }).message)).toEqual([expect.stringContaining(`ended on ${second}`)]);
  });

  it("forgets a Member's Past studies when they leave", async () => {
    const vol = as(app, env, `waitleaver${n}@x.org`);
    const mum = as(app, env, `waitmum${n}@x.org`);
    await vol("/api/past-studies", "POST", { endedOn: addDays(today(), -3) });
    const leaver = (await mum<MemberList>("/api/members")).json.members.find((m) => m.email === `waitleaver${n}@x.org`)!;
    expect((await mum(`/api/members/${leaver.id}`, "DELETE")).status).toBe(204);
    const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM past_studies WHERE member_id = ?").bind(leaver.id).first<{ n: number }>();
    expect(left?.n).toBe(0);
  });
});

describe("Points to check", () => {
  const withCriteria = (nctId: string, eligibilityCriteria: string) => {
    const s = study(nctId);
    return { protocolSection: { ...s.protocolSection, eligibilityModule: { eligibilityCriteria } } };
  };

  it("keeps the new Profile facts to their Member and checks what goes in", async () => {
    const vol = as(app, env, `facts${n}@x.org`);
    const today = new Date().toISOString().slice(0, 10);
    const saved = await vol<Profile>("/api/profile", "PUT", { healthyVolunteer: true, heightIn: 69.04, weightLb: "165", nicotine: "no", lastDonationOn: today });
    expect(saved.status).toBe(200);
    expect(saved.json).toMatchObject({ heightIn: 69, weightLb: 165, nicotine: "no", lastDonationOn: today });
    expect((await vol<Profile>("/api/profile")).json).toEqual(saved.json);
    expect((await as(app, env, `factsother${n}@x.org`)<Profile>("/api/profile")).json).toMatchObject({ heightIn: null, weightLb: null, nicotine: null, lastDonationOn: null });
    for (const bad of [{ heightIn: 10 }, { heightIn: "x" }, { weightLb: 5 }, { weightLb: 5000 }, { nicotine: "sometimes" }, { lastDonationOn: "2999-01-01" }, { lastDonationOn: "yesterday" }]) {
      expect((await vol("/api/profile", "PUT", bad)).status, JSON.stringify(bad)).toBe(400);
    }
    // Saving without them clears them: every fact is optional.
    expect((await vol<Profile>("/api/profile", "PUT", { healthyVolunteer: true })).json).toMatchObject({ heightIn: null, weightLb: null, nicotine: null, lastDonationOn: null });
  });

  it("shows the count in the Alert list and the Entry criteria only on the Alert itself", async () => {
    const vol = as(app, env, `points${n}@x.org`);
    const cond = `points${n}`;
    await vol("/api/watches", "POST", watchBody(cond));
    catalog[cond] = [withCriteria("NCT94000001", "Inclusion Criteria:\n\n* BMI 18 to 30 kg/m2\n* Non-smoker\n\nExclusion Criteria:\n\n* History of liver disease")];
    await check();
    const [listed] = (await alertsOf(vol)) as AlertItem[];
    expect(listed!.trial.points).toBe(2);
    expect(listed!.trial).not.toHaveProperty("eligibility");
    const full = (await vol<AlertItem>(`/api/alerts/${listed!.id}`)).json;
    expect(full.trial.eligibility?.criteria).toContain("BMI 18 to 30");
  });
});

describe("Trials that come to match later", () => {
  const watchRow = (id: string) => env.DB.prepare("SELECT knows FROM watches WHERE id = ?").bind(id).first<{ knows: string | null }>();
  /** What the fake ClinicalTrials.gov was asked about one condition since `asked` was last emptied. */
  const filtersFor = (cond: string) => asked.filter((q) => q.cond.includes(`"${cond}"`)).map((q) => q.filter);

  it("alerts on a Trial posted long ago once it starts to match, but not on what the Watch matched when it was made", async () => {
    const vol = as(app, env, `late${n}@x`);
    const cond = `late${n}`;
    // Matching already when the Watch is made: recorded, never an Alert.
    catalog[cond] = [study("NCT95000001", "Was already there", "2024-01-10")];
    longPosted = ["NCT95000001", "NCT95000002"];
    const made = await vol<Watch>("/api/watches", "POST", watchBody(cond));
    expect((await watchRow(made.json.id))?.knows).toBe("all");
    await check();
    expect(await alertsOf(vol)).toEqual([]);

    // Posted in 2024, and only now matching (a site added, recruiting reopened).
    catalog[cond]!.push(study("NCT95000002", "Matches only now", "2024-03-02"));
    asked = [];
    const result = await check();
    expect(result.alertsCreated).toBe(1);
    const [alert] = (await alertsOf(vol)) as AlertItem[];
    expect(alert!.trial).toMatchObject({ nctId: "NCT95000002", firstPosted: "2024-03-02" });
    // It was found by asking what changed, not what was first posted.
    expect(filtersFor(cond)).toHaveLength(1);
    expect(filtersFor(cond)[0]).toMatch(/^AREA\[LastUpdatePostDate\]RANGE\[\d{4}-\d\d-\d\d,MAX\]$/);
    // And only once.
    expect((await check()).alertsCreated).toBe(0);
  });

  it("tells whoever can see a Watch what it can alert on", async () => {
    const owner = as(app, env, `says${n}@x`);
    const other = as(app, env, `says-other${n}@x`);
    catalog[`narrow${n}`] = [study("NCT95050001")];
    const narrow = await owner<Watch>("/api/watches", "POST", watchBody(`narrow${n}`));
    expect(narrow.json.knows).toBe("all");
    expect((await other<Watch>(`/api/watches/${narrow.json.id}`)).json.knows).toBe("all");

    tooBroad = [`wide${n}`];
    const wide = await owner<Watch>("/api/watches", "POST", watchBody(`wide${n}`));
    expect(wide.json.knows).toBe("recent");
    expect((await owner<Watch[]>("/api/watches")).json.find((w) => w.id === wide.json.id)?.knows).toBe("recent");

    // A Watch made before this was kept: not worked out until its next Check.
    await env.DB.prepare("UPDATE watches SET knows = NULL WHERE id = ?").bind(narrow.json.id).run();
    expect((await owner<Watch>(`/api/watches/${narrow.json.id}`)).json.knows).toBeNull();
    await check();
    expect((await owner<Watch>(`/api/watches/${narrow.json.id}`)).json.knows).toBe("all");
  });

  it("keeps looking only at newly posted Trials for a Watch that matches too many to record", async () => {
    const vol = as(app, env, `broad${n}@x`);
    const cond = `broad${n}`;
    tooBroad = [cond];
    catalog[cond] = [study("NCT95100001")];
    const made = await vol<Watch>("/api/watches", "POST", watchBody(cond));
    expect((await watchRow(made.json.id))?.knows).toBe("recent");
    // An old Trial that changes is not something this Watch can tell from one it always matched.
    catalog[cond]!.push(study("NCT95100002", "Old and changed", "2023-05-05"));
    longPosted = ["NCT95100002"];
    asked = [];
    expect((await check()).alertsCreated).toBe(0);
    expect(filtersFor(cond)).toHaveLength(1);
    expect(filtersFor(cond)[0]).toMatch(/^AREA\[StudyFirstPostDate\]RANGE\[/);
    // A newly posted one still alerts.
    catalog[cond]!.push(study("NCT95100003", "Posted today"));
    expect((await check()).alertsCreated).toBe(1);
  });

  it("teaches a Watch made before this what it matches, without Alerts for any of it, and loses no new Trial that hour", async () => {
    const vol = as(app, env, `older${n}@x`);
    const cond = `older${n}`;
    const made = await vol<Watch>("/api/watches", "POST", watchBody(cond));
    // As it was before `knows` existed: nothing recorded about old Trials.
    await env.DB.prepare("UPDATE watches SET knows = NULL WHERE id = ?").bind(made.json.id).run();
    catalog[cond] = [study("NCT95200001", "Old, matched all along", "2022-02-02"), study("NCT95200002", "Posted this hour")];
    longPosted = ["NCT95200001"];

    const first = await check();
    expect(first.alertsCreated).toBe(1);
    expect(((await alertsOf(vol)) as AlertItem[]).map((a) => a.trial.nctId)).toEqual(["NCT95200002"]);
    expect((await watchRow(made.json.id))?.knows).toBe("all");

    // From now on it asks what changed, and the old Trial it learned about stays quiet.
    asked = [];
    expect((await check()).alertsCreated).toBe(0);
    expect(filtersFor(cond)).toEqual([expect.stringMatching(/^AREA\[LastUpdatePostDate\]RANGE\[/)]);
  });

  it("records what the new criteria match when a Watch is changed, so the change sets off no Alerts", async () => {
    const vol = as(app, env, `edit${n}@x`);
    const a = `edita${n}`;
    const b = `editb${n}`;
    const made = await vol<Watch>("/api/watches", "POST", watchBody(a));
    catalog[b] = [study("NCT95300001", "Matched the new words already", "2021-09-09")];
    longPosted = ["NCT95300001"];
    tooBroad = [b];
    await vol(`/api/watches/${made.json.id}`, "PUT", watchBody(b));
    expect((await watchRow(made.json.id))?.knows).toBe("recent");
    tooBroad = [];
    await vol(`/api/watches/${made.json.id}`, "PUT", { ...watchBody(b), criteria: { conditions: [b], terms: [], phases: ["PHASE1"], statuses: [] } });
    expect((await watchRow(made.json.id))?.knows).toBe("all");
    expect((await check()).alertsCreated).toBe(0);
    expect(await alertsOf(vol)).toEqual([]);
  });
});
