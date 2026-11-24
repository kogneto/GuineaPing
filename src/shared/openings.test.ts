import { describe, expect, it } from "vitest";
import { asItStood, followUpVisits, inOrder, limitedTo, payAmount, studyOf, withinFollowUps } from "./openings";

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

describe("how an entry stood when it was set aside", () => {
  const entry = { code: "778951 9b", when: "Dec 07 2026 - Dec 16 2026", firstSeen: "2026-11-23T09:47:00.000Z" };
  it("stays the same while the entry does", () => {
    expect(asItStood({ ...entry })).toBe(asItStood(entry));
  });
  it("differs once its group, its dates, or the moment it was first seen changes", () => {
    expect(asItStood({ ...entry, code: "778951 10a" })).not.toBe(asItStood(entry));
    expect(asItStood({ ...entry, when: "Jan 04 2027 - Jan 13 2027" })).not.toBe(asItStood(entry));
    expect(asItStood({ ...entry, firstSeen: "2026-11-23T15:47:00.000Z" })).not.toBe(asItStood(entry));
    expect(asItStood({ ...entry, when: null })).not.toBe(asItStood(entry));
  });
});

// Every "stay" wording below was on a Clinic's list in production on 2026-11-24, read by hand.
describe("the follow-up visits in a Clinic's wording", () => {
  it("counts return visits", () => {
    expect(followUpVisits("4 return visits")).toBe(4);
    expect(followUpVisits("1 return visit")).toBe(1);
    expect(followUpVisits("5 return visits")).toBe(5);
    expect(followUpVisits("0 return visits")).toBe(0);
  });

  it("counts outpatient and follow-up visits beside a stay", () => {
    expect(followUpVisits("1 stay of 9 nights & 8 outpatient visits")).toBe(8);
    expect(followUpVisits("1 stay of 9 nights & 10 follow-up visits")).toBe(10);
    expect(followUpVisits("3 stays totaling 17 nights & 6 out-patient visits")).toBe(6);
    expect(followUpVisits("3 stays totaling 21 nights, and 20 follow-up visits")).toBe(20);
    expect(followUpVisits("2 stays of 5 nights each plus 1 follow-up visit")).toBe(1);
    expect(followUpVisits("1 stay of 5 nights & 1 follow-up visit")).toBe(1);
    expect(followUpVisits("1 stay of 20 nights & 1 follow-up visit")).toBe(1);
    expect(followUpVisits("1 stay of 11 nights & 16 out-patient visits. (Approximately 14 weeks)")).toBe(16);
    expect(followUpVisits("This study will include a 5 Day inpatient stay with 19 outpatient visits")).toBe(19);
    expect(followUpVisits("Part 1: This study will include 1 inpatient stay of 5 days/4 nights, and 15 follow-up visits")).toBe(15);
  });

  it("tells an entry that doesn't say from one whose wording has no such visit", () => {
    expect(followUpVisits(null)).toBeNull();
    expect(followUpVisits("  ")).toBeNull();
    expect(followUpVisits("1 stay of 2 nights")).toBe(0);
    expect(followUpVisits("Able to attend 1 screening visit and a 12-night stay")).toBe(0);
    expect(followUpVisits("Screening visit, 7-Night Stay")).toBe(0);
  });

  it("takes the lower end of a range, so an Opening that might fit is not hidden", () => {
    expect(followUpVisits("1 stay of 4 to 8 nights & 12 to 16 outpatient visits")).toBe(12);
    expect(followUpVisits("7 stays totaling 58 nights & 25-27 out-patient visits")).toBe(25);
  });

  it("takes the lowest figure when the wording gives several", () => {
    // Two groups of one study: 23 visits for one, 11 for the other.
    expect(followUpVisits("This study will include a 2 period inpatient stay of 5 days/4 nights each, with 23 follow-up visits (Cohort 1-4), or 2 days/1 night with 11 follow-up visits (Cohort 0).")).toBe(11);
    // Visits listed twice. They may add up to 8; 4 is the lowest it could mean.
    expect(followUpVisits("15 OVERNIGHTS AND 4 OUTPATIENT VISITS- 4 OUTPATIENT VISITS- 1 PHONE CALL")).toBe(4);
  });

  it("counts a visit the Clinic calls both follow-up and outpatient once", () => {
    expect(followUpVisits("This study will include up to 2 screening visits, a 4 Day/3 Night in-patient stay as well as 8 follow-up outpatient visits")).toBe(8);
  });

  it("counts the visits of a study that is all visits", () => {
    expect(followUpVisits("15 visits over 6 weeks, Hours: 8:00AM - 1:00PM")).toBe(15);
  });

  it("leaves out screening visits", () => {
    expect(followUpVisits("Able to attend 1 screening visit, an 8-night stay, and 4 outpatient visits")).toBe(4);
    expect(followUpVisits("Available for 1 screening visit, 2-night stay, and 10 outpatient visits")).toBe(10);
    expect(followUpVisits("Able to attend 1 screening visit, a 2-night stay, and 10 outpatient visits")).toBe(10);
    expect(followUpVisits("Able to attend 1 screening visit, a 15-night stay, and 16 outpatient visits")).toBe(16);
    expect(followUpVisits("Able to attend 1 screening visit, a 15-night stay, and 1 outpatient visit")).toBe(1);
    expect(followUpVisits("Able to attend one of the following schedules; 1 screening visit, a 12-night stay, and 1 outpatient visit")).toBe(1);
    // Made up, to pin the rule where no stay follows: screening alone is no follow-up visit.
    expect(followUpVisits("2 screening visits")).toBe(0);
  });

  it("leaves out phone calls", () => {
    expect(followUpVisits("21 outpatient visits & 1 follow-up phone call")).toBe(21);
    expect(followUpVisits("Able to attend 1 screening visit, three 4-night stays and 1 follow-up call")).toBe(0);
    expect(followUpVisits("This study will include an inpatient period of 18 days/17 nights with a phone call on Day 28")).toBe(0);
  });

  it("does not count a kind of visit it has not seen a Clinic use for a follow-up", () => {
    // Made up: no Clinic's list had these on 2026-11-24. Unknown kinds read low, so nothing is hidden by a guess.
    expect(followUpVisits("1 stay of 3 nights & 4 dosing visits")).toBe(0);
    expect(followUpVisits("3 consent visits and 2 return visits")).toBe(2);
  });

  // The wordings from here to the end of this block are made up: a review asked what a Clinic
  // could plausibly write that would make the reader count too high, and so hide an Opening.
  it("does not take the number of a day, a week or a price for a count", () => {
    expect(followUpVisits("1 stay of 5 nights with a Day 14 follow-up visit")).toBe(0);
    expect(followUpVisits("1 stay of 3 nights and a Week 4 outpatient visit")).toBe(0);
    expect(followUpVisits("2 return visits, then follow-up visits on Days 14 and 28")).toBe(2);
    expect(followUpVisits("Follow-up visits: Days 14 and 28 follow-up visits")).toBe(0);
    expect(followUpVisits("$100 follow-up visit")).toBe(0);
    expect(followUpVisits("D14 follow-up visit")).toBe(0);
  });

  it("takes the lowest of the numbers a Clinic offers between", () => {
    expect(followUpVisits("1 stay of 4 nights and 2 or 5 outpatient visits")).toBe(2);
    expect(followUpVisits("2, 4 or 6 return visits")).toBe(2);
  });

  it("knows the same visits spelt with a space", () => {
    expect(followUpVisits("1 stay of 4 nights and 6 follow up visits")).toBe(6);
    expect(followUpVisits("1 stay of 4 nights and 6 out patient visits")).toBe(6);
  });
});

