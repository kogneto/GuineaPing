import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { abbvie } from "./abbvie";
import { cpmi } from "./cpmi";
import { novum } from "./novum";
import { ocrc } from "./ocrc";
import { pfizer } from "./pfizer";
import { pharmaron } from "./pharmaron";
import { prosciento } from "./prosciento";
import { syneos } from "./syneos";
import { axis } from "./axis";
import { cenexel } from "./cenexel";
import { drVince } from "./drVince";
import { medpace } from "./medpace";
import { tkl } from "./tkl";
import { clean } from "./read";
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

describe("Dr. Vince", () => {
  it("reads each study card, in the Clinic's own words", () => {
    const found = basics(drVince, "dr-vince.html", "drvince.com");
    expect(found.map((f) => f.code)).toEqual(["12C", "10E", "13D", "11F", "18B"]);
    expect(found[1]).toEqual({
      key: "/current-studies/health-volunteers-10e/",
      clinicId: "dr-vince",
      title: "Healthy Volunteers",
      pay: "Up to $3,775",
      when: null,
      stay: "1 Screening visit, 1 Stay of 4 nights, 2 Outpatient visits, 1 Phone call",
      who: "Male/Female, Ages 18 to 55",
      code: "10E",
      url: "https://drvince.com/current-studies/health-volunteers-10e/",
    });
  });
  it("keeps a card that gives no status line", () => {
    const found = drVince.parse([fixture("dr-vince.html")]);
    expect(found[4]).toMatchObject({ title: "Recreational Stimulant Users", pay: "Up to $13,500", stay: "1 Screening visit, 1 Stay of 24 nights, 1 Outpatient visit" });
  });
});

describe("Syneos", () => {
  it("reads each study card that is recruiting now or soon, in the Clinic's own words", () => {
    const found = basics(syneos, "syneos.html", "www.us-participants.syneoshealth.com");
    expect(found.map((f) => f.code)).toEqual(["7080413 Cohort A3", "7070094 SAD 7"]);
    expect(found[0]).toEqual({
      key: "/en/avalaible-studies/study-7080413-cohort-a3-2/",
      clinicId: "syneos-miami",
      title: "Study 7080413 Cohort A3",
      pay: "$2,280",
      when: "December 16 to 20, 2026",
      stay: "The study includes 1 overnight stay (4 nights) and 1 return visit.",
      who: "Men and surgically sterile or postmenopausal women, Non-smoker, Age 18 to 65",
      code: "7080413 Cohort A3",
      url: "https://www.us-participants.syneoshealth.com/en/avalaible-studies/study-7080413-cohort-a3-2/",
    });
  });
  it("skips a study marked closed, and a card that names no study", () => {
    const titles = syneos.parse([fixture("syneos.html")]).map((f) => f.title);
    expect(titles).not.toContain("Study 7072457 SAD 2");
    expect(titles).not.toContain("Study 7084093 Group 2");
    expect(titles).not.toContain("Overweight Participants");
  });
});

describe("Axis", () => {
  it("reads each study, in the Clinic's own words", () => {
    const found = basics(axis, "axis.html", "axispays.com");
    expect(found.map((f) => f.code)).toEqual(["2213", "2099 P3", "2275 G6", "2078", "2099 P3.1", "2287 G3", "2229 G1", "2229 G2", "2078", "2272"]);
    expect(found[2]).toEqual({
      key: "/code-2275-g6/",
      clinicId: "axis-dilworth",
      title: "Looking for Healthy Volunteers",
      pay: "Receive up to $7,500",
      when: null,
      stay: null,
      who: "BMI 20.0 - 40.0, Age 18-65, Allows Light Smokers",
      code: "2275 G6",
      url: "https://axispays.com/code-2275-g6/",
    });
  });
  it("skips the free health screens, which are not studies", () => {
    const titles = axis.parse([fixture("axis.html")]).map((f) => f.title);
    expect(titles).not.toContain("General Health Screen");
    expect(titles).not.toContain("Testosterone Screen");
  });
});

describe("CenExel", () => {
  const pages = ["cenexel-act.html", "cenexel-cns.html", "cenexel-iresearch.html", "cenexel-hri.html"].map(fixture);
  const found = cenexel.parse(pages);
  it("reads each unit's list into its own Clinic, leaving out studies that have stopped enrolling", () => {
    const count = (id: string) => found.filter((f) => f.clinicId === id).length;
    // Enrolling or upcoming on 2026-11-24: 4 + 7 at ACT, 2 + 1 at CNS, 4 + 1 at iResearch, 12 at HRI. "Ongoing" ones are left out.
    expect([count("cenexel-anaheim"), count("cenexel-los-alamitos"), count("cenexel-decatur"), count("cenexel-marlton")]).toEqual([11, 3, 5, 12]);
    expect(new Set(found.map((f) => f.key)).size).toBe(found.length);
    expect(found.every((f) => new URL(f.url).host === "cenexelresearch.com")).toBe(true);
  });
  it("keeps the Clinic's own words", () => {
    expect(found.find((f) => f.key === "/act/trials/celiac-disease/")).toEqual({
      key: "/act/trials/celiac-disease/",
      clinicId: "cenexel-anaheim",
      title: "Celiac Disease",
      pay: "up to $2,800",
      when: null,
      stay: null,
      who: "M / F, Age 18 -70",
      code: null,
      url: "https://cenexelresearch.com/act/trials/celiac-disease/",
    });
  });
  it("finds nothing in a page that isn't a list", () => {
    expect(cenexel.parse(["<html>nothing</html>"])).toEqual([]);
  });
});

