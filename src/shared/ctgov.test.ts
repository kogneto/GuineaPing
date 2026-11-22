import { describe, expect, it } from "vitest";
import type { Criteria, Trial } from "./api";
import { buildParams, findTrials, milesBetween, normalizeCriteria, quoteTerm, toTrial, withDefaults } from "./ctgov";
import { agesText, criteriaSections, keyFacts, kindShort, kindText, kindsWanted, phaseText } from "./plain";

const criteria = (c: Partial<Criteria>): Criteria => withDefaults(c);

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
    expect(normalizeCriteria({ conditions: ["  "], terms: [] })).toEqual({ error: "A Watch needs a condition or keyword, or healthy volunteers with a ZIP code" });
    // A volunteer with no condition: healthy-volunteer studies near a ZIP code, and nothing else.
    const open = normalizeCriteria({ conditions: [], healthy: true, near: { zip: "02139", miles: 50 } });
    expect(open).toMatchObject({ conditions: [], terms: [], healthy: true, near: { zip: "02139", miles: 50 } });
    const p = buildParams(criteria({ healthy: true, near: { zip: "02139", miles: 50, lat: 42.36, lon: -71.1 } }), "2026-11-19");
    expect(p["query.cond"]).toBeUndefined();
    expect(p["filter.advanced"]).toContain("AREA[HealthyVolunteers]true");
    expect(p["filter.geo"]).toBe("distance(42.36,-71.1,50mi)");
    expect(normalizeCriteria({ conditions: [], healthy: true })).toEqual({ error: "A Watch needs a condition or keyword, or healthy volunteers with a ZIP code" });
    expect(normalizeCriteria({ conditions: [], near: { zip: "02139", miles: 50 } })).toEqual({ error: "A Watch needs a condition or keyword, or healthy volunteers with a ZIP code" });
    expect(normalizeCriteria({ conditions: ["MS"], phases: ["PHASE9"] })).toEqual({ error: "Unknown phase PHASE9" });
    expect(normalizeCriteria({ conditions: [" MS ", "MS"], statuses: ["RECRUITING"] })).toEqual(criteria({ conditions: ["MS"], statuses: ["RECRUITING"] }));
  });
});

