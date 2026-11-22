/**
 * Web Push, written against WebCrypto so it runs on Workers (the `web-push` npm package needs
 * Node's crypto). Payloads are encrypted per RFC 8291 (aes128gcm, RFC 8188) and requests are
 * signed per RFC 8292 (VAPID).
 */

export const b64url = {
  encode(bytes: ArrayBuffer | Uint8Array): string {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let s = "";
    for (const b of u8) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  decode(text: string): Uint8Array {
    const s = text.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  },
};

const enc = new TextEncoder();

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** HKDF-SHA-256 extract-and-expand, for outputs up to one hash block (all Web Push needs). */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prkKey = await crypto.subtle.importKey("raw", salt, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prk = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, ikm));
  const expandKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const t1 = new Uint8Array(await crypto.subtle.sign("HMAC", expandKey, concat(info, new Uint8Array([1]))));
  return t1.slice(0, length);
}

/** A P-256 private key from its 32-byte scalar and 65-byte uncompressed public point. */
export function p256PrivateJwk(publicKey: Uint8Array, privateKey: Uint8Array): JsonWebKey {
  return {
    kty: "EC",
    crv: "P-256",
    x: b64url.encode(publicKey.slice(1, 33)),
    y: b64url.encode(publicKey.slice(33, 65)),
    d: b64url.encode(privateKey),
    ext: true,
  };
}

/**
 * ECDH parameters. The runtime takes the standard `public` field; @cloudflare/workers-types
 * spells it `$public`, so the type is asserted here, once.
 */
export const ecdh = (publicKey: CryptoKey) => ({ name: "ECDH", public: publicKey }) as unknown as SubtleCryptoDeriveKeyAlgorithm;

export type Subscription = { endpoint: string; p256dh: string; auth: string };

/**
 * Encrypts `plaintext` for one browser subscription (RFC 8291). `salt` and `senderKeys` are only
 * given in tests, to reproduce the RFC's example; normally both are fresh for every message.
 */
export async function encryptPayload(
  plaintext: Uint8Array,
  sub: { p256dh: string; auth: string },
  testing?: { salt: Uint8Array; senderPublic: Uint8Array; senderPrivate: Uint8Array },
): Promise<Uint8Array> {
  const uaPublic = b64url.decode(sub.p256dh);
  const authSecret = b64url.decode(sub.auth);
  const salt = testing?.salt ?? crypto.getRandomValues(new Uint8Array(16));

  let senderPrivate: CryptoKey;
  let senderPublic: Uint8Array;
  if (testing) {
    senderPrivate = await crypto.subtle.importKey("jwk", p256PrivateJwk(testing.senderPublic, testing.senderPrivate), { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
    senderPublic = testing.senderPublic;
  } else {
    const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
    senderPrivate = pair.privateKey;
    senderPublic = new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
  }

  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(ecdh(uaKey), senderPrivate, 256));

  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, senderPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  // One record: the plaintext plus the 0x02 last-record delimiter.
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(plaintext, new Uint8Array([2]))));

  const header = new Uint8Array(16 + 4 + 1 + senderPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = senderPublic.length;
  header.set(senderPublic, 21);
  return concat(header, ciphertext);
}

export type Vapid = {
  /** Uncompressed P-256 public key, base64url. Browsers subscribe with this. */
  publicKey: string;
  /** The 32-byte private scalar, base64url. */
  privateKey: string;
  /** A mailto: or https: contact for push services. */
  subject: string;
};

/** The VAPID Authorization header for one push service origin (RFC 8292), valid 12 hours. */
export async function vapidAuthorization(endpoint: string, vapid: Vapid, now = Date.now()): Promise<string> {
  const header = b64url.encode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url.encode(
    enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject })),
  );
  const key = await crypto.subtle.importKey(
    "jwk",
    p256PrivateJwk(b64url.decode(vapid.publicKey), b64url.decode(vapid.privateKey)),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64url.encode(signature)}, k=${vapid.publicKey}`;
}

/**
 * Push services browsers actually use. Endpoints come from Members' browsers, so the Worker only
 * POSTs to these hosts, never to an arbitrary URL.
 */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /\.notify\.windows\.com$/, /^push\.services\.mozilla\.com$/];

export function isPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && PUSH_HOSTS.some((h) => h.test(url.hostname));
  } catch {
    return false;
  }
}

export type PushMessage = { title: string; body: string; url: string; tag?: string };

/** What happened to one push. `gone` means the subscription no longer exists and the Device should go. */
export type PushOutcome = "sent" | "gone" | "failed";

export async function sendPush(sub: Subscription, message: PushMessage, vapid: Vapid, post: typeof fetch = fetch): Promise<PushOutcome> {
  if (!isPushEndpoint(sub.endpoint)) return "gone";
  const body = await encryptPayload(enc.encode(JSON.stringify(message)), sub);
  const res = await post(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, vapid),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(7 * 24 * 3600),
      Urgency: "normal",
    },
    body,
  });
  if (res.ok) return "sent";
  if (res.status === 404 || res.status === 410) return "gone";
  // 401/403 point at our VAPID keys, not the Device; keep it and say so.
  console.error(`Push to ${new URL(sub.endpoint).host} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return "failed";
}
