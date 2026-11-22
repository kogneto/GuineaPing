import { describe, expect, it } from "vitest";
import { safeReason, sentryOptions } from "./report";

describe("what is reported to Sentry", () => {
  it("keeps only ClinicalTrials.gov's status, since the rest can repeat a Watch's conditions", () => {
    expect(safeReason(new Error('ClinicalTrials.gov answered 400: bad query "HIV" near 02139'))).toBe("ClinicalTrials.gov answered 400");
    expect(safeReason(new Error("Push to fcm.googleapis.com failed: 503"))).toBe("Push to fcm.googleapis.com failed: 503");
    expect(safeReason("first line\nsecond line")).toBe("first line");
    expect(safeReason("x".repeat(500))).toHaveLength(120);
    expect(safeReason(undefined)).toBe("");
  });

  it("sends nothing about who asked or what they sent, and nothing at all from localhost", () => {
    const live = sentryOptions({ SENTRY_DSN: "https://k@o1.ingest.sentry.io/1", DEV_AUTH: "false" } as unknown as Env);
    expect(live).toMatchObject({
      enabled: true,
      tracesSampleRate: 0,
      dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false, stackFrameVariables: false },
    });
    expect(sentryOptions({ SENTRY_DSN: "https://k@o1.ingest.sentry.io/1", DEV_AUTH: "true" } as unknown as Env).enabled).toBe(false);
    expect(sentryOptions({ DEV_AUTH: "false" } as unknown as Env).enabled).toBe(false);
  });
});
