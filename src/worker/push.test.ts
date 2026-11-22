import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Device, Watch } from "../shared/api";
import { fetchJson } from "../shared/ctgov";
import { as, createWorkerEnv, study } from "../test/worker-env";
import { app } from "./app";
import { checkAndPush } from "./check";
import { b64url } from "./webpush";

let env: Env;
let dispose: () => Promise<void>;
let catalog: Record<string, unknown[]> = {};

beforeAll(async () => {
  ({ env, dispose } = await createWorkerEnv());
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const cond = new URL(String(input instanceof Request ? input.url : input)).searchParams.get("query.cond") ?? "";
    return Response.json({ studies: Object.entries(catalog).filter(([c]) => cond.includes(`"${c}"`)).flatMap(([, s]) => s) });
  });
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await dispose();
});

let n = 0;
beforeEach(async () => {
  catalog = {};
  await env.DB.prepare("DELETE FROM checks").run();
  n++;
});

/** A real browser key pair, so the payloads Pushes carry are genuinely encrypted to it. */
async function browserKeys() {
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  return {
    p256dh: b64url.encode((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer),
    auth: b64url.encode(crypto.getRandomValues(new Uint8Array(16))),
  };
}

const endpoint = (tag: string) => `https://fcm.googleapis.com/fcm/send/${tag}-${n}`;

async function addDevice(who: ReturnType<typeof as>, tag: string, label = "Phone") {
  return who<Device>("/api/devices", "POST", { endpoint: endpoint(tag), keys: await browserKeys(), label });
}

/** A push service that records who was pushed and answers with `status`. */
function pushService(status: (url: string) => number = () => 201) {
  const calls: { url: string; headers: Headers }[] = [];
  const post = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: new Headers(init.headers) });
    return new Response(null, { status: status(url) });
  }) as typeof fetch;
  return { calls, post };
}

const watchBody = (condition: string, extra: object = {}) => ({
  name: `${condition} watch`,
  criteria: { conditions: [condition], terms: [], phases: [], statuses: [] },
  private: false,
  ...extra,
});

describe("Devices", () => {
  it("registers a browser and never hands back its endpoint or keys", async () => {
    const mum = as(app, env, `dm${n}@x`);
    expect((await addDevice(mum, "a", "iPhone · Safari")).status).toBe(201);
    const { json } = await mum<Device[]>(`/api/devices?endpoint=${encodeURIComponent(endpoint("a"))}`);
    expect(json).toEqual([expect.objectContaining({ label: "iPhone · Safari", thisDevice: true, lastSentAt: null })]);
    expect(JSON.stringify(json)).not.toMatch(/fcm|p256dh|auth/);
  });

  it("refuses endpoints that aren't real push services, and malformed keys", async () => {
    const mum = as(app, env, `bad${n}@x`);
    const keys = await browserKeys();
    for (const ep of ["https://evil.example/x", "http://fcm.googleapis.com/x", "http://169.254.169.254/"]) {
      expect((await mum("/api/devices", "POST", { endpoint: ep, keys })).status, ep).toBe(400);
    }
    expect((await mum("/api/devices", "POST", { endpoint: endpoint("k"), keys: { p256dh: "AAAA", auth: keys.auth } })).status).toBe(400);
  });

  it("moves a shared browser to whoever turned notifications on last", async () => {
    const mum = as(app, env, `ipad-m${n}@x`);
    const dad = as(app, env, `ipad-d${n}@x`);
    await addDevice(mum, "ipad");
    await addDevice(dad, "ipad");
    expect((await mum<Device[]>("/api/devices")).json).toEqual([]);
    expect((await dad<Device[]>("/api/devices")).json).toHaveLength(1);
  });

  it("only lets a Member remove or test their own Devices", async () => {
    const mum = as(app, env, `own${n}@x`);
    const other = as(app, env, `notown${n}@x`);
    const { json: device } = await addDevice(mum, "own");
    expect((await other(`/api/devices/${device.id}`, "DELETE")).status).toBe(404);
    expect((await other(`/api/devices/${device.id}/test`, "POST")).status).toBe(404);
    expect((await mum(`/api/devices/${device.id}`, "DELETE")).status).toBe(204);
    expect((await mum<Device[]>("/api/devices")).json).toEqual([]);
  });
});

