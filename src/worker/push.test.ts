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

  /** Gives `who` a Past study whose waiting period ended on `day`, not yet told. */
  const waitEndedOn = async (who: ReturnType<typeof as>, day: string) => {
    const soon = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const made = await who<{ id: string }>("/api/past-studies", "POST", { label: "Secret study", endedOn: soon, waitDays: 0 });
    await env.DB.prepare("UPDATE past_studies SET free_on = ?, told_at = NULL WHERE id = ?").bind(day, made.json.id).run();
  };
  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const noteRows = (email: string) =>
    env.DB.prepare("SELECT n.announce, n.pushed_at FROM notes n JOIN members m ON m.id = n.member_id WHERE m.email = ?").bind(email).all<{ announce: number; pushed_at: string | null }>();

  it("pushes once when a waiting period ends, saying only that there is a note", async () => {
    const vol = as(app, env, `w1${n}@x`);
    await addDevice(vol, "wait");
    await waitEndedOn(vol, daysAgo(2));
    const first = pushService();
    await checkAndPush(env, fetchJson, first.post);
    expect(first.calls.filter((c) => c.url === endpoint("wait"))).toHaveLength(1);
    const second = pushService();
    await checkAndPush(env, fetchJson, second.post);
    expect(second.calls.filter((c) => c.url === endpoint("wait"))).toEqual([]);
    expect((await noteRows(`w1${n}@x`)).results).toEqual([{ announce: 1, pushed_at: expect.any(String) }]);

    const { NOTE_MESSAGE } = await import("./push");
    expect(JSON.stringify(NOTE_MESSAGE)).not.toMatch(/wait|stud|clinic|trial|Secret/i);
    expect(NOTE_MESSAGE.url).toBe("/alerts");
  });

  it("keeps a waiting-period Push apart from the Alerts it arrives with", async () => {
    const vol = as(app, env, `w2${n}@x`);
    const cond = `waitbusy${n}`;
    await vol("/api/watches", "POST", watchBody(cond));
    await addDevice(vol, "both");
    await waitEndedOn(vol, daysAgo(2));
    // Five Alerts make one summary Push; the note is one more, not a sixth Alert.
    catalog[cond] = ["1", "2", "3", "4", "5"].map((i) => study(`NCT8700000${i}`));
    const svc = pushService();
    expect((await checkAndPush(env, fetchJson, svc.post)).alertsCreated).toBe(5);
    expect(svc.calls.filter((c) => c.url === endpoint("both"))).toHaveLength(2);
  });

  it("tries a waiting-period Push again when no Device got it, and settles it for a Member with none", async () => {
    const vol = as(app, env, `w3${n}@x`);
    const none = as(app, env, `w4${n}@x`);
    await addDevice(vol, "down");
    await waitEndedOn(vol, daysAgo(2));
    await waitEndedOn(none, daysAgo(2));
    await checkAndPush(env, fetchJson, pushService(() => 503).post);
    expect((await noteRows(`w3${n}@x`)).results).toEqual([{ announce: 1, pushed_at: null }]);
    expect((await noteRows(`w4${n}@x`)).results).toEqual([{ announce: 1, pushed_at: expect.any(String) }]);
    const retry = pushService();
    await checkAndPush(env, fetchJson, retry.post);
    expect(retry.calls.filter((c) => c.url === endpoint("down"))).toHaveLength(1);
  });

  it("pushes no other kind of note", async () => {
    const owner = as(app, env, `w5${n}@x`);
    const follower = as(app, env, `w6${n}@x`);
    const { json: watch } = await owner<Watch>("/api/watches", "POST", watchBody(`quiet${n}`));
    await follower(`/api/watches/${watch.id}/follow`, "POST");
    await addDevice(follower, "quiet");
    // Deleting a Watch leaves its followers a note in their Alert list.
    await owner(`/api/watches/${watch.id}`, "DELETE");
    expect((await noteRows(`w6${n}@x`)).results).toEqual([{ announce: 0, pushed_at: null }]);
    const svc = pushService();
    await checkAndPush(env, fetchJson, svc.post);
    expect(svc.calls.filter((c) => c.url === endpoint("quiet"))).toEqual([]);
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
