import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { altasciencesKc } from "./altasciencesKc";
import { altasciencesLa } from "./altasciencesLa";
import { celerion } from "./celerion";
import { fortrea } from "./fortrea";
import { link, sameHost, text } from "./html";

/** Trimmed copies of each Clinic's list as it stood on 2026-11-22. */
const page = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");

describe("html helpers", () => {
  it("reads text as a person would, entities decoded and tags gone", () => {
    expect(text("<td> 1 stay of 5 nights &amp; 1&nbsp;visit <!-- x --></td>")).toBe("1 stay of 5 nights & 1 visit");
  });
  it("keeps only https links on the Clinic's own host", () => {
    expect(sameHost("/a", "https://clinic.example/list")).toBe("https://clinic.example/a");
    expect(sameHost("https://elsewhere.example/a", "https://clinic.example/list")).toBeNull();
    expect(sameHost("http://clinic.example/a", "https://clinic.example/list")).toBeNull();
    expect(link('<a href="javascript:alert(1)">x</a>', "https://clinic.example/")).toBeNull();
  });
});

describe("Fortrea", () => {
  const found = fortrea.parse([page("fortrea.html")]);
  it("finds one Opening per row, at the right Clinic", () => {
    expect(found.map((f) => f.clinicId)).toEqual(["fortrea-madison", "fortrea-san-antonio", "fortrea-madison"]);
  });
  it("keeps the Clinic's own words and links to the Opening's own page", () => {
    expect(found[2]).toEqual({
      key: "/en-us/clinical-research/782640-healthy-men-age-18-55-needed",
      clinicId: "fortrea-madison",
      title: "Healthy Men, age 18-55 needed",
      pay: "$10,784",
      when: "Dec 03 2026 - Dec 29 2026",
      stay: "1 stay of 20 nights & 1 follow-up visit",
      who: "Age 18-55",
      code: "782640 1",
      url: "https://www.fortreaclinicaltrials.com/en-us/clinical-research/782640-healthy-men-age-18-55-needed",
    });
  });
  it("says nothing of dates the Clinic does not give", () => {
    expect(found[0]?.when).toBeNull();
  });
});

describe("Celerion", () => {
  const found = celerion.parse([page("celerion.html")]);
  it("finds each study group with its days, pay and ages", () => {
    expect(found).toHaveLength(3);
    expect(found[1]).toMatchObject({
      clinicId: "celerion-lincoln",
      code: "CA52371-3A",
      title: "Healthy Males & Females",
      pay: "$3,000*",
      when: "Dec 02 to Dec 10",
      who: "19 to 55 years of age",
      url: "https://helpresearch.com/medical-study/ca52371-3a-0x0000000000007164",
    });
  });
  it("tells two groups of one study apart", () => {
    expect(new Set(found.map((f) => f.key)).size).toBe(3);
  });
});

describe("Altasciences Kansas City", () => {
  const found = altasciencesKc.parse([page("altasciences-kc.html")]);
  it("leaves out groups marked Recruitment Complete", () => {
    expect(found.map((f) => f.title)).toEqual(["Healthy Participants (N96)(C1B)"]);
  });
  it("reads pay, dates, visits and who", () => {
    expect(found[0]).toMatchObject({ pay: "$5 550", when: "1 to 5 Dec", stay: "5 return visits", who: "Male and Female, Age 18 - 65", code: "N96", url: "https://participantskc.altasciences.com/etudes/89472" });
  });
});

describe("Altasciences Los Angeles", () => {
  it("reads each row, and the same row on two pages only once", () => {
    const html = page("altasciences-la.html");
    const found = altasciencesLa.parse([html, html]);
    expect(found.map((f) => f.code)).toEqual(["S-38170", "S-40910", "N-38160"]);
    expect(found[1]).toMatchObject({ pay: "up to $25,725", title: "Males and females with overweight or obesity", url: "https://participantsla.altasciences.com/current-studies/s-40910-en-1" });
  });
});

describe("a page that is not the list", () => {
  it("yields nothing, from every parser", () => {
    for (const s of [fortrea, celerion, altasciencesKc, altasciencesLa]) expect(s.parse(["<html><body>Welcome</body></html>"])).toEqual([]);
  });
});
