import { Link } from "../router";
import { useCallback, useEffect, useState } from "react";
import type { Device } from "../../shared/api";
import { ago, api, ApiError } from "../api";
import { Illustration } from "../components/Illustration";
import { currentSubscription, deviceLabel, pushSupport, subscribe } from "../push";

/** The Member's Devices: where their Pushes go. The Alert list works whether or not they have any. */
export function DevicesPage() {
  const support = pushSupport();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [publicKey, setPublicKey] = useState<string | null | undefined>(undefined);
  const [here, setHere] = useState<PushSubscription | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sub = await currentSubscription().catch(() => null);
    setHere(sub);
    const query = sub ? `?endpoint=${encodeURIComponent(sub.endpoint)}` : "";
    setDevices(await api<Device[]>(`/api/devices${query}`));
  }, []);

  useEffect(() => {
    load().catch((e: Error) => setMessage({ kind: "error", text: e.message }));
    api<{ publicKey: string | null }>("/api/push/key").then((r) => setPublicKey(r.publicKey), () => setPublicKey(null));
  }, [load]);

  const thisDeviceRegistered = !!devices?.some((d) => d.thisDevice);

  const turnOn = async () => {
    if (!publicKey) return;
    setBusy("on");
    setMessage(null);
    try {
      const sub = await subscribe(publicKey);
      const json = sub.toJSON();
      await api("/api/devices", "POST", { endpoint: json.endpoint, keys: json.keys, label: deviceLabel() });
      await load();
      setMessage({ kind: "ok", text: "Notifications are on for this device. Try “Send test” to check." });
    } catch (e) {
      const why = (e as Error).message;
      setMessage({
        kind: "error",
        text:
          why === "denied"
            ? "Notifications are blocked for GuineaPing in this browser. Allow them in the browser's site settings, then try again."
            : why === "dismissed"
              ? // The prompt was closed, or the browser never showed it: Chrome quietly holds back requests from
                // new sites and shows only a small bell or "Notifications blocked" note.
                "Notifications weren't allowed. If you didn't see a question, your browser held it back: tap the icon to the left of the web address, open Permissions or Site settings, set Notifications to Allow, then tap the button again."
              : `Couldn't turn notifications on: ${why}`,
      });
    } finally {
      setBusy(null);
    }
  };

  const test = async (d: Device) => {
    setBusy(`test-${d.id}`);
    setMessage(null);
    try {
      await api(`/api/devices/${d.id}/test`, "POST");
      setMessage({ kind: "ok", text: `Test sent to ${d.label}. It should appear within a few seconds.` });
      await load();
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
      if (e instanceof ApiError && e.status === 410) await load();
    } finally {
      setBusy(null);
    }
  };

  const remove = async (d: Device) => {
    if (!confirm(`Stop sending notifications to ${d.label}?`)) return;
    setBusy(`rm-${d.id}`);
    try {
      await api(`/api/devices/${d.id}`, "DELETE");
      if (d.thisDevice) await here?.unsubscribe().catch(() => {});
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="narrow">
      <p className="crumb">
        <Link to="/settings">← Settings</Link>
      </p>
      <div className="heading-row">
        <Illustration name="notifications" size="xs" />
        <h1>Devices</h1>
      </div>
      <p className="muted">
        Phones and browsers that get a notification when a new trial matches your Watches. Every Alert also stays in your Alert list, so nothing is lost if a
        notification is missed.
      </p>

      {message && (
        <p className={message.kind === "error" ? "error" : "success"} role="status">
          {message.text}
        </p>
      )}

      <section className="this-device">
        <h2>This device</h2>
        {support.kind === "needs-home-screen" ? (
          <div className="callout">
            <div>
              <p>On iPhone and iPad, notifications only work once GuineaPing is on your Home Screen:</p>
              <ol className="steps">
                <li>
                  Tap the <strong>Share</strong> button in Safari.
                </li>
                <li>
                  Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
                </li>
                <li>Open GuineaPing from the Home Screen and come back to this page.</li>
              </ol>
            </div>
          </div>
        ) : support.kind === "unsupported" ? (
          <p className="muted">This browser can't receive notifications. You'll still see every Alert in your Alert list.</p>
        ) : publicKey === null ? (
          <p className="muted">Notifications aren't set up on the server yet.</p>
        ) : thisDeviceRegistered ? (
          <p>Notifications are on for this device.</p>
        ) : (
          <button onClick={turnOn} disabled={busy !== null || publicKey === undefined}>
            {busy === "on" ? "Turning on…" : "Turn on notifications here"}
          </button>
        )}
      </section>

      <h2>Your devices</h2>
      {!devices ? (
        <p className="muted">Loading…</p>
      ) : !devices.length ? (
        <p className="muted">None yet. Turn notifications on from each phone or computer you want them on.</p>
      ) : (
        <ul className="devices">
          {devices.map((d) => (
            <li key={d.id}>
              <div>
                <span className="device-name">{d.label}</span>
                {d.thisDevice && <span className="tag">This device</span>}
                <div className="muted small">
                  Added {ago(d.createdAt)}
                  {d.lastSentAt ? ` · last notified ${ago(d.lastSentAt)}` : ""}
                </div>
              </div>
              <div className="device-actions">
                <button className="secondary" onClick={() => test(d)} disabled={busy !== null}>
                  {busy === `test-${d.id}` ? "Sending…" : "Send test"}
                </button>
                <button className="danger" onClick={() => remove(d)} disabled={busy !== null}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
