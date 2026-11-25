import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLINICS } from "../../shared/clinics";
import { pageUrl } from "./read";
import { SOURCES } from "./sources";

/** The minutes of the hour a cron string's minute field fires on: "1-59/3", "3,9,15", "17", "*". */
function minutesOf(field: string): number[] {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const [range, step = "1"] = part.split("/");
    const [from, to] = range === "*" ? [0, 59] : range!.includes("-") ? range!.split("-").map(Number) : [Number(range), step === "1" ? Number(range) : 59];
    for (let m = from!; m <= to!; m += Number(step)) out.add(m);
  }
  return [...out];
}

describe("the sources that are read", () => {
  it("each has a reader, and each reader has a Clinic", () => {
    const wanted = [...new Set(CLINICS.map((c) => c.source).filter(Boolean))].sort();
    expect(SOURCES.map((s) => s.id).sort()).toEqual(wanted);
  });
  it("are fetched over https only", () => {
    for (const s of SOURCES) for (const page of s.pages) expect(pageUrl(page)).toMatch(/^https:\/\//);
  });
  it("never include a Clinic whose site turned a plain request away", () => {
    const hosts = SOURCES.flatMap((s) => s.pages).map((p) => new URL(pageUrl(p)).host);
    // Each answered a plain request with 403 or a challenge page on 2026-11-24. GuineaPing does not get round that.
    for (const no of ["iconstudies.com", "trialmed.com", "miamiresearch.com", "www.cc.nih.gov", "www.hopkinsmedicine.org"]) expect(hosts).not.toContain(no);
  });
  it("each get a turn every hour: there are at least as many runs an hour as sources", () => {
    const config = readFileSync(join(import.meta.dirname, "..", "..", "..", "wrangler.jsonc"), "utf8");
    const crons = JSON.parse(/"crons":\s*(\[[^\]]*\])/.exec(config)![1]!) as string[];
    // Every trigger but the hourly Check is a Clinic read (index.ts).
    const reads = crons.filter((c) => c !== "17 * * * *").flatMap((c) => minutesOf(c.split(" ")[0]!));
    expect(reads.length).toBeGreaterThanOrEqual(SOURCES.length);
  });
});