describe("kind of study", () => {
  const advanced = (c: Partial<Criteria>) => buildParams(criteria({ conditions: ["MS"], ...c }), "2026-11-19")["filter.advanced"];

  it("asks for any of the ticked kinds, counting intervention types only for interventional studies", () => {
    expect(advanced({ kinds: ["DRUG", "DEVICE"] })).toBe(
      "AREA[StudyFirstPostDate]RANGE[2026-11-19,MAX] AND (AREA[StudyType]INTERVENTIONAL AND AREA[InterventionType](DRUG OR DEVICE))",
    );
    expect(advanced({ kinds: ["OBSERVATIONAL"] })).toBe("AREA[StudyFirstPostDate]RANGE[2026-11-19,MAX] AND AREA[StudyType]OBSERVATIONAL");
    expect(advanced({ kinds: ["OBSERVATIONAL", "DRUG"] })).toBe(
      "AREA[StudyFirstPostDate]RANGE[2026-11-19,MAX] AND (AREA[StudyType]OBSERVATIONAL OR (AREA[StudyType]INTERVENTIONAL AND AREA[InterventionType](DRUG)))",
    );
  });

  it("asks for any kind when none is ticked, including on Watches saved before kinds existed", () => {
    const old = withDefaults({ conditions: ["MS"], terms: [], phases: [], statuses: [] });
    expect(old.kinds).toEqual([]);
    expect(buildParams(old, "2026-11-19")["filter.advanced"]).toBe("AREA[StudyFirstPostDate]RANGE[2026-11-19,MAX]");
  });

  it("keeps known kinds once each, refuses unknown ones, and doesn't let a kind alone narrow a Watch", () => {
    expect(normalizeCriteria({ conditions: ["MS"], kinds: ["DRUG", " DRUG "] })).toMatchObject({ kinds: ["DRUG"] });
    expect(normalizeCriteria({ conditions: ["MS"], kinds: ["PILL"] })).toEqual({ error: "Unknown kind of study PILL" });
    expect(normalizeCriteria({ conditions: [], kinds: ["DRUG"] })).toEqual({ error: "A Watch needs a condition or keyword, or healthy volunteers with a ZIP code" });
  });

  it("keeps each intervention type once, or only 'observational' for a study that gives nothing", () => {
    const listing = (designModule: object, interventions?: object[]) =>
      toTrial({ protocolSection: { identificationModule: { nctId: "NCT12345678" }, designModule, ...(interventions ? { armsInterventionsModule: { interventions } } : {}) } });
    expect(listing({ studyType: "INTERVENTIONAL" }, [{ type: "DRUG" }, { type: "PROCEDURE" }, { type: "DRUG" }])?.kinds).toEqual(["DRUG", "PROCEDURE"]);
    expect(listing({ studyType: "OBSERVATIONAL" }, [{ type: "DEVICE" }])?.kinds).toEqual(["OBSERVATIONAL"]);
    expect(listing({ studyType: "INTERVENTIONAL" })).not.toHaveProperty("kinds");
  });

  it("says what kind of study it is in plain words", () => {
    expect(kindShort(["DRUG"])).toBe("Drug study");
    expect(kindShort(["PROCEDURE", "DRUG"])).toBe("Drug and procedure study");
    expect(kindShort(["BEHAVIORAL", "DRUG", "RADIATION"])).toBe("Drug, behavioural and more");
    expect(kindShort(["DEVICE", "OTHER"])).toBe("Device study");
    expect(kindShort(["OTHER"])).toBe("Other kind of study");
    expect(kindShort(["OBSERVATIONAL"])).toBe("Observation only");
    expect(kindShort(undefined)).toBeNull();
    expect(kindText(["PROCEDURE", "DRUG"])).toBe("Tests a drug; Involves a procedure");
    expect(kindText(["OBSERVATIONAL"])).toBe("Observation only: nothing is given to you");
    expect(kindText(["SOMETHING_NEW"])).toBe("Something new");
    expect(kindsWanted(["DEVICE", "DRUG"])).toBe("Drug or device studies");
    expect(kindsWanted([])).toBeNull();
  });

  it("puts the kind in a Trial's line of facts, and shows older Trials without one as before", () => {
    const trial: Trial = {
      nctId: "NCT12345678", title: "", summary: "", firstPosted: "", status: "RECRUITING", phases: ["NA"], conditions: [], sponsor: "",
      minimumAge: "18 Years", maximumAge: "", locations: [], url: "",
    };
    expect(keyFacts(trial)).toEqual(["Recruiting now", "No phase (phases are mainly for drug trials)", "Ages 18 and up"]);
    // A drug study with no phase shouldn't also say "no phase": the kind says more, in fewer words.
    expect(keyFacts({ ...trial, kinds: ["DRUG"] })).toEqual(["Recruiting now", "Drug study", "Ages 18 and up"]);
    expect(keyFacts({ ...trial, phases: ["PHASE1"], kinds: ["DRUG"] })).toEqual(["Recruiting now", "Drug study", "Phase 1 (first tests of safety and dose in a small group)", "Ages 18 and up"]);
  });
});

