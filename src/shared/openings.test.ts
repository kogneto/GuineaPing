import { describe, expect, it } from "vitest";
import { asItStood, followUpVisits, inOrder, limitedTo, payAmount, startDay, startsWithin, studyOf, timeframeOf, withinFollowUps } from "./openings";

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

  it("reads the visits as Dr. Vince lists them, one line each", () => {
    // Dr. Vince's cards on 2026-11-24, their lines joined as the reader joins them.
    expect(followUpVisits("1 Screening visit, 1 Stay of 5 nights, 1 Outpatient visit")).toBe(1);
    expect(followUpVisits("1 Screening visit, 1 Stay of 4 nights, 2 Outpatient visits, 1 Phone call")).toBe(2);
    expect(followUpVisits("1 Screening visit, 1 Stay of 7 nights, 4 Outpatient visits")).toBe(4);
    expect(followUpVisits("1 Screening visit, 1 Stay of 24 nights, 1 Outpatient visit")).toBe(1);
  });

  it("reads the visits in the wording of the Clinics read since 2026-11-24", () => {
    // Syneos, in the tip beside each study's dates.
    expect(followUpVisits("The study includes 1 overnight stay (4 nights) and 1 return visit.")).toBe(1);
    expect(followUpVisits("The study includes 1 overnight stay (5 nights) and 1 return visit.")).toBe(1);
    // ProSciento gives only how long a study runs: no visit is named, so it counts as none.
    expect(followUpVisits("Up to 88 days")).toBe(0);
    expect(followUpVisits("Up to 10 months")).toBe(0);
    // AbbVie gives only the kind of stay.
    expect(followUpVisits("Overnight")).toBe(0);
    // Medpace counts the screening visit in with the outpatient visits, and says so.
    expect(followUpVisits("This study requires 16 outpatient visits (includes screening) plus one separate 4-night stay at our Phase 1 unit in Cincinnati, OH.")).toBe(15);
    expect(followUpVisits("This study requires 6 outpatient visits, (includes screening) plus 1, 2-night stay at our Phase 1 unit in Cincinnati , OH.")).toBe(5);
    expect(followUpVisits("This study includes 18 outpatient visits (includes screening) plus 4 separate 3-night stays at our Phase 1 unit in Cincinnati , OH.")).toBe(17);
    // Made up, to pin the rule: a labelled number still counts as one visit, never as nothing.
    expect(followUpVisits("a Day 14 follow-up visit (includes screening)")).toBe(1);
    // Parexel, in the stay line of its cards.
    expect(followUpVisits("1 pre-screening visit")).toBe(0);
    expect(followUpVisits("1 screening visit, 1 in-house stay of 4 days/3 nights, 1 in-house stay of 3 days/2 nights, 2 follow-up phone calls, 25 in-person follow-up visits")).toBe(25);
    expect(followUpVisits("1 Screening visit, 1 in-house stay of 8 Days / 7 Nights and 7 follow-up visits")).toBe(7);
    expect(followUpVisits("2 screening visits, 1 in-house stay of 16-days/15-nights, and 13 outpatient visits")).toBe(13);
    expect(followUpVisits("1 screening visit up to 3 in-house stays of up-to 6 Days / 5 nights and 2 follow-ups visit and 11 phone calls")).toBe(2);
    // A number in words is not read, so it counts as none: low, never high.
    expect(followUpVisits("This study requires four outpatient visits (includes screening) plus one separate 6-night stay at our Phase 1 unit in Cincinnati, OH.")).toBe(0);
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
  it("takes a visit on a numbered day or week, or with a price, for one visit, not that many", () => {
    expect(followUpVisits("1 stay of 5 nights with a Day 14 follow-up visit")).toBe(1);
    expect(followUpVisits("1 stay of 3 nights and a Week 4 outpatient visit")).toBe(1);
    expect(followUpVisits("2 return visits, then follow-up visits on Days 14 and 28")).toBe(2);
    expect(followUpVisits("Follow-up visits: Days 14 and 28 follow-up visits")).toBe(1);
    expect(followUpVisits("$100 follow-up visit")).toBe(1);
    expect(followUpVisits("D14 follow-up visit")).toBe(1);
  });

  it("never reads higher for doubting a number: a count it takes for a label still counts as one", () => {
    // "4" follows the word "visit", so it looks like a label. Dropping it would leave 8, above the true 4.
    expect(followUpVisits("1 screening visit 4 outpatient visits and 8 return visits")).toBe(1);
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

describe("a Member's Clinics under their limits", () => {
  const o = (id: string, stay: string | null, mark: string | null = null, when: string | null = null) => ({ id, stay, mark, when, firstSeen: "2026-11-23" });
  const ids = (clinics: { openings: { id: string }[] }[]) => clinics.map((c) => c.openings.map((x) => x.id));
  const kc = { openings: [o("none", "0 return visits"), o("one", "1 return visit"), o("four", "4 return visits")] };
  const fortrea = { openings: [o("eight", "1 stay of 9 nights & 8 outpatient visits")] };
  const ANY_TIME = { from: null, to: null };
  const upTo = (followUps: 0 | 2 | 5 | 10 | null) => ({ followUps, starts: ANY_TIME });

  it("keeps at each Clinic the Openings within the limit on follow-up visits, and counts the ones it holds back", () => {
    const under = limitedTo([kc, fortrea], upTo(2));
    expect(ids(under.clinics)).toEqual([["none", "one"], []]);
    expect(under.clinics.map((c) => c.heldBack)).toEqual([1, 1]);
    expect(under.heldBack).toBe(2);
    expect(under.followUps.heldBack).toBe(2);
  });

  it("leaves an Opening the Member set aside where it is, and out of the count", () => {
    // "aside" asks for 10, over the limit, but it is already out of the list and counted on its own.
    const madison = { openings: [o("eight", "1 stay of 9 nights & 8 outpatient visits"), o("aside", "1 stay of 9 nights & 10 follow-up visits", "not_this_time")] };
    const under = limitedTo([madison], upTo(5));
    expect(ids(under.clinics)).toEqual([["aside"]]);
    expect(under.heldBack).toBe(1);
  });

  it("counts the Openings left in the list that don't say how many follow-up visits", () => {
    const celerion = { openings: [o("silent", null), o("silent too", null), o("silent, set aside", null, "not_for_me")] };
    expect(limitedTo([kc, celerion], upTo(0)).followUps.dontSay).toBe(2);
  });

  it("holds nothing back, and has nothing to explain, when the Member chose no limits", () => {
    const celerion = { openings: [o("silent", null)] };
    const under = limitedTo([kc, fortrea, celerion], upTo(null));
    expect(ids(under.clinics)).toEqual([["none", "one", "four"], ["eight"], ["silent"]]);
    expect(under.heldBack).toBe(0);
    expect(under.followUps).toEqual({ heldBack: 0, dontSay: 0 });
    expect(under.starts).toEqual({ heldBack: 0, dontSay: 0 });
  });

  // Three Openings with dates, as Clinics word them, and one that gives none.
  const dated = {
    openings: [
      o("early dec, no visits", "1 stay of 2 nights", null, "Dec 02 2026 - Dec 05 2026"),
      o("january, no visits", "1 stay of 2 nights", null, "4 to 12 Jan"),
      o("january, eight visits", "1 stay of 9 nights & 8 outpatient visits", null, "Jan 06 2027 - Feb 01 2027"),
      o("no dates", "1 stay of 2 nights", null, null),
    ],
  };
  const january = { from: "2027-01-01", to: "2027-01-31" };

  it("keeps the Openings that start in the Member's timeframe, and those that give no start day", () => {
    const under = limitedTo([dated], { followUps: null, starts: january });
    expect(ids(under.clinics)).toEqual([["january, no visits", "january, eight visits", "no dates"]]);
    expect(under.starts).toEqual({ heldBack: 1, dontSay: 1 });
    expect(under.followUps).toEqual({ heldBack: 0, dontSay: 0 });
    expect(under.heldBack).toBe(1);
  });

  it("lists an Opening only when it passes both limits, and has each limit count what it holds back by itself", () => {
    const under = limitedTo([dated], { followUps: 2, starts: january });
    expect(ids(under.clinics)).toEqual([["january, no visits", "no dates"]]);
    // Two are held back, once each: one by the timeframe, one by the limit on visits.
    expect(under.heldBack).toBe(2);
    expect(under.clinics[0]!.heldBack).toBe(2);
    expect(under.starts.heldBack).toBe(1);
    expect(under.followUps.heldBack).toBe(1);
  });

  it("counts an Opening that fails both limits in both, but once for its Clinic", () => {
    const both = { openings: [o("december, eight visits", "1 stay of 9 nights & 8 outpatient visits", null, "Dec 07 2026 - Dec 16 2026")] };
    const under = limitedTo([both], { followUps: 2, starts: january });
    expect(under.starts.heldBack).toBe(1);
    expect(under.followUps.heldBack).toBe(1);
    expect(under.heldBack).toBe(1);
    expect(under.clinics[0]!.heldBack).toBe(1);
  });

  it("leaves a set-aside Opening alone under a timeframe too", () => {
    const madison = { openings: [o("aside, december", "1 stay of 2 nights", "not_this_time", "Dec 02 2026 - Dec 05 2026")] };
    const under = limitedTo([madison], { followUps: null, starts: january });
    expect(ids(under.clinics)).toEqual([["aside, december"]]);
    expect(under.starts).toEqual({ heldBack: 0, dontSay: 0 });
  });
});

// Every "when" wording below was on a Clinic's list in production on 2026-11-24, read by hand.
// Each Opening was first seen on 2026-11-23 or 2026-11-24.
describe("the day an Opening starts, in a Clinic's wording", () => {
  const SEEN = "2026-11-23";

  it("is the first date, when the Clinic gives the year", () => {
    expect(startDay("Dec 02 2026 - Apr 27 2028", SEEN)).toBe("2026-12-02");
    expect(startDay("Dec 03 2026 - Dec 29 2026", SEEN)).toBe("2026-12-03");
    expect(startDay("Dec 04 2026 - Mar 02 2027", SEEN)).toBe("2026-12-04");
    expect(startDay("Dec 07 2026 - Apr 12 2027", SEEN)).toBe("2026-12-07");
    expect(startDay("Dec 07 2026 - Dec 16 2026", SEEN)).toBe("2026-12-07");
    expect(startDay("Dec 07 2026 - May 25 2027", SEEN)).toBe("2026-12-07");
    expect(startDay("Dec 16 2026 - Dec 18 2026", SEEN)).toBe("2026-12-16");
    expect(startDay("Jan 06 2027 - Feb 01 2027", SEEN)).toBe("2027-01-06");
    expect(startDay("Nov 19 2026 - Jun 09 2027", SEEN)).toBe("2026-11-19");
    expect(startDay("Nov 24 2026 - Jun 14 2027", "2026-11-24")).toBe("2026-11-24");
    expect(startDay("Nov 28 2026 - Apr 23 2028", SEEN)).toBe("2026-11-28");
    expect(startDay("Nov 30 2026 - Jun 15 2027", SEEN)).toBe("2026-11-30");
  });

  it("reads a date written with slashes month first", () => {
    expect(startDay("01/13/27 - 02/22/27", SEEN)).toBe("2027-01-13");
    expect(startDay("12/01/26 - 11/10/27", SEEN)).toBe("2026-12-01");
    expect(startDay("11/30/2026", SEEN)).toBe("2026-11-30");
    expect(startDay("12/07/2026", SEEN)).toBe("2026-12-07");
  });

  it("works the year out from the day the Opening was first seen, when the Clinic gives none", () => {
    expect(startDay("Dec 01 to Dec 10", SEEN)).toBe("2026-12-01");
    expect(startDay("Dec 01 to Dec 30", SEEN)).toBe("2026-12-01");
    expect(startDay("Dec 01 to Jan 01", SEEN)).toBe("2026-12-01");
    expect(startDay("Dec 02 to Dec 10", SEEN)).toBe("2026-12-02");
    expect(startDay("Dec 02 to Dec 17", SEEN)).toBe("2026-12-02");
    expect(startDay("Dec 04 to Jan 25", SEEN)).toBe("2026-12-04");
    expect(startDay("Dec 06 to Dec 19", SEEN)).toBe("2026-12-06");
    expect(startDay("Dec 06 to Dec 21", SEEN)).toBe("2026-12-06");
    expect(startDay("Dec 08 to Dec 18", SEEN)).toBe("2026-12-08");
    expect(startDay("Dec 09 to Dec 17", SEEN)).toBe("2026-12-09");
    expect(startDay("Dec 09 to Dec 23", SEEN)).toBe("2026-12-09");
    expect(startDay("Dec 09 to Dec 28", SEEN)).toBe("2026-12-09");
    expect(startDay("Dec 09 to Feb 19", SEEN)).toBe("2026-12-09");
    expect(startDay("Dec 10 to Dec 20", SEEN)).toBe("2026-12-10");
    expect(startDay("Dec 10 to Dec 31", SEEN)).toBe("2026-12-10");
    expect(startDay("Dec 13 to Dec 28", SEEN)).toBe("2026-12-13");
    expect(startDay("Dec 16 to Dec 23", SEEN)).toBe("2026-12-16");
    expect(startDay("Dec 17 to Dec 26", SEEN)).toBe("2026-12-17");
    expect(startDay("Dec 20 to Jan 18", SEEN)).toBe("2026-12-20");
    expect(startDay("Nov 29 to Dec 07", SEEN)).toBe("2026-11-29");
    expect(startDay("Nov 29 to Dec 10", SEEN)).toBe("2026-11-29");
  });

  it("puts a date with no year in the past when it is just behind the day it was first seen, and next year when it is well ahead", () => {
    // Made up, to pin the rule at its edges: two months back, nine months on.
    expect(startDay("Nov 19 to Dec 02", "2026-11-23")).toBe("2026-11-19");
    expect(startDay("Sep 28 to Dec 02", "2026-11-23")).toBe("2026-09-28");
    expect(startDay("Aug 15 to Aug 30", "2026-11-23")).toBe("2027-08-15");
    expect(startDay("Dec 28 to Jan 09", "2027-01-04")).toBe("2026-12-28");
    expect(startDay("Feb 02 to Feb 09", "2027-01-04")).toBe("2027-02-02");
  });

  it("takes the first day when the Clinic writes the day before the month", () => {
    expect(startDay("1 to 5 Dec", SEEN)).toBe("2026-12-01");
    expect(startDay("9 to 13 Dec", SEEN)).toBe("2026-12-09");
    expect(startDay("4 to 12 Jan", SEEN)).toBe("2027-01-04");
    expect(startDay("7 to 15 Jan", SEEN)).toBe("2027-01-07");
    expect(startDay("20 to 23 Dec; 11 Jan to 3 Feb", SEEN)).toBe("2026-12-20");
  });

  it("gives no start day when in any doubt: a date has no safe guess", () => {
    expect(startDay(null, SEEN)).toBeNull();
    expect(startDay("  ", SEEN)).toBeNull();
    // Made up from here: wording no Clinic's list had on 2026-11-24.
    expect(startDay("To be announced", SEEN)).toBeNull();
    expect(startDay("Winter 2027", SEEN)).toBeNull();
    expect(startDay("Marketing 12 studies", SEEN)).toBeNull();
    // Dates that cannot be.
    expect(startDay("13/45/27 - 14/02/27", SEEN)).toBeNull();
    expect(startDay("Feb 30 2027 - Mar 04 2027", SEEN)).toBeNull();
    expect(startDay("Feb 29 2027", SEEN)).toBeNull();
    expect(startDay("28 to 3 Feb", SEEN)).toBeNull();
    // A leap day that can be is read.
    expect(startDay("Feb 29 2028 - Mar 04 2028", SEEN)).toBe("2028-02-29");
  });

  // The wordings from here to the end of this block are made up. A review ran the first reader on
  // wordings a Clinic could plausibly write and found it sure of a wrong day in each group below.
  it("gives no start day when the first date is one it cannot read, never the next date along", () => {
    expect(startDay("Dec 2nd - Dec 20", SEEN)).toBeNull();
    expect(startDay("2nd Dec - 20 Dec", SEEN)).toBeNull();
    expect(startDay("2027-01-06 to Feb 3", SEEN)).toBeNull();
    expect(startDay("Dec 2026 - Feb 5", SEEN)).toBeNull();
    expect(startDay("12/3 - Dec 20", SEEN)).toBeNull();
  });

  it("gives no start day for AbbVie's either-or check-in", () => {
    // Either day may be the start: taking one could hide the Opening from a Member whose timeframe holds the other.
    expect(startDay("13 or 14 December 2026", SEEN)).toBeNull();
    expect(startDay("Dec 13 or 14, 2026", SEEN)).toBeNull();
    expect(startDay("13/14 December 2026", SEEN)).toBeNull();
  });

  it("reads Syneos's dates, and nothing from its note where a date would be", () => {
    expect(startDay("December 16 to 20, 2026", SEEN)).toBe("2026-12-16");
    expect(startDay("Three groups available. More information available under study details.", SEEN)).toBeNull();
  });

  it("gives no start day when anything stands in front of the date", () => {
    expect(startDay("Day 1 Dec 05", SEEN)).toBeNull();
    expect(startDay("Group 3 Dec 09", SEEN)).toBeNull();
    expect(startDay("Group 3: Dec 09 to Dec 17", SEEN)).toBeNull();
    expect(startDay("Screening Nov 20, check-in Dec 01", SEEN)).toBeNull();
  });

  it("takes the first day of a range however the Clinic joins it, and nothing from a list of days", () => {
    expect(startDay("1-5 Dec", SEEN)).toBe("2026-12-01");
    expect(startDay("5 - 9 Dec", SEEN)).toBe("2026-12-05");
    expect(startDay("Dec 1-10", SEEN)).toBe("2026-12-01");
    expect(startDay("Dec 28 - Jan 3", SEEN)).toBe("2026-12-28");
    expect(startDay("28 Dec to 3 Jan", SEEN)).toBe("2026-12-28");
    expect(startDay("1 and 5 Dec", SEEN)).toBeNull();
    expect(startDay("5, 12 and 19 Dec", SEEN)).toBeNull();
  });

  it("uses the year the Clinic gives, wherever in the range it is written", () => {
    expect(startDay("5 Dec 2027", SEEN)).toBe("2027-12-05");
    expect(startDay("15 Jan 2028", SEEN)).toBe("2028-01-15");
    expect(startDay("December 2, 2026", SEEN)).toBe("2026-12-02");
    expect(startDay("Dec 5-9, 2027", SEEN)).toBe("2027-12-05");
    expect(startDay("5 to 9 Dec 2027", SEEN)).toBe("2027-12-05");
    // The year is written once, after the last date: the first date is the December before it.
    expect(startDay("Dec 28 - Jan 3, 2028", SEEN)).toBe("2027-12-28");
    expect(startDay("Dec 5 - Dec 9, 2027", SEEN)).toBe("2027-12-05");
  });

  it("gives no start day when the dates it reads cannot both be right", () => {
    expect(startDay("Jan 05 2027 - Dec 20 2026", SEEN)).toBeNull();
    expect(startDay("Dec 02 2026 - Feb 30 2027", SEEN)).toBeNull();
    expect(startDay("20 to 23 Dec; sometime in January", SEEN)).toBeNull();
    // No years, and the last day is earlier in the same month: either a slip or a stretch of a year.
    expect(startDay("Dec 10 to Dec 01", SEEN)).toBeNull();
  });

  it("gives no start day when a later stretch begins before the first, or cannot be read as a stretch itself", () => {
    expect(startDay("11 Jan to 3 Feb; 20 to 23 Dec", SEEN)).toBeNull();
    expect(startDay("Dec 1; Dec 5 - Dec 2", SEEN)).toBeNull();
    // In order, as Altasciences Kansas City writes two stays, it is read.
    expect(startDay("20 to 23 Dec; 11 Jan to 3 Feb", SEEN)).toBe("2026-12-20");
  });

  it("gives no start day for a range that runs backwards within a month, year or no year", () => {
    expect(startDay("Dec 5 - Dec 3, 2027", SEEN)).toBeNull();
    // With a year on each date it is a stretch of a year, and says so.
    expect(startDay("Dec 5 2026 - Dec 3 2027", SEEN)).toBe("2026-12-05");
  });

  it("gives no start day when the year is far from the day the Opening was first seen", () => {
    expect(startDay("01/13/99", SEEN)).toBeNull();
    expect(startDay("Dec 02 2036 - Dec 09 2036", SEEN)).toBeNull();
    expect(startDay("Jan 05 2024 - Jan 09 2024", SEEN)).toBeNull();
    // A year back and five on are the edges: a study that began last year, or is planned far ahead.
    expect(startDay("Dec 01 2025 - Jun 01 2027", SEEN)).toBe("2025-12-01");
    expect(startDay("Mar 03 2031", SEEN)).toBe("2031-03-03");
    expect(startDay("Mar 03 2032", SEEN)).toBeNull();
  });

  it("is not put off by a full stop or a stray separator at the end", () => {
    expect(startDay("Dec 01 - Dec 10.", SEEN)).toBe("2026-12-01");
    expect(startDay("Dec 01 to Dec 10; ", SEEN)).toBe("2026-12-01");
  });
});

describe("a Member's timeframe for when an Opening starts", () => {
  const SEEN = "2026-11-23";
  const midDecToJanuary = { from: "2026-12-15", to: "2027-01-31" };

  it("lets through an Opening that starts inside it, the first and last days included", () => {
    expect(startsWithin("Dec 16 2026 - Dec 18 2026", SEEN, midDecToJanuary)).toBe(true);
    expect(startsWithin("4 to 12 Jan", SEEN, midDecToJanuary)).toBe(true);
    expect(startsWithin("Dec 15 2026 - Dec 20 2026", SEEN, midDecToJanuary)).toBe(true);
    expect(startsWithin("01/31/27 - 02/22/27", SEEN, midDecToJanuary)).toBe(true);
  });

  it("holds back one that starts before it or after it, however long it runs", () => {
    expect(startsWithin("Dec 02 2026 - Apr 27 2028", SEEN, midDecToJanuary)).toBe(false);
    expect(startsWithin("Dec 09 to Feb 19", SEEN, midDecToJanuary)).toBe(false);
    expect(startsWithin("Feb 01 2027 - Feb 05 2027", SEEN, midDecToJanuary)).toBe(false);
  });

  it("can be left open at either end", () => {
    const byNewYear = { from: null, to: "2026-12-31" };
    const fromNewYear = { from: "2027-01-01", to: null };
    expect(startsWithin("Dec 02 2026 - Apr 27 2028", SEEN, byNewYear)).toBe(true);
    expect(startsWithin("Jan 06 2027 - Feb 01 2027", SEEN, byNewYear)).toBe(false);
    expect(startsWithin("Jan 06 2027 - Feb 01 2027", SEEN, fromNewYear)).toBe(true);
    expect(startsWithin("Dec 02 2026 - Apr 27 2028", SEEN, fromNewYear)).toBe(false);
  });

  it("always lets through an Opening that gives no start day", () => {
    expect(startsWithin(null, SEEN, midDecToJanuary)).toBe(true);
    expect(startsWithin("To be announced", SEEN, midDecToJanuary)).toBe(true);
  });

  it("lets every Opening through when no timeframe is set", () => {
    expect(startsWithin("Dec 02 2026 - Apr 27 2028", SEEN, { from: null, to: null })).toBe(true);
    expect(startsWithin(null, SEEN, { from: null, to: null })).toBe(true);
  });
});

describe("the timeframe to apply for what a Member has put in the two date boxes", () => {
  const TODAY = "2026-11-24";
  const NONE = { from: null, to: null };

  it("is the days in the boxes, either of which may be empty", () => {
    expect(timeframeOf("", "", TODAY)).toEqual({ frame: NONE, unapplied: null });
    expect(timeframeOf("2027-01-01", "", TODAY)).toEqual({ frame: { from: "2027-01-01", to: null }, unapplied: null });
    expect(timeframeOf("", "2027-01-31", TODAY)).toEqual({ frame: { from: null, to: "2027-01-31" }, unapplied: null });
    expect(timeframeOf("2027-01-01", "2027-01-31", TODAY)).toEqual({ frame: { from: "2027-01-01", to: "2027-01-31" }, unapplied: null });
    expect(timeframeOf("2027-01-01", "2027-01-01", TODAY)).toEqual({ frame: { from: "2027-01-01", to: "2027-01-01" }, unapplied: null });
  });

  it("takes no notice of a box while its year is being typed", () => {
    // Typing 2027 one key at a time, a date box holds the years 0002, 0020 and 0202 on the way.
    expect(timeframeOf("2027-01-01", "0002-01-31", TODAY)).toEqual({ frame: { from: "2027-01-01", to: null }, unapplied: null });
    expect(timeframeOf("2027-01-01", "0020-01-31", TODAY)).toEqual({ frame: { from: "2027-01-01", to: null }, unapplied: null });
    expect(timeframeOf("0202-01-01", "2027-01-31", TODAY)).toEqual({ frame: { from: null, to: "2027-01-31" }, unapplied: null });
    expect(timeframeOf("not a day", "", TODAY)).toEqual({ frame: NONE, unapplied: null });
  });

  it("takes a year near today's, from last year to five years on", () => {
    expect(timeframeOf("2025-06-01", "", TODAY).frame.from).toBe("2025-06-01");
    expect(timeframeOf("2031-06-01", "", TODAY).frame.from).toBe("2031-06-01");
    expect(timeframeOf("2024-06-01", "", TODAY).frame.from).toBeNull();
    expect(timeframeOf("2032-06-01", "", TODAY).frame.from).toBeNull();
  });

  it("applies nothing, and says why, when the first day is after the last", () => {
    expect(timeframeOf("2027-02-10", "2027-01-31", TODAY)).toEqual({ frame: NONE, unapplied: "crossed" });
  });

  it("applies nothing, and says why, once the last day has passed", () => {
    expect(timeframeOf("2026-10-01", "2026-10-31", TODAY)).toEqual({ frame: NONE, unapplied: "passed" });
    expect(timeframeOf("", "2026-11-23", TODAY)).toEqual({ frame: NONE, unapplied: "passed" });
    // The last day itself still counts, and a timeframe with no last day never passes.
    expect(timeframeOf("", "2026-11-24", TODAY)).toEqual({ frame: { from: null, to: "2026-11-24" }, unapplied: null });
    expect(timeframeOf("2026-01-01", "", TODAY)).toEqual({ frame: { from: "2026-01-01", to: null }, unapplied: null });
  });
});
