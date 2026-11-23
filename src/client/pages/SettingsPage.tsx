import { useState } from "react";
import type { Me } from "../../shared/api";
import { api } from "../api";
import { Link } from "../router";
import { THEMES, THEME_LABELS, setTheme, storedTheme, type Theme } from "../theme";
import { Members } from "./MembersPage";

/** How GuineaPing looks on this device, and, for the Organiser alone, who is in the group. */
export function SettingsPage({ me }: { me: Me | null }) {
  const [theme, setChosen] = useState<Theme>(storedTheme);
  const [error, setError] = useState<string | null>(null);
  const choose = (t: Theme) => {
    setTheme(t);
    setChosen(t);
  };
  const leave = async () => {
    if (!me || !confirm("Leave GuineaPing? You'll stop getting Alerts. Watches you own pass to whoever has followed them longest, or are deleted if nobody else follows them.")) return;
    try {
      await api(`/api/members/${me.memberId}`, "DELETE");
      location.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <h1>Settings</h1>
      <section>
        <h2>Appearance</h2>
        <p className="views" role="group" aria-label="Light or dark">
          {THEMES.map((t) => (
            <button type="button" key={t} className="chip" aria-pressed={theme === t} onClick={() => choose(t)}>
              {THEME_LABELS[t]}
            </button>
          ))}
        </p>
        <p className="muted small">Kept on this phone or computer only, so each of your devices can differ.</p>
      </section>
      <section>
        <h2>You</h2>
        <nav className="settings-list" aria-label="Your settings">
          <Link to="/devices">
            <span>
              <strong>Notifications</strong>
              <span className="muted small">Turn Pushes on for this phone or computer, and see your Devices.</span>
            </span>
            <span aria-hidden="true">›</span>
          </Link>
          <Link to="/profile">
            <span>
              <strong>Your profile</strong>
              <span className="muted small">ZIP code, age and what you'd join, plus your past studies and waiting period.</span>
            </span>
            <span aria-hidden="true">›</span>
          </Link>
        </nav>
      </section>
      {me?.organiser && <Members />}
      {me && !me.organiser && (
        <section>
          <h2>Leave the group</h2>
          <p className="muted">You'll stop getting Alerts and can no longer sign in. The person who runs GuineaPing can invite you back.</p>
          <p className="actions">
            <button type="button" className="danger" onClick={leave}>
              Leave GuineaPing
            </button>
          </p>
          {error && <p className="error">{error}</p>}
        </section>
      )}
    </>
  );
}
