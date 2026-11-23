/**
 * Tips: ways a Member can thank the person who runs GuineaPing, if they want to. GuineaPing only
 * shows where to send one. It moves no money and never learns who tipped, or how much.
 *
 * The handles are settings on the Worker (README), kept out of the code. Each is checked for
 * shape here, so a mistyped setting shows nothing rather than a broken or misleading link.
 */
export type TipSettings = Partial<Record<"TIP_NAME" | "TIP_CASHAPP" | "TIP_VENMO" | "TIP_PAYPAL" | "TIP_ZELLE", string>>;

/** One way to tip. `url` opens the service; a way with no link (Zelle) shows `handle` to type in the Member's bank app. */
export type TipWay = { service: "Cash App" | "Venmo" | "PayPal" | "Zelle"; handle: string; url: string | null };

export type Tips = { name: string | null; ways: TipWay[] };

const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[A-Za-z]{2,}$/;
const PHONE = /^\+?[\d\s().-]{10,20}$/;

export function tipsFrom(settings: TipSettings): Tips {
  const get = (key: keyof TipSettings) => (settings[key] ?? "").trim();
  const ways: TipWay[] = [];

  const cash = get("TIP_CASHAPP").replace(/^\$/, "");
  if (/^[A-Za-z][A-Za-z0-9_]{0,19}$/.test(cash)) ways.push({ service: "Cash App", handle: `$${cash}`, url: `https://cash.app/$${cash}` });

  const venmo = get("TIP_VENMO").replace(/^@/, "");
  if (/^[A-Za-z0-9_-]{5,30}$/.test(venmo)) ways.push({ service: "Venmo", handle: `@${venmo}`, url: `https://venmo.com/u/${venmo}` });

  // PayPal: a paypal.me name or link opens PayPal; an email address is shown to send to from PayPal.
  const paypal = get("TIP_PAYPAL");
  const me = /^(?:https:\/\/)?(?:www\.)?paypal\.me\/([A-Za-z0-9]{1,20})\/?$/i.exec(paypal)?.[1];
  if (me) ways.push({ service: "PayPal", handle: `paypal.me/${me}`, url: `https://paypal.me/${me}` });
  else if (EMAIL.test(paypal)) ways.push({ service: "PayPal", handle: paypal, url: null });

  // Zelle has no link of its own: it is sent from the Member's bank app, to an email address or phone number.
  const zelle = get("TIP_ZELLE");
  if (EMAIL.test(zelle) || PHONE.test(zelle)) ways.push({ service: "Zelle", handle: zelle, url: null });

  const name = get("TIP_NAME").slice(0, 40);
  return { name: /^[\p{L}\p{N} .'-]+$/u.test(name) ? name : null, ways };
}