describe("ProSciento", () => {
  it("reads each study once, though the page shows each twice", () => {
    const found = basics(prosciento, "prosciento.html", "myproscientostudy.com");
    expect(found.map((f) => f.key)).toEqual(["/pisa-ep/", "/cip358/", "/rona-t2/", "/rona-hov/"]);
    expect(found[0]).toEqual({
      key: "/pisa-ep/",
      clinicId: "prosciento",
      title: "Healthy volunteers needed for a clinical research study",
      pay: "Up to $5,075",
      when: null,
      stay: "Up to 88 days",
      who: "Healthy Men Ages 18\u201355 May Qualify",
      code: null,
      url: "https://myproscientostudy.com/pisa-ep/",
    });
  });
});

describe("AbbVie", () => {
  // A copy of the feed's answer on 2026-11-24. The feed also sends each study's flyer as a PDF
  // inside the list; that is left out here (AttachmentContent), as it names its author.
  it("reads each study in the feed, in the Clinic's own words", () => {
    const found = basics(abbvie, "abbvie.json", "abbviephase1.com");
    expect(found).toEqual([
      {
        key: "7175",
        clinicId: "abbvie-grayslake",
        title: "Champagne",
        pay: "$4,200",
        when: "13 or 14 December 2026",
        stay: "Overnight",
        who: "Men and Women, Age 18-45, BMI 18-32",
        code: null,
        url: "https://abbviephase1.com/#/available-trials",
      },
    ]);
  });

  it("finds nothing in an answer that isn't the list, and skips an entry with no number or name", () => {
    expect(abbvie.parse(['{"Message":"An error has occurred."}'])).toEqual([]);
    expect(abbvie.parse(["<ArrayOfTrial><Trial><Title>Champagne</Title></Trial></ArrayOfTrial>"])).toEqual([]);
    expect(abbvie.parse(['[{"Title":"No number"},{"TrialID":7176},{"TrialID":7177,"Title":"  "},null]'])).toEqual([]);
  });

  it("gives a bare sum as dollars, with cents only where it has them, and other pay as the Clinic wrote it", () => {
    const one = (entry: object) => abbvie.parse([JSON.stringify([{ TrialID: 1, Title: "A study", ...entry }])])[0];
    expect(one({ Stipend: "1234.50" })?.pay).toBe("$1,234.50");
    expect(one({ Stipend: "950" })?.pay).toBe("$950");
    expect(one({ Stipend: 4200 })?.pay).toBe("$4,200");
    expect(one({ Stipend: "Up to $4,200" })?.pay).toBe("Up to $4,200");
    // A sum of nothing is no pay given, not a study that pays nothing.
    expect(one({ Stipend: "0.00" })?.pay).toBeNull();
  });

  it("keeps the Clinic's words as they are, and leaves out what it doesn't give", () => {
    const one = (entry: object) => abbvie.parse([JSON.stringify([{ TrialID: 1, Title: "A study", ...entry }])])[0];
    expect(one({ Stipend: "" })).toMatchObject({ pay: null, when: null, stay: null, who: null });
    expect(one({ Gender: "Women", Age: "", BMI: "<32 and >18" })?.who).toBe("Women, BMI <32 and >18");
    expect(one({ Title: "  Champagne &amp;\n Brut " })?.title).toBe("Champagne &amp; Brut");
  });
});

