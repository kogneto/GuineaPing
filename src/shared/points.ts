/**
 * Points to check: the lines of a Trial's Entry criteria that mention something a Member's
 * Profile can hold a fact about. Each is shown with the Member's own fact beside it. Nothing here
 * compares the two or reads a range out of the Trial's wording: the Member does that. So a Point
 * to check exists whether or not the Member has given the fact, and whatever the fact is.
 */
import type { Profile } from "./api";
import { criteriaSections, type CriteriaSection } from "./plain";
import { daysAgo, sayDay } from "./days";
import type { PastStudy } from "./waiting";

export const TOPICS = ["bmi", "weight", "nicotine", "donation", "study"] as const;
export type Topic = (typeof TOPICS)[number];

/**
 * What marks a line as being about each topic. Chosen from the wording of the 715 open US
 * healthy-volunteer Phase 1 Trials on 2026-11-22; a simple search, so some lines are missed and a
 * few are caught that only touch the topic. A wrongly caught line costs a glance, no more.
 */
const MENTIONS: Record<Topic, RegExp> = {
  bmi: /\bBMI\b|body[- ]mass[- ]index/i,
  // A weight with a number and a unit, not "weight loss" or a dose in mg/kg.
  weight: /\bweigh(t|s|ing)?\b[^.;]*?\d+(\.\d+)?\s*(kg|kilograms?|lbs?|pounds)\b(?!\s*\/)/i,
  nicotine: /\bsmok|\bnicotine|\btobacco|\bcigar|\bvap(e|es|ing)\b|\bcotinine/i,
  // Giving blood, plasma or platelets. Not eggs, sperm, breast milk or stem cells, which the
  // lines about contraception and donor studies speak of.
  donation: /\b(blood|plasma|platelets?)\b[^.;]{0,80}\bdonat(e|ed|es|ing|ion|ions)\b|\bdonat(e|ed|es|ing|ion|ions)\b[^.;]{0,80}\b(blood|plasma|platelets?)\b/i,
  // Taking part in another study, or having had another study's drug. Not "comply with other
  // study procedures", and not this study's own drug.
  study: new RegExp(
    [
      String.raw`\b(participat(e|ed|es|ing|ion)|(co-?)?enrol\w*)\b[^.;]{0,80}\b(another|other|any)\b[^.;]{0,60}\b(study|studies|trials?)\b(?!\s+(procedures?|requirements?|visits?|related|staff|sites?|restrictions?|assessments?|participation|vaccines?|drugs?|treatments?|interventions?|products?|medications?|period|duration))`,
      String.raw`\b(received?|receipt|taken|treatment with|treated with|use of|dosing|dosed|exposure to|exposed to|administration of)\b[^.;]{0,60}\binvestigational\b[^.;]{0,100}\b(within|prior|before|days|weeks|months|years?|half-li)`,
      String.raw`\banother investigational\b`,
    ].join("|"),
    "i",
  ),
};

/** Lines about contraception and pregnancy name this study's own drug and its last dose; they are never about another study. */
const NOT_ANOTHER_STUDY = /contracepti|pregnan|breast|\bsperm\b|\beggs?\b|\bova\b/i;

export type Point = {
  /** The Trial's own line, unchanged. */
  line: string;
  /** Which list of the Entry criteria it is in. */
  kind: CriteriaSection["kind"];
  topics: Topic[];
};

/** The topics a line of Entry criteria mentions. */
export const topicsOf = (line: string): Topic[] => TOPICS.filter((topic) => MENTIONS[topic].test(line) && !(topic === "study" && NOT_ANOTHER_STUDY.test(line)));

/** A Trial's Points to check, in the order its Entry criteria give them. */
export function pointsToCheck(criteriaText: string): Point[] {
  const points: Point[] = [];
  for (const section of criteriaSections(criteriaText)) {
    for (const line of section.items) {
      const topics = topicsOf(line);
      if (topics.length) points.push({ line, kind: section.kind, topics });
    }
  }
  return points;
}

/** BMI from height in inches and weight in pounds, to one decimal place. */
export function bmiOf(heightIn: number, weightLb: number): number {
  return Math.round(((703 * weightLb) / (heightIn * heightIn)) * 10) / 10;
}

/** How many pounds change a BMI by one point, for someone of this height in inches. */
export function lbPerBmiPoint(heightIn: number): number {
  return Math.round(((heightIn * heightIn) / 703) * 10) / 10;
}

const KG_PER_LB = 0.45359237;
/** What a Member sees beside a Point to check: their own fact, or what to add so there is one. */
export type Fact = { topic: Topic; text: string; missing: boolean };

/**
 * The Member's own fact about a topic, in words. `today` is a plain day where the Member is.
 * It states the fact and nothing else: never whether it meets the Trial's line.
 */
export function factFor(topic: Topic, profile: Profile, pastStudies: PastStudy[], today: string): Fact {
  const missing = (text: string): Fact => ({ topic, text, missing: true });
  const have = (text: string): Fact => ({ topic, text, missing: false });
  switch (topic) {
    case "bmi":
      // The pounds in one BMI point are a fact about the Member's height alone. They let the Member
      // work out how far a range is from them, since weight can change; the app still compares nothing.
      return profile.heightIn && profile.weightLb
        ? have(`Your BMI: ${bmiOf(profile.heightIn, profile.weightLb).toFixed(1)}. At your height, 1 BMI point is about ${lbPerBmiPoint(profile.heightIn).toFixed(1)} lb`)
        : missing("Add your height and weight to your profile to see your BMI here");
    case "weight":
      return profile.weightLb ? have(`Your weight: ${Math.round(profile.weightLb)} lb (${(profile.weightLb * KG_PER_LB).toFixed(1)} kg)`) : missing("Add your weight to your profile to see it here");
    case "nicotine":
      return profile.nicotine ? have(profile.nicotine === "yes" ? "You said you use nicotine" : "You said you don't use nicotine") : missing("Say in your profile whether you use nicotine to see it here");
    case "donation":
      return profile.lastDonationOn
        ? have(`Your last donation: ${sayDay(profile.lastDonationOn)}, ${daysAgo(profile.lastDonationOn, today)}`)
        : missing("Add the day of your last blood or plasma donation to your profile to see it here");
    case "study": {
      const last = [...pastStudies].sort((a, b) => (a.endedOn < b.endedOn ? 1 : -1))[0];
      if (!last) return missing("Add a study you've done to your profile to see when it ended here");
      const dose = pastStudies.map((s) => s.lastDoseOn).filter((d): d is string => !!d).sort().pop();
      return have(`Your last study ended ${sayDay(last.endedOn)}, ${daysAgo(last.endedOn, today)}${dose ? `; your last dose was ${sayDay(dose)}, ${daysAgo(dose, today)}` : ""}`);
    }
  }
}
