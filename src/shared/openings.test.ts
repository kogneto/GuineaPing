import { describe, expect, it } from "vitest";
import { inOrder, payAmount, roundSeen, studyOf } from "./openings";

/** Every code on the lists GuineaPing had read by 2026-11-23, with the study each belongs to. */
const CODES: Record<string, Record<string, string>> = {
  celerion: {
    "CA48121-6": "CA48121",
    "CA48121-6A": "CA48121",
    "CA49982-3": "CA49982",
    "CA49982-3A": "CA49982",
    "CA50135-1": "CA50135",
    "CA50785-7A": "CA50785",
    "CA51164-1": "CA51164",
    "CA52371-3": "CA52371",
    "CA52371-3A": "CA52371",
    "CA53231-1": "CA53231",
    "CA53231-2": "CA53231",
    "CB48121-21": "CB48121",
    "CB48121-21A": "CB48121",
    "CB50785-23": "CB50785",
  },
  fortrea: {
    "5106963 4": "5106963",
    "5109595 Part A (3-4)": "5109595",
    "5109840 5-6": "5109840",
    "778951 9b": "778951",
    "778951 B": "778951",
    "781236": "781236",
    "781236 1": "781236",
    "781236 3": "781236",
    "781681 A": "781681",
    "782640 1": "782640",
    "783028": "783028",
    "783564 6a": "783564",
  },
  "altasciences-la": {
    "N-38160 (ES)": "N-38160",
    "S-36900 (ES)": "S-36900",
    "S-38170 (ES)": "S-38170",
    ...Object.fromEntries(
      ["C-5010", "C-8040", "J-2010", "J-41500", "J-5000", "N-3030", "N-34300", "N-38160", "N-38900", "N-40300", "N-40600", "N-40700", "N-41100", "N-41200", "N-41300", "N-41310", "N-41500", "N-41600", "N-5020", "S-36900", "S-38170", "S-40910", "S-41000"].map((code) => [code, code]),
    ),
  },
  novum: { "12641901 Group5": "12641901", "12641901 Group6": "12641901", "Postmenopausal Data Collection 12500001": "Postmenopausal Data Collection 12500001" },
  "altasciences-kc": { C01: "C01", N47: "N47", N49: "N49", N96: "N96" },
  ocrc: { "AS 7": "AS 7", B6: "B6", EH: "EH", K6: "K6", P4: "P4", V4: "V4" },
  pfizer: { C6381001: "C6381001", JapaneseGeneric: "JapaneseGeneric" },
  // Its Parts pay differently and may be for different people, so each stays a study of its own.
  pharmaron: { "AMETHYST Part 1": "AMETHYST Part 1", "AMETHYST Part 2": "AMETHYST Part 2", CHESAPEAKE: "CHESAPEAKE", QUARTZ: "QUARTZ", "SAPPHIRE SAD 2": "SAPPHIRE SAD 2" },
};

describe("which study an Opening belongs to", () => {
  for (const [source, codes] of Object.entries(CODES)) {
    it(`reads every ${source} code seen so far`, () => {
      for (const [code, study] of Object.entries(codes)) expect(studyOf(source, code), code).toBe(study);
    });
  }

  it("drops a group only at the Clinics whose lists show one", () => {
    // The same shapes anywhere else are left whole.
    expect(studyOf("novum", "CA48121-6A")).toBe("CA48121-6A");
    expect(studyOf("celerion", "12641901 Group5")).toBe("12641901 Group5");
    expect(studyOf("tkl", "778951 9b")).toBe("778951 9b");
    expect(studyOf("pharmaron", "778951 9b")).toBe("778951 9b");
  });

  it("keeps a code whole when it doesn't look like the Clinic's usual one", () => {
    expect(studyOf("celerion", "PILOT")).toBe("PILOT");
    expect(studyOf("fortrea", "Flu study")).toBe("Flu study");
    expect(studyOf("fortrea", "12 a")).toBe("12 a");
  });

  it("has no study for an entry with no code", () => {
    expect(studyOf("altasciences-kc", null)).toBeNull();
    expect(studyOf("celerion", "  ")).toBeNull();
  });
});

describe("the figure an Opening's pay is ordered by", () => {
  /** Every pay wording on the lists GuineaPing had read by 2026-11-23, or one of each shape. */
  const PAY: [string | null, number | null][] = [
    ["$375", 375],
    ["$50", 50],
    ["$2,700", 2700],
    ["$10,784", 10784],
    ["$44,900", 44900],
    ["$3,000*", 3000],
    ["$22,750*", 22750],
    ["$3 550", 3550],
    ["$16 800", 16800],
    ["$22,524 to $23,132", 23132],
    ["up to $1,000", 1000],
    ["up to $1,000 – $10,000", 10000],
    ["up to $10,000, $14,800 or $19,750", 19750],
    ["up to $17,750 or $32,150", 32150],
    ["compensated up to $4,800 – $12,050", 12050],
    ["compensated up to $8,600", 8600],
    ["Up to $3,350 upon completion of the study", 3350],
    ["Compensation varies by study", null],
    [null, null],
    ["", null],
  ];
  it("is the highest dollar figure in the Clinic's wording", () => {
    for (const [pay, amount] of PAY) expect(payAmount(pay), String(pay)).toBe(amount);
  });
  it("doesn't run a figure into the words after it", () => {
    expect(payAmount("$50 12 visits")).toBe(50);
    expect(payAmount("$3,000 2026")).toBe(3000);
    expect(payAmount("$1,200.50 per night")).toBe(1200);
    expect(payAmount("3 nights")).toBeNull();
  });
});

describe("Openings in order", () => {
  const o = (title: string, pay: string | null, firstSeen: string) => ({ title, pay, firstSeen });
  const list = [o("B", "$3,000*", "2026-11-23"), o("A", "up to $17,750 or $32,150", "2026-11-22"), o("D", null, "2026-11-24"), o("C", "$3 000", "2026-11-24"), o("E", "Compensation varies by study", "2026-11-23")];
  const titles = (by: "pay" | "newest") => inOrder(list, by).map((x) => x.title);

  it("puts the highest pay first, and those that name no figure last", () => {
    expect(titles("pay")).toEqual(["A", "B", "C", "D", "E"]);
  });
  it("puts the most recently first seen first, the better paid first within a day", () => {
    expect(titles("newest")).toEqual(["C", "D", "B", "E", "A"]);
  });
  it("leaves the list it was given as it was", () => {
    inOrder(list, "pay");
    expect(list.map((x) => x.title)).toEqual(["B", "A", "D", "C", "E"]);
  });
});

describe("what an entry said when it was set aside", () => {
  const entry = { code: "778951 9b", when: "Dec 07 2026 - Dec 16 2026", firstSeen: "2026-11-23" };
  it("stays the same while the entry does", () => {
    expect(roundSeen({ ...entry })).toBe(roundSeen(entry));
  });
  it("differs once its group, its dates, or the day it was first seen changes", () => {
    expect(roundSeen({ ...entry, code: "778951 10a" })).not.toBe(roundSeen(entry));
    expect(roundSeen({ ...entry, when: "Jan 04 2027 - Jan 13 2027" })).not.toBe(roundSeen(entry));
    expect(roundSeen({ ...entry, firstSeen: "2026-12-20" })).not.toBe(roundSeen(entry));
    expect(roundSeen({ ...entry, when: null })).not.toBe(roundSeen(entry));
  });
});
