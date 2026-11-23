import { useEffect, useState } from "react";
import type { Profile } from "../../shared/api";
import { todayHere } from "../../shared/days";
import { factFor, pointsToCheck, type Point } from "../../shared/points";
import type { PastStudy } from "../../shared/waiting";
import { api } from "../api";
import { Link } from "../router";

const WHERE: Record<Point["kind"], string> = { include: "Under “you may be able to join if”", exclude: "Under “you can't join if”", other: "From what the study asks for" };

/**
 * A Trial's Points to check: its own lines about things the Member's Profile can hold, each with
 * the Member's fact beside it. The facts come from the Profile as it is now and are worked out in
 * the browser; nothing about them is stored with the Alert. No verdict is given.
 */
export function PointsToCheck({ text }: { text: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pastStudies, setPastStudies] = useState<PastStudy[]>([]);
  useEffect(() => {
    api<Profile>("/api/profile").then(setProfile, () => {});
    api<PastStudy[]>("/api/past-studies").then(setPastStudies, () => {});
  }, []);

  const points = pointsToCheck(text);
  if (!points.length) return null;
  const now = todayHere();
  return (
    <section>
      <h2>Points to check</h2>
      <p className="muted small">
        Lines from the study's own rules that touch something in <Link to="/profile">your profile</Link>, with your own fact beside each. GuineaPing doesn't compare them: read the study's line against your fact. Only the study team can say whether you qualify.
      </p>
      <ul className="points">
        {points.map((point, i) => (
          <li key={i}>
            <p className="meta">{WHERE[point.kind]}</p>
            <p>{point.line}</p>
            {profile &&
              point.topics.map((topic) => {
                const fact = factFor(topic, profile, pastStudies, now);
                return (
                  <p key={topic} className={fact.missing ? "fact missing" : "fact"}>
                    {fact.missing ? <Link to="/profile">{fact.text}</Link> : fact.text}
                  </p>
                );
              })}
          </li>
        ))}
      </ul>
    </section>
  );
}
