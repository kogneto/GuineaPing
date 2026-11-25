import { text } from "./html";
import type { Found, Page, Source } from "./types";

/** Where both of Parexel's lists send their form: its Salesforce site's data call. */
const CALL = "https://pxlcrs.my.site.com/portal/s/sfsites/aura?r=2&aura.ApexAction.execute=5";
/**
 * The Salesforce version the lists' pages named on 2026-11-24. After a Salesforce update the call
 * answers that the page is out of date, the read finds nothing, and this needs the new version.
 */
const CONTEXT = '{"mode":"PROD","fwuid":"ZjkyMTR4bndvTWpXNFdfN1kxVEkxd2tVMjdnTGFERUU2S3FfSVdrcU92bkExNS4zLjE2MDEx","app":"siteforce:communityApp","loaded":{"APPLICATION@markup://siteforce:communityApp":"1919_p_UNHwnUfNHtXRD9ejXneg"},"dn":[],"globals":{},"uad":true}';

/** The five things each list's page asks for, as it asks for them. Only the list (the second) is read. */
function message(loc: string): string {
  const action = (id: number, method: string, params: Record<string, unknown>) => ({
    id: `${id};a`,
    descriptor: "aura://ApexActionController/ACTION$execute",
    callingDescriptor: "UNKNOWN",
    params: { namespace: "", classname: "trialsListingController", method, params, cacheable: false, isContinuation: false },
  });
  return JSON.stringify({
    actions: [
      action(117, "getConsentForm", { epcu: loc, lang: "en_US" }),
      action(118, "getPortalContentData", { loc, lang: "en_US", isfeatured: null }),
      action(119, "getPickValues", { sobjectName: "Program__c", filterFieldName: "Gender__c" }),
      action(120, "getPickValues", { sobjectName: "Program__c", filterFieldName: "Smoking_Status__c" }),
      action(121, "getPickValues", { sobjectName: "Program__c", filterFieldName: "Health_Status__c" }),
    ],
  });
}

/** Each list, the Clinic its studies are at, and the page Members open. */
const LISTS = [
  { loc: "BAL", clinicId: "parexel-baltimore", list: "https://pxlcrs.my.site.com/portal/s/trials-listing-bal?loc=BAL&language=en_US" },
  { loc: "LA", clinicId: "parexel-glendale", list: "https://pxlcrs.my.site.com/portal/s/triallistla?loc=LA&language=en_US" },
];

/** The form a list's page sends, with no sign-in: its token is "null", as the page's own is. */
const form = (loc: string, list: string): Page => ({
  url: CALL,
  form: { message: message(loc), "aura.context": CONTEXT, "aura.pageURI": new URL(list).pathname + "?language=en_US", "aura.token": "null" },
});

type Study = Record<string, unknown>;
const str = (study: Study, name: string) => (typeof study[name] === "string" ? (study[name] as string) : "");

/** The studies in one answer: the action that returned a list of them, found by its shape. */
function studiesIn(answer: string): Study[] {
  let value: unknown;
  try {
    value = JSON.parse(answer);
  } catch {
    return [];
  }
  const actions = (value as { actions?: unknown } | null)?.actions;
  if (!Array.isArray(actions)) return [];
  for (const action of actions as { state?: unknown; returnValue?: { returnValue?: unknown } | null }[]) {
    const list = action?.state === "SUCCESS" ? action.returnValue?.returnValue : null;
    if (Array.isArray(list) && list.some((s) => s && typeof s === "object" && "trialName" in s)) return list.filter((s): s is Study => !!s && typeof s === "object");
  }
  return [];
}

/**
 * Parexel, Baltimore and Glendale: each list's page sends a form to Parexel's Salesforce site and
 * draws the studies it gets back. GuineaPing sends the same form, with no sign-in and no cookies.
 * The dates are not read: the lists say not to show them, and some are long past.
 */
export const parexel: Source = {
  id: "parexel",
  pages: LISTS.map(({ loc, list }) => form(loc, list)),
  parse(answers) {
    const found: Found[] = [];
    for (const [i, { clinicId, list }] of LISTS.entries()) {
      for (const study of studiesIn(answers[i] ?? "")) {
        const key = str(study, "rpcid").trim();
        const title = text(str(study, "trialName"));
        if (!key || !title) continue;
        const details = text(str(study, "shortDetails"));
        const population = text(/<p\b[^>]*>([\s\S]*?)<\/p>/.exec(str(study, "shortDetails"))?.[1] ?? "").replace(/^Population\s*:?\s*/i, "");
        const ages = text(str(study, "ages"));
        const stay = /\b(?:involves|includes)\b(?:\s+up\s+to)?\s*:\s*(.+)$/i.exec(details)?.[1] ?? null;
        found.push({
          key,
          clinicId,
          title,
          pay: text(str(study, "payment")) || null,
          when: null,
          stay,
          who: [population, ages && !population.includes(ages.replace(/^Ages?\s+/i, "")) ? ages : ""].filter(Boolean).join(", ") || null,
          code: text(str(study, "trialNumber")).replace(/﻿/g, "").trim() || text(str(study, "studyName")) || null,
          url: list,
        });
      }
    }
    return found;
  },
};
