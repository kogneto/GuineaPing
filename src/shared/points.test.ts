import { describe, expect, it } from "vitest";
import type { Profile } from "./api";
import { forList, toTrial } from "./ctgov";
import { keyFacts } from "./plain";
import { bmiOf, factFor, pointsToCheck, topicsOf } from "./points";
import type { PastStudy } from "./waiting";

const profile = (p: Partial<Profile> = {}): Profile => ({ birthYear: null, sex: null, zip: null, miles: null, healthyVolunteer: true, conditions: [], heightIn: null, weightLb: null, nicotine: null, lastDonationOn: null, ...p });
const past = (endedOn: string, lastDoseOn: string | null = null): PastStudy => ({ id: endedOn, label: "", endedOn, lastDoseOn, waitDays: 30, freeOn: endedOn });

// Lines as real listings word them (NCT07618715, NCT07501039, NCT07882472 and others).
const TEXT = `Inclusion Criteria:

1. Healthy adults aged 18 to 55 years.
2. Body weight ≥ 50 kg for male and ≥ 45 kg for female, body mass index (BMI) within the range of 19 - 28 kg/m2 (including both ends).
3. Able to give informed consent.

Exclusion Criteria:

1. Smokers or those who cannot comply with the prohibition of smoking during the trial, or positive for cotinine screening;
2. Donation or loss of blood equal to or in excess of 400 mL within 3 months prior to screening;
3. Received an investigational drug within 30 days of Screening or 5 drug half-lives, whichever is longer.
4. History of hepatic or renal disease.
5. Recent weight loss.`;

describe("Points to check", () => {
  it("finds the lines about BMI, weight, nicotine, donation and other studies, and leaves the rest", () => {
    const points = pointsToCheck(TEXT);
    expect(points.map((p) => [p.kind, p.topics])).toEqual([
      ["include", ["bmi", "weight"]],
      ["exclude", ["nicotine"]],
      ["exclude", ["donation"]],
      ["exclude", ["study"]],
    ]);
    // The Trial's own words, unchanged.
    expect(points[0]!.line).toBe("Body weight ≥ 50 kg for male and ≥ 45 kg for female, body mass index (BMI) within the range of 19 - 28 kg/m2 (including both ends).");
    expect(pointsToCheck("")).toEqual([]);
  });

  it("knows each topic by the ways listings word it", () => {
    expect(topicsOf("Body Mass Index between 18.5 and 32")).toEqual(["bmi"]);
    expect(topicsOf("Weighs at least 110 lbs")).toEqual(["weight"]);
    expect(topicsOf("Use of tobacco or vaping products in the last 6 months")).toEqual(["nicotine"]);
    expect(topicsOf("Has donated plasma within 7 days")).toEqual(["donation"]);
    expect(topicsOf("Participation in another clinical trial within 30 days")).toEqual(["study"]);
    expect(topicsOf("Participated in any other interventional study in the last 3 months")).toEqual(["study"]);
    // Not a weight to compare: a dose, and weight with no number.
    expect(topicsOf("Dose of 5 mg/kg given once")).toEqual([]);
    expect(topicsOf("Unexplained weight loss")).toEqual([]);
    expect(topicsOf("Evaporation of the sample")).toEqual([]);
  });

  it("states the Member's own fact, and nothing about whether it fits", () => {
    const me = profile({ heightIn: 69, weightLb: 165, nicotine: "no", lastDonationOn: "2026-10-12" });
    const today = "2026-11-22";
    expect(bmiOf(69, 165)).toBe(24.4);
    expect(factFor("bmi", me, [], today)).toEqual({ topic: "bmi", text: "Your BMI: 24.4", missing: false });
    expect(factFor("weight", me, [], today).text).toBe("Your weight: 165 lb (74.8 kg)");
    expect(factFor("nicotine", me, [], today).text).toBe("You said you don't use nicotine");
    expect(factFor("nicotine", profile({ nicotine: "yes" }), [], today).text).toBe("You said you use nicotine");
    expect(factFor("donation", me, [], today).text).toBe("Your last donation: October 12, 2026, 41 days ago");
    expect(factFor("study", me, [past("2026-09-01"), past("2026-11-13", "2026-11-10")], today).text).toBe("Your last study ended November 13, 2026, 9 days ago; your last dose was November 10, 2026, 12 days ago");
  });

  it("asks for the fact when the Profile has none: the Point to check is still there", () => {
    const empty = profile();
    for (const topic of ["bmi", "weight", "nicotine", "donation", "study"] as const) {
      const fact = factFor(topic, empty, [], "2026-11-22");
      expect(fact.missing, topic).toBe(true);
      expect(fact.text, topic).toMatch(/profile/);
    }
    // Height alone is not enough for a BMI.
    expect(factFor("bmi", profile({ heightIn: 69 }), [], "2026-11-22").missing).toBe(true);
  });

  it("gives lists the count and never the lines", () => {
    const trial = toTrial({ protocolSection: { identificationModule: { nctId: "NCT12345678" }, eligibilityModule: { eligibilityCriteria: TEXT } } })!;
    const listed = forList(trial);
    expect(listed.points).toBe(4);
    expect(listed).not.toHaveProperty("eligibility");
    expect(keyFacts(listed)).toContain("4 points to check");
    const none = forList(toTrial({ protocolSection: { identificationModule: { nctId: "NCT12345678" }, eligibilityModule: { eligibilityCriteria: "Inclusion Criteria:\n\n* Adults" } } })!);
    expect(none).not.toHaveProperty("points");
    expect(keyFacts(none).join()).not.toMatch(/point/);
  });
});
