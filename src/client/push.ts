/** This browser's side of Web Push: support checks, the service worker, and the subscription. */

export type PushSupport =
  | { kind: "ok" }
  /** iPhone/iPad Safari only allows push from an app added to the Home Screen. */
  | { kind: "needs-home-screen" }
  | { kind: "unsupported" };

const isAppleMobile = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function pushSupport(): PushSupport {
  const capable = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (isAppleMobile() && !isStandalone()) return { kind: "needs-home-screen" };
  return capable ? { kind: "ok" } : { kind: "unsupported" };
}

export function registration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(() => navigator.serviceWorker.ready);
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport().kind !== "ok") return null;
  return (await registration()).pushManager.getSubscription();
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const s = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Asks permission (must follow a tap) and subscribes this browser with the server's key. */
export async function subscribe(publicKey: string): Promise<PushSubscription> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error(permission === "denied" ? "denied" : "dismissed");
  const reg = await registration();
  const existing = await reg.pushManager.getSubscription();
  // A subscription made with an older key can't receive our Pushes; start over.
  if (existing) {
    const key = existing.options.applicationServerKey;
    const same = key && new Uint8Array(key).join() === keyBytes(publicKey).join();
    if (same) return existing;
    await existing.unsubscribe();
  }
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
}

/** "iPhone · Safari", "Windows · Chrome": a name the Member will recognise in their Devices list. */
export function deviceLabel(ua = navigator.userAgent): string {
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? (navigator.maxTouchPoints > 1 ? "iPad" : "Mac") : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return isStandalone() ? `${os} · Home Screen app` : `${os} · ${browser}`;
}
