import { describe, expect, it } from "vitest";
import { KINDS, type Criteria, type Trial } from "./api";
import { CLINICS, clinicsFilter, clinicsNamedBy } from "./clinics";
import { normalizeCriteria, withDefaults } from "./criteria";
import { buildParams, everyMatch, findMatches, findTrials, milesBetween, quoteTerm, toTrial } from "./ctgov";
import { agesText, criteriaSections, keyFacts, kindFact, kindLabel, kindsAsked, kindsText, phaseText } from "./plain";

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

  it("can ask by the day a listing last changed, newest change first", () => {
    const p = buildParams(criteria({ conditions: ["MS"] }), "2026-11-19", "updated");
    expect(p["filter.advanced"]).toBe("AREA[LastUpdatePostDate]RANGE[2026-11-19,MAX]");
    expect(p.sort).toBe("LastUpdatePostDate:desc");
    expect(buildParams(criteria({ conditions: ["MS"] }), "2026-11-19").sort).toBe("StudyFirstPostDate:desc");
  });

  it("lists every Trial a Watch matches today in one request, or says there are too many", async () => {
    const urls: string[] = [];
    const ids = await everyMatch(criteria({ conditions: ["MS"] }), async (url) => {
      urls.push(url);
      return { studies: [{ protocolSection: { identificationModule: { nctId: "NCT00000001" } } }, { protocolSection: { identificationModule: { nctId: "junk" } } }] };
    });
    expect(ids).toEqual(["NCT00000001"]);
    const sent = new URL(urls[0]!).searchParams;
    expect(sent.get("filter.advanced")).toBe("AREA[LastUpdatePostDate]RANGE[MIN,MAX]");
    expect(sent.get("pageSize")).toBe("1000");
    expect(sent.get("fields")).toBe("NCTId");
    expect(await everyMatch(criteria({ conditions: ["cancer"] }), async () => ({ studies: [], nextPageToken: "more" }))).toBeNull();
  });

  it("defaults to every status someone could still join", () => {
    expect(buildParams(criteria({ terms: ["ocrelizumab"] }), "2026-11-01")["filter.overallStatus"]).toBe(
      "RECRUITING,NOT_YET_RECRUITING,ENROLLING_BY_INVITATION",
    );
  });

  it("refuses a Watch that would match every Trial, and unknown enums", () => {
    expect(normalizeCriteria({ conditions: ["  "], terms: [] })).toEqual({ error: "A Watch needs a condition, a keyword or a Clinic, or healthy volunteers with a ZIP code" });
    // A volunteer with no condition: healthy-volunteer studies near a ZIP code, and nothing else.
    const open = normalizeCriteria({ conditions: [], healthy: true, near: { zip: "02139", miles: 50 } });
    expect(open).toMatchObject({ conditions: [], terms: [], healthy: true, near: { zip: "02139", miles: 50 } });
    const p = buildParams(criteria({ healthy: true, near: { zip: "02139", miles: 50, lat: 42.36, lon: -71.1 } }), "2026-11-19");
    expect(p["query.cond"]).toBeUndefined();
    expect(p["filter.advanced"]).toContain("AREA[HealthyVolunteers]true");
    expect(p["filter.geo"]).toBe("distance(42.36,-71.1,50mi)");
    expect(normalizeCriteria({ conditions: [], healthy: true })).toEqual({ error: "A Watch needs a condition, a keyword or a Clinic, or healthy volunteers with a ZIP code" });
    expect(normalizeCriteria({ conditions: [], near: { zip: "02139", miles: 50 } })).toEqual({ error: "A Watch needs a condition, a keyword or a Clinic, or healthy volunteers with a ZIP code" });
    expect(normalizeCriteria({ conditions: ["MS"], phases: ["PHASE9"] })).toEqual({ error: "Unknown phase PHASE9" });
    expect(normalizeCriteria({ conditions: [" MS ", "MS"], statuses: ["RECRUITING"] })).toEqual(criteria({ conditions: ["MS"], statuses: ["RECRUITING"] }));
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
    expect(normalizeCriteria({ conditions: ["MS"], near: { zip: "2139", miles: 50 } })).toEqual({ error: "Enter a 5-digit US ZIP code, or leave it empty for anywhere" });
    expect(normalizeCriteria({ conditions: ["MS"], near: { zip: "02139", miles: 7 } })).toEqual({ error: "Pick one of the distances offered" });
    expect(normalizeCriteria({ conditions: ["MS"], age: 4.5 })).toEqual({ error: "Enter an age in whole years, 0 to 120, or leave it empty" });
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

  it("hands back each match with its sites and their map points", async () => {
    const page = {
      studies: [
        {
          protocolSection: {
            identificationModule: { nctId: "NCT00000009" },
            contactsLocationsModule: { locations: [{ city: "Boston", state: "Massachusetts", country: "United States", geoPoint: { lat: 42.36, lon: -71.06 } }, { city: "Nowhere", country: "United States" }] },
          },
        },
        { protocolSection: { identificationModule: { nctId: "bad" } } },
      ],
    };
    const matches = await findMatches(criteria({ conditions: ["MS"] }), "2026-11-01", async () => page);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.trial.nctId).toBe("NCT00000009");
    // Only sites with a map point can be measured from.
    expect(matches[0]!.sites).toEqual([{ place: "Boston, Massachusetts, United States", short: "Boston, Massachusetts", lat: 42.36, lon: -71.06 }]);
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

describe("Clinics", () => {
  it("asks for a site whose name and city are the Clinic's, joined with OR for several", () => {
    expect(clinicsFilter([])).toBeNull();
    expect(clinicsFilter(["celerion-lincoln"])).toBe('SEARCH[Location](AREA[LocationFacility]("Celerion") AND AREA[LocationCity]("Lincoln"))');
    expect(clinicsFilter(["fortrea-madison", "qps-miami", "nope"])).toBe(
      '(SEARCH[Location](AREA[LocationFacility]("Fortrea" OR "Covance" OR "Labcorp") AND AREA[LocationCity]("Madison")) OR SEARCH[Location](AREA[LocationFacility]("QPS" OR "Quest Pharmaceutical Services") AND AREA[LocationCity]("South Miami" OR "Miami")))',
    );
    const p = buildParams(criteria({ clinics: ["celerion-lincoln"], healthy: true }), "2026-11-01");
    expect(p["filter.advanced"]).toBe('AREA[StudyFirstPostDate]RANGE[2026-11-01,MAX] AND AREA[HealthyVolunteers]true AND SEARCH[Location](AREA[LocationFacility]("Celerion") AND AREA[LocationCity]("Lincoln"))');
  });

  it("lets a Clinic be all a Watch asks for, and refuses one it doesn't know or too many", () => {
    expect(normalizeCriteria({ clinics: ["celerion-lincoln", "celerion-lincoln"] })).toMatchObject({ clinics: ["celerion-lincoln"], conditions: [] });
    expect(normalizeCriteria({ clinics: ["somewhere"] })).toEqual({ error: "Unknown Clinic somewhere" });
    expect(normalizeCriteria({ clinics: CLINICS.slice(0, 11).map((c) => c.id) })).toEqual({ error: "A Watch can name at most 10 Clinics" });
    expect(withDefaults({ conditions: ["MS"] }).clinics).toEqual([]);
  });

  it("recognises a Clinic in the many ways listings spell it, in its own city only", () => {
    expect(clinicsNamedBy([{ facility: "Celerion ( Site 0001)", city: "Lincoln" }])).toEqual(["celerion-lincoln"]);
    expect(clinicsNamedBy([{ facility: "celerion, inc.", city: "Tempe" }])).toEqual(["celerion-tempe"]);
    expect(clinicsNamedBy([{ facility: "Covance Clinical Research Unit 3402 Kinsman Blvd", city: "Madison" }])).toEqual(["fortrea-madison"]);
    expect(clinicsNamedBy([{ facility: "QPS-MRA, LLC-Early Phase", city: "Miami" }])).toEqual(["qps-miami"]);
    // A whole word: "ICON" is not in "Silicon"; and a name alone, in another city, is not the Clinic.
    expect(clinicsNamedBy([{ facility: "Silicon Valley Research", city: "Lenexa" }])).toEqual([]);
    expect(clinicsNamedBy([{ facility: "Celerion", city: "Belfast" }, { facility: "Research Site", city: "Lincoln" }, { city: "Lincoln" }])).toEqual([]);
  });

  it("recognises AbbVie's unit by the short name most listings give it", () => {
    // The three spellings ClinicalTrials.gov had for it in Grayslake on 2026-11-24.
    expect(clinicsNamedBy([{ facility: "Acpru /Id# 282128", city: "Grayslake" }])).toEqual(["abbvie-grayslake"]);
    expect(clinicsNamedBy([{ facility: "AbbVie Clinical Pharmacology Research Unit (ACPRU)", city: "Grayslake" }])).toEqual(["abbvie-grayslake"]);
    expect(clinicsNamedBy([{ facility: "Abbvie Clinical Pharmacology Research Unit /ID# 163866", city: "Grayslake" }])).toEqual(["abbvie-grayslake"]);
    // Another site in the same town is not the Clinic, and nor is AbbVie's name in another town.
    expect(clinicsNamedBy([{ facility: "Northwestern Medicine Grayslake Outpatient Center", city: "Grayslake" }])).toEqual([]);
    expect(clinicsNamedBy([{ facility: "AbbVie Inc. /ID# 123456", city: "North Chicago" }])).toEqual([]);
  });

  it("names the Clinics on a Trial without changing its places", () => {
    const t = toTrial({
      protocolSection: {
        identificationModule: { nctId: "NCT12345678" },
        contactsLocationsModule: { locations: [{ facility: "Celerion", city: "Lincoln", state: "Nebraska", country: "United States" }, { facility: "Celerion", city: "Tempe", state: "Arizona", country: "United States" }] },
      },
    });
    expect(t?.clinics).toEqual(["celerion-lincoln", "celerion-tempe"]);
    expect(t?.locations).toEqual(["Lincoln, Nebraska, United States", "Tempe, Arizona, United States"]);
    expect(toTrial({ protocolSection: { identificationModule: { nctId: "NCT12345678" } } })).not.toHaveProperty("clinics");
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

describe("kind of study", () => {
  const SINCE = "AREA[StudyFirstPostDate]RANGE[2026-11-19,MAX]";
  const filterFor = (c: Partial<Criteria>) => buildParams(criteria({ conditions: ["MS"], ...c }), "2026-11-19")["filter.advanced"];
  /** A study record as ClinicalTrials.gov sends it, with only the parts that say what kind it is. */
  const listing = (studyType: string | undefined, ...types: string[]) => ({
    protocolSection: {
      identificationModule: { nctId: "NCT12345678" },
      designModule: studyType ? { studyType } : {},
      ...(types.length ? { armsInterventionsModule: { interventions: types.map((type) => ({ type })) } } : {}),
    },
  });

  it("leaves the query alone when a Watch takes any kind, as every Watch saved before kinds did", () => {
    expect(filterFor({ kinds: [] })).toBe(SINCE);
    const savedBefore = withDefaults({ conditions: ["MS"], terms: [], phases: [], statuses: [], near: null, age: null, sex: null, healthy: false });
    expect(savedBefore.kinds).toEqual([]);
    expect(buildParams(savedBefore, "2026-11-19")["filter.advanced"]).toBe(SINCE);
  });

  it("asks for interventional studies of any ticked type", () => {
    expect(filterFor({ kinds: ["DRUG"] })).toBe(`${SINCE} AND (AREA[StudyType]INTERVENTIONAL AND AREA[InterventionType](DRUG))`);
    expect(filterFor({ kinds: ["DEVICE", "DIETARY_SUPPLEMENT"] })).toBe(
      `${SINCE} AND (AREA[StudyType]INTERVENTIONAL AND AREA[InterventionType](DEVICE OR DIETARY_SUPPLEMENT))`,
    );
  });

  it("asks for observational studies by study type, alone or alongside the ticked types", () => {
    expect(filterFor({ kinds: ["OBSERVATIONAL"] })).toBe(`${SINCE} AND AREA[StudyType]OBSERVATIONAL`);
    expect(filterFor({ kinds: ["DRUG", "OBSERVATIONAL", "DEVICE"] })).toBe(
      `${SINCE} AND (AREA[StudyType]OBSERVATIONAL OR (AREA[StudyType]INTERVENTIONAL AND AREA[InterventionType](DRUG OR DEVICE)))`,
    );
  });

  it("narrows by kind together with phase and who can join", () => {
    expect(filterFor({ kinds: ["DRUG"], phases: ["PHASE1"], healthy: true })).toBe(
      `${SINCE} AND AREA[Phase](PHASE1) AND (AREA[StudyType]INTERVENTIONAL AND AREA[InterventionType](DRUG)) AND AREA[HealthyVolunteers]true`,
    );
  });

  it("accepts every kind the Watch form offers, once each, and nothing else", () => {
    expect(normalizeCriteria({ conditions: ["MS"], kinds: [...KINDS, "DRUG"] })).toMatchObject({ kinds: [...KINDS] });
    expect(normalizeCriteria({ conditions: ["MS"] })).toMatchObject({ kinds: [] });
    // RADIATION is a real type, but not one a Watch may ask for.
    expect(normalizeCriteria({ conditions: ["MS"], kinds: ["RADIATION"] })).toEqual({ error: "Unknown kind of study RADIATION" });
    expect(normalizeCriteria({ conditions: ["MS"], kinds: ["drug) OR AREA[Phase](NA"] })).toHaveProperty("error");
  });

  it("still needs words or a place: a kind alone would match far too much", () => {
    expect(normalizeCriteria({ conditions: [], kinds: ["DRUG"] })).toEqual({ error: "A Watch needs a condition, a keyword or a Clinic, or healthy volunteers with a ZIP code" });
  });

  it("reads a Trial's kinds from its listing", () => {
    expect(toTrial(listing("INTERVENTIONAL", "DRUG", "OTHER", "DRUG", "PROCEDURE"))?.kinds).toEqual(["DRUG", "OTHER", "PROCEDURE"]);
    // An observational study is only that, even when its listing names something like a device.
    expect(toTrial(listing("OBSERVATIONAL", "DEVICE"))?.kinds).toEqual(["OBSERVATIONAL"]);
    expect(toTrial(listing("OBSERVATIONAL"))?.kinds).toEqual(["OBSERVATIONAL"]);
  });

  it("gives a Trial no kinds at all when its listing names none", () => {
    expect(toTrial(listing("INTERVENTIONAL"))).not.toHaveProperty("kinds");
    expect(toTrial(listing(undefined))).not.toHaveProperty("kinds");
  });

  it("names each kind in plain words, and a kind it has never heard of by its own name", () => {
    expect(kindLabel("DRUG")).toBe("Tests a drug");
    expect(kindLabel("OBSERVATIONAL")).toBe("Observation only: nothing is given to you");
    expect(kindLabel("LIGHT_THERAPY")).toBe("Light therapy");
    for (const kind of KINDS) expect(kindLabel(kind)).not.toMatch(/[A-Z]{2}|_/);
  });

  it("lists all of a Trial's kinds on its Alert page, in the same order every time", () => {
    expect(kindsText(["PROCEDURE", "OTHER", "DRUG"])).toBe("Tests a drug; Involves a procedure; Something else: see the listing");
    expect(kindsText(["OBSERVATIONAL"])).toBe("Observation only: nothing is given to you");
    expect(kindsText([])).toBeNull();
    expect(kindsText(undefined)).toBeNull();
  });

  it("keeps the kind short enough for the line of facts", () => {
    expect(kindFact(["DEVICE"])).toBe("Device study");
    expect(kindFact(["BEHAVIORAL", "DRUG"])).toBe("Drug + behavioural study");
    expect(kindFact(["DEVICE", "BIOLOGICAL"])).toBe("Vaccine or biological + device study");
    expect(kindFact(["RADIATION", "PROCEDURE", "DRUG", "DEVICE"])).toBe("Drug + device + more");
    expect(kindFact(["OBSERVATIONAL"])).toBe("Observation only");
    expect(kindFact(["LIGHT_THERAPY"])).toBe("Light therapy study");
    // "Other" says nothing a volunteer can use.
    expect(kindFact(["OTHER", "DIETARY_SUPPLEMENT"])).toBe("Supplement study");
    expect(kindFact(["OTHER"])).toBeNull();
    expect(kindFact(undefined)).toBeNull();
  });

  it("says in one phrase which kinds a Watch asks for", () => {
    expect(kindsAsked(["DRUG"])).toBe("Drug studies");
    expect(kindsAsked(["OBSERVATIONAL", "DRUG"])).toBe("Drug or observational studies");
    expect(kindsAsked(["OBSERVATIONAL", "DEVICE", "DRUG"])).toBe("Drug, device or observational studies");
    expect(kindsAsked([])).toBeNull();
  });

  describe("in a Trial's line of facts", () => {
    const trial = (extra: Partial<Trial>): Trial => ({
      nctId: "NCT12345678", title: "T", summary: "", firstPosted: "2026-11-20", status: "RECRUITING", phases: [], conditions: [], sponsor: "",
      minimumAge: "18 Years", maximumAge: "65 Years", locations: [], url: "", ...extra,
    });

    it("comes after the status and before the phase", () => {
      expect(keyFacts(trial({ kinds: ["DRUG"], phases: ["PHASE1"] }))).toEqual([
        "Recruiting now", "Drug study", "Phase 1 (first tests of safety and dose in a small group)", "Ages 18–65",
      ]);
      expect(keyFacts(trial({ kinds: ["OBSERVATIONAL"] }))).toEqual(["Recruiting now", "Observation only", "Ages 18–65"]);
    });

    it("stands in for 'no phase', which is only said when there is no kind to show", () => {
      expect(keyFacts(trial({ kinds: ["DRUG"], phases: ["NA"] }))).toEqual(["Recruiting now", "Drug study", "Ages 18–65"]);
      expect(keyFacts(trial({ kinds: ["OTHER"], phases: ["NA"] }))).toEqual(["Recruiting now", "No phase (not every study is run in phases)", "Ages 18–65"]);
    });

    it("is absent for a Trial stored before kinds were kept, whose other facts read as they did", () => {
      expect(keyFacts(trial({ phases: ["PHASE2"] }))).toEqual(["Recruiting now", "Phase 2 (testing whether it works and is safe in a larger group)", "Ages 18–65"]);
    });
  });
});