describe("where and who", () => {
  it("asks for trials near a point, open to an age and sex, the way the live API understands", () => {
    const p = buildParams(criteria({ conditions: ["MS"], near: { zip: "02139", miles: 25, lat: 42.36, lon: -71.1 }, age: 45, sex: "FEMALE" }), "2026-11-19");
    expect(p["filter.geo"]).toBe("distance(42.36,-71.1,25mi)");
    expect(p["filter.advanced"]).toBe(
      "AREA[StudyFirstPostDate]RANGE[2026-11-19,MAX]" +
        " AND (AREA[MinimumAge]RANGE[MIN, 45 years] OR NOT AREA[MinimumAge]RANGE[MIN, MAX])" +
        " AND (AREA[MaximumAge]RANGE[45 years, MAX] OR NOT AREA[MaximumAge]RANGE[MIN, MAX])" +
        " AND NOT AREA[Sex]MALE",
    );
    expect(buildParams(criteria({ conditions: ["x"], sex: "MALE" }), "2026-11-19")["filter.advanced"]).toContain("NOT AREA[Sex]FEMALE");
    expect(buildParams(criteria({ conditions: ["x"] }), "2026-11-19")["filter.geo"]).toBeUndefined();
    expect(buildParams(criteria({ conditions: ["x"], healthy: true }), "2026-11-19")["filter.advanced"]).toContain("AREA[HealthyVolunteers]true");
    expect(normalizeCriteria({ conditions: ["x"], healthy: true })).toMatchObject({ healthy: true });
  });

  it("validates ZIP codes, distances, ages and sexes", () => {
    const ok = normalizeCriteria({ conditions: ["MS"], near: { zip: " 02139 ", miles: 50 }, age: "45", sex: "MALE" });
    expect(ok).toMatchObject({ near: { zip: "02139", miles: 50 }, age: 45, sex: "MALE" });
    expect(normalizeCriteria({ conditions: ["MS"], near: { zip: "2139", miles: 50 } })).toEqual({ error: "Enter a 5-digit US ZIP code" });
    expect(normalizeCriteria({ conditions: ["MS"], near: { zip: "02139", miles: 7 } })).toEqual({ error: "Pick one of the distances offered" });
    expect(normalizeCriteria({ conditions: ["MS"], age: 4.5 })).toEqual({ error: "Enter an age in whole years, 0 to 120" });
    expect(normalizeCriteria({ conditions: ["MS"], sex: "ALL" })).toEqual({ error: "Unknown sex ALL" });
  });

  it("works out the nearest site to the Watch's ZIP code", () => {
    const near = { zip: "02139", miles: 50, lat: 42.3646, lon: -71.1028 };
    const t = toTrial(
      {
        protocolSection: {
          identificationModule: { nctId: "NCT12345678" },
          contactsLocationsModule: {
            locations: [
              { city: "Worcester", state: "Massachusetts", geoPoint: { lat: 42.2626, lon: -71.8023 } },
              { city: "Boston", state: "Massachusetts", geoPoint: { lat: 42.3584, lon: -71.0598 } },
              { city: "Nowhere", state: "Massachusetts" },
            ],
          },
        },
      },
      near,
    );
    expect(t?.nearest).toEqual({ place: "Boston, Massachusetts", miles: 2 });
    // Cambridge, MA to New York City is about 190 miles as the crow flies.
    expect(milesBetween({ lat: 42.3646, lon: -71.1028 }, { lat: 40.7128, lon: -74.006 })).toBeGreaterThan(185);
    expect(milesBetween({ lat: 42.3646, lon: -71.1028 }, { lat: 40.7128, lon: -74.006 })).toBeLessThan(195);
  });

  it("keeps older Watches working when new criteria fields are missing", () => {
    expect(withDefaults({ conditions: ["MS"], terms: [], phases: [], statuses: [] })).toMatchObject({ near: null, age: null, sex: null });
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

  it("splits a study's criteria into can-join and can't-join lists, in its own words", () => {
    const text =
      "Inclusion Criteria:\n\n* 18 years old and older\n* MFIS score\\>45,\n* Signed consent\n  spanning two lines.\n\nExclusion Criteria:\n\n* Patients with serious unstable disease :\n\n  * recurrent relapses\n  * rapidly ongoing disability\n* Pregnancy";
    expect(criteriaSections(text)).toEqual([
      { kind: "include", items: ["18 years old and older", "MFIS score>45", "Signed consent spanning two lines."] },
      { kind: "exclude", items: ["Patients with serious unstable disease: recurrent relapses; rapidly ongoing disability", "Pregnancy"] },
    ]);
    expect(criteriaSections("Adults with asthma.\nNo smokers.")).toEqual([{ kind: "other", items: ["Adults with asthma.", "No smokers."] }]);
    expect(criteriaSections("")).toEqual([]);
  });
});
