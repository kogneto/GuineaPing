import { describe, expect, it } from "vitest";
import { CLINICS } from "../../shared/clinics";
import { SOURCES } from "./sources";

describe("the sources that are read", () => {
  it("each has a reader, and each reader has a Clinic", () => {
    const wanted = [...new Set(CLINICS.map((c) => c.source).filter(Boolean))].sort();
    expect(SOURCES.map((s) => s.id).sort()).toEqual(wanted);
  });
  it("are fetched over https only", () => {
    for (const s of SOURCES) for (const page of s.pages) expect(page).toMatch(/^https:\/\//);
  });
  it("never include a Clinic whose terms forbid automated tools", () => {
    const hosts = SOURCES.flatMap((s) => s.pages).map((p) => new URL(p).host);
    for (const no of ["iconstudies.com", "cenexelresearch.com", "cenexelclinicaltrials.com", "trialmed.com", "www.medpace.com", "www.parexel.com", "pxlcrs.my.site.com", "www.us-participants.syneoshealth.com", "drvince.com", "www.k2medicalresearch.com"]) expect(hosts).not.toContain(no);
  });
});
