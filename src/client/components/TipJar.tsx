import { useEffect, useState } from "react";
import type { Tips } from "../../shared/tips";
import { api } from "../api";

/**
 * Where to send a tip, if the Member wants to. Shows nothing until the person who runs GuineaPing
 * has set a handle. `lead` says why it is offered here.
 */
export function TipJar({ lead }: { lead: string }) {
  const [tips, setTips] = useState<Tips | null>(null);
  useEffect(() => {
    api<Tips>("/api/tips").then(setTips, () => {});
  }, []);
  if (!tips?.ways.length) return null;
  const who = tips.name ?? "the person who runs GuineaPing";
  return (
    <aside className="tips">
      <p>
        <strong>{lead}</strong> You can tip {who}, who runs GuineaPing. It's optional: everything here works the same whether you tip or not, and GuineaPing never sees who tipped.
      </p>
      <ul>
        {tips.ways.map((w) => (
          <li key={w.service}>
            {w.url ? (
              <a href={w.url} target="_blank" rel="noreferrer" className="button secondary">
                {w.service}
              </a>
            ) : (
              <span className="tip-handle">
                {w.service}: <strong>{w.handle}</strong>
              </span>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
