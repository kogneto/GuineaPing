import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getPlatformProxy } from "wrangler";

const MIGRATIONS = join(import.meta.dirname, "..", "..", "migrations");

/** A fresh in-memory D1 with every migration applied. Localhost requests sign in via DEV_AUTH. */
export async function createWorkerEnv(): Promise<{ env: Env; dispose: () => Promise<void> }> {
  const proxy = await getPlatformProxy<Env>({ persist: false, envFiles: [] });
  const db = proxy.env.DB;
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    const statements = readFileSync(join(MIGRATIONS, file), "utf8")
      .replace(/--.*$/gm, "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const sql of statements) await db.prepare(sql).run();
  }
  const env: Env = { ...proxy.env, ACCESS_TEAM_DOMAIN: "", ACCESS_AUD: "", DEV_AUTH: "true" };
  return { env, dispose: () => proxy.dispose() };
}

type App = { request(url: string, init: RequestInit, env: Env): Response | Promise<Response> };

/** A requester signed in as `email` (via the localhost DEV_AUTH bypass). */
export function as(app: App, env: Env, email: string) {
  return async <T = unknown>(path: string, method = "GET", body?: unknown): Promise<{ status: number; json: T }> => {
    const headers: Record<string, string> = { "X-Dev-Email": email };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
      headers["Content-Type"] = "application/json";
    }
    const res = await app.request(`http://localhost${path}`, init, env);
    const text = await res.text();
    return { status: res.status, json: (text ? JSON.parse(text) : null) as T };
  };
}

/** A canned ClinicalTrials.gov study record. */
export function study(nctId: string, title = `Trial ${nctId}`, firstPosted = "2026-11-20") {
  return {
    protocolSection: {
      identificationModule: { nctId, briefTitle: title },
      statusModule: { overallStatus: "RECRUITING", studyFirstPostDateStruct: { date: firstPosted } },
      designModule: { phases: ["PHASE3"] },
    },
  };
}
