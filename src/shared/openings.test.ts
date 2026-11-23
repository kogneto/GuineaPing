import { describe, expect, it } from "vitest";
import { roundSeen, studyOf } from "./openings";

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
