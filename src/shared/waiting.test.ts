import { describe, expect, it } from "vitest";
import { addDays, daysUntil, freeOn, isDay, normalizePastStudy } from "./waiting";

describe("waiting periods", () => {
  it("adds days to a plain day, across months, years and leap days", () => {
    expect(addDays("2026-11-22", 30)).toBe("2026-12-22");
    expect(addDays("2026-12-15", 30)).toBe("2027-01-14");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDays("2026-11-22", 0)).toBe("2026-11-22");
  });

  it("counts from the later of the end of the study and the last dose", () => {
    expect(freeOn("2026-11-01", null, 30)).toBe("2026-12-01");
    expect(freeOn("2026-11-01", "2026-10-20", 30)).toBe("2026-12-01");
    expect(freeOn("2026-11-01", "2026-11-05", 30)).toBe("2026-12-05");
    expect(freeOn("2026-11-01", null, 90)).toBe("2027-01-30");
  });

  it("counts the days left", () => {
    expect(daysUntil("2026-12-01", "2026-11-22")).toBe(9);
    expect(daysUntil("2026-11-22", "2026-11-22")).toBe(0);
    expect(daysUntil("2026-11-20", "2026-11-22")).toBe(-2);
  });

  it("knows a real day from something that only looks like one", () => {
    expect(isDay("2026-11-22")).toBe(true);
    expect(isDay("2026-02-30")).toBe(false);
    expect(isDay("22/11/2026")).toBe(false);
    expect(isDay(20261122)).toBe(false);
  });

  it("checks what a Member typed, with 30 days when they give no number", () => {
    const today = "2026-11-22";
    expect(normalizePastStudy({ label: "  Celerion  ", endedOn: "2026-11-01" }, today)).toEqual({ label: "Celerion", endedOn: "2026-11-01", lastDoseOn: null, waitDays: 30 });
    expect(normalizePastStudy({ endedOn: "2026-11-01", lastDoseOn: "2026-10-28", waitDays: "90" }, today)).toEqual({ label: "", endedOn: "2026-11-01", lastDoseOn: "2026-10-28", waitDays: 90 });
    expect(normalizePastStudy({ endedOn: "2026-11-01", waitDays: 0 }, today)).toMatchObject({ waitDays: 0 });
    for (const bad of [{}, { endedOn: "soon" }, { endedOn: "2010-01-01" }, { endedOn: "2028-01-01" }, { endedOn: "2026-11-01", lastDoseOn: "x" }, { endedOn: "2026-11-01", waitDays: 400 }, { endedOn: "2026-11-01", waitDays: 1.5 }, { endedOn: "2026-11-01", waitDays: -1 }]) {
      expect(normalizePastStudy(bad, today), JSON.stringify(bad)).toHaveProperty("error");
    }
  });
});
