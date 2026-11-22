import { describe, expect, it } from "vitest";
import type { Criteria } from "./api";
import { buildParams, findTrials, normalizeCriteria, quoteTerm, toTrial } from "./ctgov";
import { agesText, phaseText } from "./plain";

const criteria = (c: Partial<Criteria>): Criteria => ({ conditions: [], terms: [], phases: [], statuses: [], ...c });

describe("query building", () => {
  it("quotes each term and strips characters that would change the query", () => {
    expect(quoteTerm("Multiple Sclerosis (MS)")).toBe('"Multiple Sclerosis MS"');
    expect(quoteTerm('crohn"s')).toBe('"crohn s"');
    expect(quoteTerm(" () ")).toBeNull();
  });

  it("ORs terms, filters by first-posted date, phase and status", () => {
    const p = buildParams(criteria({ conditions: ["MS", "multiple sclerosis"], phases: ["PHASE2", "PHASE3"], statuses: ["RECRUITING"] }), "2026-11-19");
    expect(p["query.cond"]).toBe('"MS" OR "multiple sclerosis"');
    expect(p["filter.advanced"]).toBe("AREA[StudyFirstPostDate]RANGE[2026-11-19,MAX] AND AREA[Phase](PHASE2 OR PHASE3)");
    expect(p["filter.overallStatus"]).toBe("RECRUITING");
    expect(p["query.term"]).toBeUndefined();
  });

  it("defaults to every status someone could still join", () => {
    expect(buildParams(criteria({ terms: ["ocrelizumab"] }), "2026-11-01")["filter.overallStatus"]).toBe(
      "RECRUITING,NOT_YET_RECRUITING,ENROLLING_BY_INVITATION",
    );
  });

  it("refuses a Watch that would match every Trial, and unknown enums", () => {
    expect(normalizeCriteria({ conditions: ["  "], terms: [] })).toEqual({ error: "A Watch needs at least one condition or keyword" });
    expect(normalizeCriteria({ conditions: ["MS"], phases: ["PHASE9"] })).toEqual({ error: "Unknown phase PHASE9" });
    expect(normalizeCriteria({ conditions: [" MS ", "MS"], statuses: ["RECRUITING"] })).toEqual(criteria({ conditions: ["MS"], statuses: ["RECRUITING"] }));
  });
});

describe("fetching", () => {
  it("follows page tokens up to the page limit", async () => {
    const urls: string[] = [];
    const pages = [
      { studies: [{ protocolSection: { identificationModule: { nctId: "NCT00000001" } } }], nextPageToken: "t2" },
      { studies: [{ protocolSection: { identificationModule: { nctId: "NCT00000002" } } }], nextPageToken: "t3" },
      { studies: [{ protocolSection: { identificationModule: { nctId: "NCT00000003" } } }] },
    ];
    const trials = await findTrials(criteria({ conditions: ["MS"] }), "2026-11-01", async (url) => (urls.push(url), pages[urls.length - 1]), { maxPages: 2 });
    expect(trials.map((t) => t.nctId)).toEqual(["NCT00000001", "NCT00000002"]);
    expect(new URL(urls[1]!).searchParams.get("pageToken")).toBe("t2");
  });

  it("drops records without a valid NCT ID and de-duplicates sites", () => {
    expect(toTrial({ protocolSection: { identificationModule: { nctId: "nope" } } })).toBeNull();
    const t = toTrial({
      protocolSection: {
        identificationModule: { nctId: "NCT12345678" },
        contactsLocationsModule: { locations: [{ city: "Boston", state: "Massachusetts", country: "United States" }, { city: "Boston", state: "Massachusetts", country: "United States" }] },
      },
    });
    expect(t?.locations).toEqual(["Boston, Massachusetts, United States"]);
    expect(t?.url).toBe("https://clinicaltrials.gov/study/NCT12345678");
  });
});

describe("plain language", () => {
  it("explains phases", () => {
    expect(phaseText(["PHASE3"])).toBe("Phase 3 (comparing it against the usual treatment in many people)");
    expect(phaseText(["PHASE1", "PHASE2"])).toBe("Phase 1/2 (combines steps, up to testing whether it works and is safe in a larger group)");
    expect(phaseText([])).toBeNull();
  });

  it("writes ages the way people say them", () => {
    expect(agesText("18 Years", "55 Years")).toBe("Ages 18–55");
    expect(agesText("6 Months", "")).toBe("Ages 6 months and up");
    expect(agesText("", "")).toBeNull();
  });
});
