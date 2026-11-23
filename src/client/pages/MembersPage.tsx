import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { MemberItem, MemberList } from "../../shared/api";
import { api } from "../api";

/** Who is in the group: a section of Settings that only the Organiser is shown. They can invite someone or remove a Member. */
export function Members() {
  const [list, setList] = useState<MemberList | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(() => api<MemberList>("/api/members").then(setList), []);
  useEffect(() => {
    load().catch((e: Error) => setMessage({ kind: "error", text: e.message }));
  }, [load]);

  const run = async (work: () => Promise<string>) => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ kind: "ok", text: await work() });
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const invite = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const to = email.trim();
      await api("/api/members", "POST", { email: to });
      setEmail("");
      await load();
      return `${to} can now sign in. GuineaPing doesn't email anyone, so send them this address yourself: ${location.origin}`;
    });
  };

  const remove = (m: MemberItem) => {
    const question = m.isYou
      ? "Leave GuineaPing? You'll stop getting Alerts, and whoever has been a Member longest after you will run the group. Watches you own pass to whoever has followed them longest, or are deleted if nobody else follows them."
      : `Remove ${m.email}? They'll stop getting Alerts. Watches they own pass to whoever has followed them longest, or are deleted if nobody else follows them.`;
    if (!confirm(question)) return;
    return run(async () => {
      await api(`/api/members/${m.id}`, "DELETE");
      if (m.isYou) {
        location.reload();
        return "You've left GuineaPing.";
      }
      await load();
      return `${m.email} is no longer a Member.`;
    });
  };

  if (!list) return message ? <p className="error">{message.text}</p> : <p className="muted">Loading…</p>;
  return (
    <section>
      <h2>Members</h2>
      <p className="muted">Everyone who can sign in to GuineaPing. Only you see this list, because you run the group. Who follows which Watch is never shown.</p>
      <ul className="watches">
        {list.members.map((m) => (
          <li key={m.id}>
            <div>
              <span className="watch-name">{m.email}</span>
              {m.isYou && <span className="tag">You</span>}
              {m.invitedBy && <div className="muted small">Invited by {m.invitedBy}</div>}
            </div>
            {list.canChange && (
              <button className="danger" disabled={busy} onClick={() => remove(m)}>
                {m.isYou ? "Leave" : "Remove"}
              </button>
            )}
          </li>
        ))}
      </ul>
      {list.canChange ? (
        <form className="form invite" onSubmit={invite}>
          <label>
            Invite someone
            <span className="hint">They sign in with a code sent to this email address.</span>
            <input type="email" required value={email} placeholder="their email address" autoComplete="off" onChange={(e) => setEmail(e.target.value)} />
          </label>
          <p className="actions">
            <button disabled={busy || !email.trim()}>Invite</button>
          </p>
        </form>
      ) : (
        <p className="muted">Inviting and removing Members from here isn't switched on yet. For now it's done in the Cloudflare dashboard.</p>
      )}
      {message && (
        <p className={message.kind === "error" ? "error" : "muted"} role="status">
          {message.text}
        </p>
      )}
    </section>
  );
}
