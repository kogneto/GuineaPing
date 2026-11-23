/**
 * Points to check: the lines of a Trial's Entry criteria that mention something a Member's
 * Profile can hold a fact about. Each is shown with the Member's own fact beside it. Nothing here
 * compares the two or reads a range out of the Trial's wording: the Member does that. So a Point
 * to check exists whether or not the Member has given the fact, and whatever the fact is.
 */
import type { Profile } from "./api";
import { criteriaSections, type CriteriaSection } from "./plain";
import { daysUntil, type PastStudy } from "./waiting";

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
  donation: /\bdonat(e|ed|es|ing|ion|ions)\b/i,
  // Having recently taken part in another study, or taken another study's drug.
  study:
    /\b(another|other|any|previous|prior)\s+(investigational|experimental|clinical|interventional|research)?\s*(study|studies|trial|trials)\b|\binvestigational\s+(drug|product|medicinal product|agent|device|medication|therapy|vaccine)|\bparticipat\w*\s+in\s+(a|an|another|any|other)\b[^.;]*\b(study|studies|trial|trials)\b/i,
};

export type Point = {
  /** The Trial's own line, unchanged. */
  line: string;
  /** Which list of the Entry criteria it is in. */
  kind: CriteriaSection["kind"];
  topics: Topic[];
};

/** The topics a line of Entry criteria mentions. */
export const topicsOf = (line: string): Topic[] => TOPICS.filter((topic) => MENTIONS[topic].test(line));

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

const KG_PER_LB = 0.45359237;
const sayDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const daysAgo = (day: string, today: string) => {
  const n = -daysUntil(day, today);
  return n === 0 ? "today" : n === 1 ? "1 day ago" : n > 1 ? `${n} days ago` : n === -1 ? "in 1 day" : `in ${-n} days`;
};

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
      return profile.heightIn && profile.weightLb ? have(`Your BMI: ${bmiOf(profile.heightIn, profile.weightLb).toFixed(1)}`) : missing("Add your height and weight to your profile to see your BMI here");
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
