import { describe, expect, it } from "vitest";
import type { Criteria, Profile } from "./api";
import { BAD_AGE, BAD_ZIP, NEEDS_NARROWING, criteriaLine, criteriaOf, criteriaRows, formError, formOf, narrows, newForm, normalizeCriteria, sameCriteria, storedCriteria, withDefaults, withProfile } from "./criteria";

const everything: Criteria = {
  conditions: ["Asthma", "Hay fever"],
  terms: ["ocrelizumab"],
  phases: ["PHASE1"],
  statuses: ["RECRUITING"],
  kinds: ["DRUG", "DEVICE"],
  near: { zip: "68508", miles: 100, lat: 40.8, lon: -96.7 },
  age: 34,
  sex: "FEMALE",
  healthy: true,
  clinics: ["celerion-lincoln", "altasciences-kc"],
};

const profile = (p: Partial<Profile>): Profile =>
  ({ birthYear: null, sex: null, zip: null, miles: null, conditions: [], healthyVolunteer: false, heightIn: null, weightLb: null, nicotine: null, lastDonationOn: null, ...p }) as Profile;

describe("Search criteria as stored", () => {
  it("reads a Watch saved before newer fields existed", () => {
    expect(storedCriteria('{"conditions":["MS"],"terms":[],"phases":[],"statuses":[]}')).toEqual(withDefaults({ conditions: ["MS"] }));
    expect(storedCriteria('{"conditions":["MS"]}').near).toBeNull();
  });

  it("calls two sets the same whatever order their fields are in", () => {
    const { conditions, near, ...rest } = everything;
    const reordered = { ...rest, near: { lon: near!.lon, lat: near!.lat, miles: near!.miles, zip: near!.zip }, conditions } as Criteria;
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(everything));
    expect(sameCriteria(reordered, everything)).toBe(true);
    expect(sameCriteria({ ...everything, age: 35 }, everything)).toBe(false);
    expect(sameCriteria({ ...everything, conditions: ["Hay fever", "Asthma"] }, everything)).toBe(false);
    expect(sameCriteria({ ...everything, near: { ...near!, miles: 50 } }, everything)).toBe(false);
  });

  it("treats a missing newer field as its default", () => {
    const { clinics: _clinics, ...older } = withDefaults({ conditions: ["MS"] });
    expect(sameCriteria(older as Criteria, withDefaults({ conditions: ["MS"] }))).toBe(true);
  });
});

describe("what narrows Search criteria", () => {
  const nothing = { conditions: [], terms: [], clinics: [], healthy: false, near: null };
  it("takes a word, a Clinic, or healthy volunteers with a ZIP code", () => {
    expect(narrows(nothing)).toBe(false);
    expect(narrows({ ...nothing, conditions: ["asthma"] })).toBe(true);
    expect(narrows({ ...nothing, terms: ["ocrelizumab"] })).toBe(true);
    expect(narrows({ ...nothing, clinics: ["celerion-lincoln"] })).toBe(true);
    expect(narrows({ ...nothing, healthy: true, near: { zip: "68508", miles: 50 } })).toBe(true);
  });
  it("does not take healthy volunteers anywhere, a ZIP code alone, or a word with nothing in it", () => {
    expect(narrows({ ...nothing, healthy: true })).toBe(false);
    expect(narrows({ ...nothing, near: { zip: "68508", miles: 50 } })).toBe(false);
    expect(narrows({ ...nothing, conditions: [" () "] })).toBe(false);
  });
});

describe("Search criteria in plain words", () => {
  it("gives every row for a Watch's own page", () => {
    expect(criteriaRows(everything)).toEqual([
      ["Conditions", "Asthma, Hay fever"],
      ["Keywords", "ocrelizumab"],
      ["Clinics", "Celerion, Lincoln, NE; Altasciences, Overland Park, KS"],
      ["Where", "Within 100 miles of 68508"],
      ["Who", "Healthy volunteers, age 34, female"],
      ["Kind of study", expect.stringContaining(";")],
      ["Phases", expect.any(String)],
      ["Status", expect.any(String)],
    ]);
  });

  it("leaves out rows with nothing to say, and says what empty means", () => {
    const rows = Object.fromEntries(criteriaRows(withDefaults({ conditions: ["MS"] })));
    expect(rows).toMatchObject({ Conditions: "MS", Where: "Anywhere", Who: "Anyone", "Kind of study": "Any", Phases: "Any" });
    expect(rows).not.toHaveProperty("Keywords");
    expect(rows).not.toHaveProperty("Clinics");
    expect(rows.Status!.split(", ").length).toBeGreaterThan(1);
  });

  it("puts a Watch on one line for the list", () => {
    expect(criteriaLine(everything)).toBe(
      "Asthma, Hay fever, ocrelizumab · Healthy volunteers, age 34, female within 100 miles of 68508 · At Celerion, Lincoln, NE; Altasciences, Overland Park, KS · Drug or device studies",
    );
    expect(criteriaLine(withDefaults({ conditions: ["MS"] }))).toBe("MS");
    expect(criteriaLine(withDefaults({ healthy: true, near: { zip: "02139", miles: 50, lat: 0, lon: 0 } }))).toBe("Healthy volunteers within 50 miles of 02139");
    expect(criteriaLine(withDefaults({ conditions: ["MS"], near: { zip: "02139", miles: 50, lat: 0, lon: 0 } }))).toBe("MS · Within 50 miles of 02139");
  });

  it("names the Clinics of a Watch that asks for nothing else", () => {
    expect(criteriaLine(withDefaults({ healthy: true, clinics: ["celerion-lincoln"] }))).toBe("Healthy volunteers · At Celerion, Lincoln, NE");
    expect(criteriaLine(withDefaults({ clinics: ["celerion-lincoln"], sex: "MALE" }))).toBe("Male · At Celerion, Lincoln, NE");
  });
});

