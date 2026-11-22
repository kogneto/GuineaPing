import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { novum } from "./novum";
import { ocrc } from "./ocrc";
import { pfizer } from "./pfizer";
import { pharmaron } from "./pharmaron";
import { tkl } from "./tkl";
import type { Source } from "./types";

const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");

function basics(source: Source, name: string, host: string) {
  const found = source.parse([fixture(name)]);
  expect(found.every((f) => f.url.startsWith("https://") && new URL(f.url).host === host)).toBe(true);
  expect(new Set(found.map((f) => f.key)).size).toBe(found.length);
  expect(source.parse(["<html>nothing</html>"])).toEqual([]);
  expect(source.parse([])).toEqual([]);
  return found;
}

describe("pharmaron", () => {
  it("reads each study box, in the clinic's own words", () => {
    const found = basics(pharmaron, "pharmaron.html", "www.pharmaron.com");
    expect(found).toHaveLength(3);
    expect(found[0]).toEqual({
      key: "SAPPHIRE SAD 2",
      clinicId: "pharmaron",
      title: "Overweight/ Obese Male & Female Volunteers (SAPPHIRE SAD 2)",
      pay: "compensated up to $8,100",
      when: null,
      stay: "This study will include a 5 Day inpatient stay with 19 outpatient visits",
      who: "Overweight/Obese Male or Female, Ages: 18-65 at screening, BMI ≥ 27 at screening, Non-smoker",
      code: "SAPPHIRE SAD 2",
      url: "https://www.pharmaron.com/services/clinical-development/clinical-trial-recruitment/clinical-trial-recruitment-us/",
    });
  });
});

describe("ocrc", () => {
  it("reads each study's name and detail page", () => {
    const found = basics(ocrc, "ocrc.html", "ocrc.net");
    expect(found).toHaveLength(3);
    expect(found[0]).toEqual({ key: "/current-studies/v4/", clinicId: "ocrc", title: "V4", pay: null, when: null, stay: null, who: null, code: "V4", url: "https://ocrc.net/current-studies/v4/" });
  });
});

describe("pfizer", () => {
  it("takes only title, pay, who, code and link, and skips paused studies", () => {
    const found = basics(pfizer, "pfizer.html", "www.pfizerclinicaltrials.com");
    expect(found).toHaveLength(2);
    expect(found[0]).toEqual({
      key: "/x1234567",
      clinicId: "pfizer-new-haven",
      title: "Example Study Vaccine for Seasonal Illness",
      pay: "Up to $1,234 upon completion of the study",
      when: null,
      stay: null,
      who: "Sex: All, Age: 21-55",
      code: "X1234567",
      url: "https://www.pfizerclinicaltrials.com/x1234567",
    });
    expect(found.some((f) => f.code === "Z7654321")).toBe(false);
  });
});

describe("novum", () => {
  it("reads each Las Vegas study card", () => {
    const found = basics(novum, "novum.html", "www.gonovum.com");
    expect(found).toHaveLength(3);
    expect(found[1]).toEqual({
      key: "/study/12641901-group6/",
      clinicId: "novum-las-vegas",
      title: "12641901 Group6",
      pay: "$2,700",
      when: "01/13/27 - 02/22/27",
      stay: null,
      who: "Healthy Postmenopausal Females 40-75 years old, Non-Smoker (Nic/Tobacco) , Max weight allowed 198lbs, Refer Friends or Family to earn an additional $500 , Receive a mammogram and health screening at no cost to you",
      code: "12641901 Group6",
      url: "https://www.gonovum.com/study/12641901-group6/",
    });
    expect(found[0]?.when).toBeNull();
  });
});

describe("tkl", () => {
  it("keeps Fair Lawn studies and leaves out Bloomfield", () => {
    const found = basics(tkl, "tkl.html", "tklresearch.com");
    expect(found).toHaveLength(2);
    expect(found[1]).toEqual({
      key: "/studies/6400-overnight-study-for-healthy-women-18-35/",
      clinicId: "tkl-fair-lawn",
      title: "$6,400 OVERNIGHT STUDY FOR HEALTHY WOMEN 18-35",
      pay: "$6,400 FOR TIME AND TRAVEL",
      when: "12/07/2026",
      stay: "15 OVERNIGHTS AND 4 OUTPATIENT VISITS- 4 OUTPATIENT VISITS- 1 PHONE CALL",
      who: "HEALTHY FEMALES 18-35- FEMALE 18-35",
      code: "P1980126",
      url: "https://tklresearch.com/studies/6400-overnight-study-for-healthy-women-18-35/",
    });
    expect(found.some((f) => f.code === "DS302226")).toBe(false);
    expect(found[0]?.when).toBeNull();
  });
});