describe("Clinical Pharmacology of Miami", () => {
  // A trimmed copy of the feed's answer on 2026-11-24: 6 of its 11 studies, without the doctors'
  // names, the images and the long story text.
  it("reads each study's name and code, leaving out the wait-lists for future studies", () => {
    const found = cpmi.parse([fixture("cpmi.json")]);
    expect(found.map((f) => f.title)).toEqual(["Healthy Volunteers", "Healthy Senior Volunteers", "Kidney Disease", "Abdominoplasty"]);
    expect(found[0]).toEqual({
      key: "408",
      clinicId: "clinical-pharmacology-miami",
      title: "Healthy Volunteers",
      pay: null,
      when: null,
      stay: null,
      who: null,
      code: "M26-134",
      url: "https://cpmiclinical.com/studies/#!/",
    });
  });

  it("finds nothing in an answer that isn't the list, and skips an entry with no number or name", () => {
    expect(cpmi.parse(["<html>nothing</html>"])).toEqual([]);
    expect(cpmi.parse([])).toEqual([]);
    expect(cpmi.parse(['[{"StudyID":"1","Title":"A study"}]'])).toEqual([]);
    expect(cpmi.parse(['{"studies":[{"Title":"No number"},{"StudyID":"2"},{"StudyID":"3","Title":" "},null]}'])).toEqual([]);
    // However the wait-list is spelt.
    expect(cpmi.parse(['{"studies":[{"StudyID":"4","Title":"Obesity","Protocol":"Wait List: Future Obesity Study"},{"StudyID":"5","Title":"Gout","Protocol":"Waitlist"}]}'])).toEqual([]);
  });

  it("links its Openings to the Clinic's own site, though the list comes from another company's", () => {
    const found = cpmi.parse([fixture("cpmi.json")]);
    expect(cpmi.pages.map((p) => new URL(p).host)).toEqual(["realtime-host01.com"]);
    expect(clean(found, cpmi)).toHaveLength(found.length);
    expect(clean([{ ...found[0]!, url: "https://realtime-host01.com/erg-cpm/web/v1/studies?" }], cpmi)).toEqual([]);
  });
});

describe("Medpace", () => {
  // The feed's answer on 2026-11-24, in its shape: JSON encoded once more as a string, each study a card of HTML.
  it("reads each study card, in the Clinic's own words", () => {
    const found = basics(medpace, "medpace.json", "www.medpace.com");
    expect(found).toHaveLength(6);
    expect(found[0]).toEqual({
      key: "/study-participants/browse-studies/healthy-adults-with-mild-to-moderate-hypertension-ages-18-65-11700/",
      clinicId: "medpace",
      title: "Healthy Adults with Mild to Moderate Hypertension, Ages 18-65, $13,900",
      pay: "$13,900 - Study Calendars Available",
      when: null,
      stay: "This study requires 16 outpatient visits (includes screening) plus one separate 4-night stay at our Phase 1 unit in Cincinnati, OH.",
      who: "Age: 18-65, BMI: 18-35, No Nicotine Use",
      code: null,
      url: "https://www.medpace.com/study-participants/browse-studies/healthy-adults-with-mild-to-moderate-hypertension-ages-18-65-11700/",
    });
    expect(found[3]).toMatchObject({ stay: "This study requires 6 outpatient visits, (includes screening) plus 1, 2-night stay at our Phase 1 unit in Cincinnati , OH.", who: "Age: 18-60, BMI: 18-30" });
  });

  it("gives no pay or stay where a card names none", () => {
    const glp1 = medpace.parse([fixture("medpace.json")])[5];
    expect(glp1).toMatchObject({ title: "Have You Previously Taken, or Are Currently Taking a GLP-1 Medication?", pay: null, stay: null, who: null });
  });

  it("takes the stay from an excerpt cut short before its first sentence ends", () => {
    const answer = JSON.stringify(JSON.stringify({ posts: [
      '<a class="em-study-card" href="https://www.medpace.com/study-participants/browse-studies/a/"><p class="em-study-card__title">A study</p><p class="em-study-card__excerpt"><p>This study requires 6 outpatient visits plus one 3-night stay at our Phase 1 unit in\u2026</p></a>',
    ] }));
    expect(medpace.parse([answer])[0]?.stay).toBe("This study requires 6 outpatient visits plus one 3-night stay at our Phase 1 unit in");
  });

  it("reads the answer encoded once, and finds nothing in one that isn't the list", () => {
    const once = JSON.parse(fixture("medpace.json")) as string;
    expect(medpace.parse([once])).toHaveLength(6);
    expect(medpace.parse(['"just a string"'])).toEqual([]);
    expect(medpace.parse(['{"foundPosts":0,"posts":[]}'])).toEqual([]);
  });
});

describe("the sources read since 2026-11-24", () => {
  it("lose no Opening to the read's own checks of Clinic and link", () => {
    const cases: [Source, string[]][] = [
      [drVince, ["dr-vince.html"]],
      [syneos, ["syneos.html"]],
      [axis, ["axis.html"]],
      [cenexel, ["cenexel-act.html", "cenexel-cns.html", "cenexel-iresearch.html", "cenexel-hri.html"]],
      [prosciento, ["prosciento.html"]],
      [abbvie, ["abbvie.json"]],
      [cpmi, ["cpmi.json"]],
      [medpace, ["medpace.json"]],
    ];
    for (const [source, files] of cases) {
      const found = source.parse(files.map(fixture));
      expect(found.length, source.id).toBeGreaterThan(0);
      expect(clean(found, source), source.id).toHaveLength(found.length);
    }
  });
});