describe("the editor's form", () => {
  it("starts a new Watch for healthy volunteers, recruiting or about to, 50 miles", () => {
    expect(newForm()).toEqual({ conditions: "", terms: "", phases: [], kinds: [], statuses: ["RECRUITING", "NOT_YET_RECRUITING"], zip: "", miles: 50, age: "", sex: "", healthy: true, clinics: [] });
    expect(newForm("celerion-lincoln").clinics).toEqual(["celerion-lincoln"]);
    expect(newForm("nowhere").clinics).toEqual([]);
    expect(newForm(null).clinics).toEqual([]);
  });

  it("gives back saved Search criteria unchanged, apart from the point the server looks up", () => {
    const { near, ...rest } = everything;
    const back = criteriaOf(formOf(everything));
    expect(back).toEqual({ ...rest, near: { zip: near!.zip, miles: near!.miles } });
    // Field order too: a Watch saved untouched must not look changed.
    expect(Object.keys(back)).toEqual(Object.keys(everything));
    const plain = withDefaults({ conditions: ["MS"] });
    expect(criteriaOf(formOf(plain))).toEqual(plain);
  });

  it("is accepted by the server as typed", () => {
    expect(normalizeCriteria(criteriaOf(formOf(everything)))).toEqual(criteriaOf(formOf(everything)));
  });

  it("splits typed lists on commas, semicolons and new lines", () => {
    expect(criteriaOf({ ...newForm(), conditions: " asthma, hay fever;eczema\n", terms: "ocrelizumab," })).toMatchObject({ conditions: ["asthma", "hay fever", "eczema"], terms: ["ocrelizumab"] });
  });

  it("leaves a half-typed ZIP code or age out, and refuses it on Save", () => {
    const typing = { ...newForm(), conditions: "asthma", zip: "685", age: "3x" };
    expect(criteriaOf(typing)).toMatchObject({ near: null, age: null });
    expect(formError(typing)).toBe(BAD_ZIP);
    expect(formError({ ...typing, zip: "" })).toBe(BAD_AGE);
    expect(formError({ ...typing, zip: " 68508 ", age: " 34 " })).toBeNull();
    expect(criteriaOf({ ...typing, zip: " 68508 ", age: " 34 " })).toMatchObject({ near: { zip: "68508", miles: 50 }, age: 34 });
  });

  it("holds age to the server's limit", () => {
    expect(criteriaOf({ ...newForm(), age: "120" }).age).toBe(120);
    expect(criteriaOf({ ...newForm(), age: "121" }).age).toBeNull();
    expect(formError({ ...newForm(), conditions: "asthma", age: "121" })).toBe(BAD_AGE);
    expect(normalizeCriteria({ conditions: ["asthma"], age: 121 })).toEqual({ error: BAD_AGE });
  });

  it("says what a Watch needs when nothing narrows it, in the server's words", () => {
    expect(formError(newForm())).toBe(NEEDS_NARROWING);
    expect(normalizeCriteria(criteriaOf(newForm()))).toEqual({ error: NEEDS_NARROWING });
    expect(formError({ ...newForm(), zip: "68508" })).toBeNull();
    expect(formError({ ...newForm(), healthy: false, zip: "68508" })).toBe(NEEDS_NARROWING);
  });

  it("fills in from a Profile", () => {
    const filled = withProfile(newForm(), profile({ zip: "68508", miles: null, birthYear: 1990, sex: "MALE", healthyVolunteer: false, conditions: ["Asthma", "Eczema"] }), 2026);
    expect(filled).toMatchObject({ zip: "68508", miles: 50, age: "36", sex: "MALE", healthy: false, conditions: "Asthma, Eczema" });
    expect(withProfile(newForm(), profile({ zip: "68508", miles: 100 }), 2026).miles).toBe(100);
  });

  it("keeps what is typed where the Profile says nothing, and conditions already typed", () => {
    const typed = { ...newForm(), zip: "02139", miles: 25, age: "40", sex: "FEMALE" as const, conditions: "migraine", terms: "x" };
    const filled = withProfile(typed, profile({ healthyVolunteer: true, conditions: ["Asthma"] }), 2026);
    expect(filled).toEqual({ ...typed, healthy: true });
  });
});