describe("a Member's limit on follow-up visits", () => {
  it("lets through an Opening with no more than the limit, and holds back one with more", () => {
    expect(withinFollowUps("1 stay of 9 nights & 8 outpatient visits", 10)).toBe(true);
    expect(withinFollowUps("1 stay of 9 nights & 8 outpatient visits", 5)).toBe(false);
    expect(withinFollowUps("5 return visits", 5)).toBe(true);
    expect(withinFollowUps("1 return visit", 0)).toBe(false);
    expect(withinFollowUps("1 stay of 2 nights", 0)).toBe(true);
  });

  it("always lets through an Opening that doesn't say how many", () => {
    expect(withinFollowUps(null, 0)).toBe(true);
    expect(withinFollowUps(null, 10)).toBe(true);
  });

  it("lets every Opening through when the Member has chosen no limit", () => {
    expect(withinFollowUps("7 stays totaling 58 nights & 25-27 out-patient visits", null)).toBe(true);
    expect(withinFollowUps("1 stay of 2 nights", null)).toBe(true);
    expect(withinFollowUps(null, null)).toBe(true);
  });
});

describe("a Member's Clinics under their limit on follow-up visits", () => {
  const o = (id: string, stay: string | null, mark: string | null = null) => ({ id, stay, mark });
  const ids = (clinics: { openings: { id: string }[] }[]) => clinics.map((c) => c.openings.map((x) => x.id));
  const kc = { openings: [o("none", "0 return visits"), o("one", "1 return visit"), o("four", "4 return visits")] };
  const fortrea = { openings: [o("eight", "1 stay of 9 nights & 8 outpatient visits")] };

  it("keeps at each Clinic the Openings within the limit, and counts the ones it holds back", () => {
    const under = limitedTo([kc, fortrea], 2);
    expect(ids(under.clinics)).toEqual([["none", "one"], []]);
    expect(under.clinics.map((c) => c.heldBack)).toEqual([1, 1]);
    expect(under.heldBack).toBe(2);
  });

  it("leaves an Opening the Member set aside where it is, and out of the count", () => {
    // "aside" asks for 10, over the limit, but it is already out of the list and counted on its own.
    const madison = { openings: [o("eight", "1 stay of 9 nights & 8 outpatient visits"), o("aside", "1 stay of 9 nights & 10 follow-up visits", "not_this_time")] };
    const under = limitedTo([madison], 5);
    expect(ids(under.clinics)).toEqual([["aside"]]);
    expect(under.heldBack).toBe(1);
  });

  it("counts the Openings left in the list that don't say how many", () => {
    const celerion = { openings: [o("silent", null), o("silent too", null), o("silent, set aside", null, "not_for_me")] };
    expect(limitedTo([kc, celerion], 0).dontSay).toBe(2);
  });

  it("holds nothing back, and has nothing to explain, when the Member chose no limit", () => {
    const celerion = { openings: [o("silent", null)] };
    const under = limitedTo([kc, fortrea, celerion], null);
    expect(ids(under.clinics)).toEqual([["none", "one", "four"], ["eight"], ["silent"]]);
    expect(under.heldBack).toBe(0);
    expect(under.dontSay).toBe(0);
  });
});
