import { describe, expect, it } from "vitest";
import { b64url, ecdh, encryptPayload, isPushEndpoint, p256PrivateJwk, vapidAuthorization } from "./webpush";

// RFC 8291 Appendix A, copied from rfc-editor.org (whitespace removed).
const RFC = {
  plaintext: "V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  header: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  ciphertext: "8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ",
};

const rfcEncrypt = () =>
  encryptPayload(b64url.decode(RFC.plaintext), { p256dh: RFC.uaPublic, auth: RFC.auth }, {
    salt: b64url.decode(RFC.salt),
    senderPublic: b64url.decode(RFC.asPublic),
    senderPrivate: b64url.decode(RFC.asPrivate),
  });

describe("RFC 8291 payload encryption", () => {
  it("reproduces the RFC's example byte for byte", async () => {
    const out = await rfcEncrypt();
    // Compare bytes: the 86-byte header isn't a multiple of 3, so base64 strings can't be glued.
    expect([...out]).toEqual([...b64url.decode(RFC.header), ...b64url.decode(RFC.ciphertext)]);
  });

  it("produces something the browser's private key can decrypt", async () => {
    // A fresh salt and sender key, as in real sends; decrypt the way a browser would.
    const body = await encryptPayload(new TextEncoder().encode("hello guinea pig"), { p256dh: RFC.uaPublic, auth: RFC.auth });
    const salt = body.slice(0, 16);
    const senderPublic = body.slice(21, 21 + body[20]!);
    const ua = await crypto.subtle.importKey("jwk", p256PrivateJwk(b64url.decode(RFC.uaPublic), b64url.decode(RFC.uaPrivate)), { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
    const asKey = await crypto.subtle.importKey("raw", senderPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
    const secret = new Uint8Array(await crypto.subtle.deriveBits(ecdh(asKey), ua, 256));
    const hmac = async (key: Uint8Array, data: Uint8Array) =>
      new Uint8Array(await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), data));
    const hkdf = async (s: Uint8Array, ikm: Uint8Array, info: Uint8Array, n: number) =>
      (await hmac(await hmac(s, ikm), new Uint8Array([...info, 1]))).slice(0, n);
    const te = new TextEncoder();
    const ikm = await hkdf(b64url.decode(RFC.auth), secret, new Uint8Array([...te.encode("WebPush: info\0"), ...b64url.decode(RFC.uaPublic), ...senderPublic]), 32);
    const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
    const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
    const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, body.slice(21 + senderPublic.length)));
    expect(new TextDecoder().decode(plain.slice(0, -1))).toBe("hello guinea pig");
    expect(plain.at(-1)).toBe(2);
  });
});

describe("VAPID", () => {
  it("signs a JWT for the push service's origin that verifies with the public key", async () => {
    const vapid = { publicKey: RFC.asPublic, privateKey: RFC.asPrivate, subject: "mailto:test@example.com" };
    const now = Date.parse("2026-11-22T12:00:00Z");
    const auth = await vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", vapid, now);
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(auth)!;
    expect(m[4]).toBe(RFC.asPublic);
    expect(JSON.parse(new TextDecoder().decode(b64url.decode(m[2]!)))).toEqual({
      aud: "https://fcm.googleapis.com",
      exp: now / 1000 + 12 * 3600,
      sub: "mailto:test@example.com",
    });
    const pub = await crypto.subtle.importKey("raw", b64url.decode(RFC.asPublic), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, b64url.decode(m[3]!), new TextEncoder().encode(`${m[1]}.${m[2]}`));
    expect(ok).toBe(true);
  });
});

describe("endpoints", () => {
  it("only accepts https push services browsers use", () => {
    expect(isPushEndpoint("https://fcm.googleapis.com/fcm/send/x")).toBe(true);
    expect(isPushEndpoint("https://web.push.apple.com/QG9")).toBe(true);
    expect(isPushEndpoint("https://wns2-bl2p.notify.windows.com/w/?token=x")).toBe(true);
    expect(isPushEndpoint("http://fcm.googleapis.com/x")).toBe(false);
    expect(isPushEndpoint("https://evil.example/fcm.googleapis.com")).toBe(false);
    expect(isPushEndpoint("https://169.254.169.254/")).toBe(false);
    expect(isPushEndpoint("not a url")).toBe(false);
  });
});