describe("Pushes after a Check", () => {
  it("pushes each new Alert to every Device of each follower, signed with VAPID", async () => {
    const mum = as(app, env, `p1${n}@x`);
    const cond = `push${n}`;
    await mum("/api/watches", "POST", watchBody(cond));
    await addDevice(mum, "phone");
    await addDevice(mum, "laptop");
    catalog[cond] = [study("NCT80000001"), study("NCT80000002")];
    const svc = pushService();
    const r = await checkAndPush(env, fetchJson, svc.post);
    expect(r).toMatchObject({ ok: true, alertsCreated: 2, pushes: { sent: 4, gone: 0 } });
    expect(svc.calls.map((c) => c.url).sort()).toEqual([endpoint("laptop"), endpoint("laptop"), endpoint("phone"), endpoint("phone")]);
    for (const c of svc.calls) {
      expect(c.headers.get("Content-Encoding")).toBe("aes128gcm");
      expect(c.headers.get("Authorization")).toMatch(/^vapid t=.+, k=BP4z9/);
    }
    // Already-pushed Alerts aren't pushed again.
    const again = pushService();
    await checkAndPush(env, fetchJson, again.post);
    expect(again.calls).toEqual([]);
  });

  it("sends one summary Push when a Check finds more than three Alerts for someone", async () => {
    const dad = as(app, env, `p2${n}@x`);
    const cond = `busy${n}`;
    await dad("/api/watches", "POST", watchBody(cond));
    await addDevice(dad, "phone");
    catalog[cond] = ["1", "2", "3", "4", "5"].map((i) => study(`NCT8100000${i}`));
    const svc = pushService();
    const r = await checkAndPush(env, fetchJson, svc.post);
    expect(r.alertsCreated).toBe(5);
    expect(svc.calls).toHaveLength(1);
  });

  it("forgets a Device the push service says is gone, keeps one with a VAPID problem, and never fails the Check", async () => {
    const mum = as(app, env, `p3${n}@x`);
    const cond = `gone${n}`;
    await mum("/api/watches", "POST", watchBody(cond));
    await addDevice(mum, "old", "Old phone");
    await addDevice(mum, "keys", "Keys wrong");
    catalog[cond] = [study("NCT82000001")];
    const svc = pushService((url) => (url.includes("/old-") ? 410 : 403));
    const r = await checkAndPush(env, fetchJson, svc.post);
    expect(r).toMatchObject({ ok: true, alertsCreated: 1, pushes: { sent: 0, gone: 1 } });
    expect((await mum<Device[]>("/api/devices")).json.map((d) => d.label)).toEqual(["Keys wrong"]);
  });

  it("retries an Alert no Device received, without re-sending to anyone who got it, and keeps Private wording", async () => {
    const mum = as(app, env, `r1${n}@x`);
    const dad = as(app, env, `r2${n}@x`);
    const [cond, secret] = [`retry${n}`, `retrysecret${n}`];
    const { json: shared } = await mum<Watch>("/api/watches", "POST", watchBody(cond));
    await mum("/api/watches", "POST", watchBody(secret, { private: true }));
    await dad(`/api/watches/${shared.id}/follow`, "POST");
    await addDevice(mum, "mum");
    await addDevice(dad, "dad");
    catalog[cond] = [study("NCT85000001", "Shared trial")];
    catalog[secret] = [study("NCT85000002", "Secret trial")];
    // Mum's push service is down; Dad's works.
    const first = pushService((url) => (url.includes("/mum-") ? 503 : 201));
    // Other tests' Members share the database, so look only at this test's two Devices.
    const mine = (svc: ReturnType<typeof pushService>) => svc.calls.map((c) => c.url).filter((u) => u === endpoint("mum") || u === endpoint("dad"));
    expect(await checkAndPush(env, fetchJson, first.post)).toMatchObject({ alertsCreated: 3 });
    expect(mine(first).sort()).toEqual([endpoint("dad"), endpoint("mum"), endpoint("mum")]);

    const second = pushService();
    expect(await checkAndPush(env, fetchJson, second.post)).toMatchObject({ alertsCreated: 0 });
    expect(mine(second)).toEqual([endpoint("mum"), endpoint("mum")]);

    const third = pushService();
    await checkAndPush(env, fetchJson, third.post);
    expect(mine(third)).toEqual([]);
    const flags = await env.DB.prepare("SELECT via_private FROM alerts WHERE nct_id = 'NCT85000002'").first<{ via_private: number }>();
    expect(flags?.via_private).toBe(1);
  });

  it("doesn't save Pushes up for a Member with no Device, or retry forever", async () => {
    const mum = as(app, env, `r3${n}@x`);
    const cond = `nodevice${n}`;
    await mum("/api/watches", "POST", watchBody(cond));
    catalog[cond] = [study("NCT86000001")];
    await checkAndPush(env, fetchJson, pushService().post);
    await addDevice(mum, "late");
    const later = pushService();
    await checkAndPush(env, fetchJson, later.post);
    expect(later.calls.filter((c) => c.url === endpoint("late"))).toEqual([]);

    // An Alert that keeps failing stops being retried after a day.
    const { pushPendingAlerts, vapidFrom } = await import("./push");
    catalog[cond]!.push(study("NCT86000002"));
    await checkAndPush(env, fetchJson, pushService(() => 503).post);
    const old = pushService();
    await pushPendingAlerts(env.DB, vapidFrom(env)!, old.post, Date.now() + 25 * 3_600_000);
    expect(old.calls.filter((c) => c.url === endpoint("late"))).toEqual([]);
  });

  it("never names a trial found through a Private watch on the lock screen", async () => {
    const { messagesFor } = await import("./push");
    const trial = { nctId: "NCT83000001", title: "HIV vaccine study", summary: "", firstPosted: "", status: "RECRUITING", phases: [], conditions: [], sponsor: "", minimumAge: "", maximumAge: "", locations: [], url: "" };
    const [privateMsg] = messagesFor([{ id: "a1", memberId: "m", trial, watchNames: ["Mine"], viaPrivateWatch: true }]);
    expect(JSON.stringify(privateMsg)).not.toMatch(/HIV|Mine/);
    expect(privateMsg).toMatchObject({ url: "/alerts/a1" });
    const [publicMsg] = messagesFor([{ id: "a2", memberId: "m", trial, watchNames: ["Family"], viaPrivateWatch: false }]);
    expect(publicMsg!.title).toContain("HIV vaccine study");
  });

  it("flags Alerts that came through a Private watch", async () => {
    const mum = as(app, env, `p4${n}@x`);
    const cond = `secret${n}`;
    const { json: w } = await mum<Watch>("/api/watches", "POST", watchBody(cond, { private: true }));
    expect(w.private).toBe(true);
    catalog[cond] = [study("NCT84000001")];
    const r = await checkAndPush(env, fetchJson, pushService().post);
    expect(r.newAlerts).toEqual([expect.objectContaining({ viaPrivateWatch: true })]);
  });
});
