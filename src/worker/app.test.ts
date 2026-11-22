import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AlertItem, AlertListItem, MemberList, Watch } from "../shared/api";
import { as, createWorkerEnv, study } from "../test/worker-env";
import { setAllowed } from "./access";
import { app } from "./app";
import { checkStatus, runCheck } from "./check";
import { runUpdates } from "./updates";
import { fetchJson } from "../shared/ctgov";

let env: Env;
let dispose: () => Promise<void>;

/** What the fake ClinicalTrials.gov returns, by condition. A thrown value makes it fail. */
let catalog: Record<string, unknown[]> = {};
/** What the fake ClinicalTrials.gov says has changed, when asked about Trials by NCT ID. */
let changed: { protocolSection: { identificationModule: { nctId: string } } }[] = [];
let failing = false;

beforeAll(async () => {
  ({ env, dispose } = await createWorkerEnv());
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    if (failing) return new Response("down", { status: 503 });
    const params = new URL(String(input instanceof Request ? input.url : input)).searchParams;
    const ids = params.get("filter.ids")?.split(",");
    if (ids) return Response.json({ studies: changed.filter((s) => ids.includes(s.protocolSection.identificationModule.nctId)) });
    const cond = params.get("query.cond") ?? "";
    const studies = Object.entries(catalog)
      .filter(([c]) => cond.includes(`"${c}"`))
      .flatMap(([, s]) => s);
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
