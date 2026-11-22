// Generates a VAPID key pair for Web Push.
//   node scripts/vapid-keys.mjs            prints the three lines for .dev.vars
//   node scripts/vapid-keys.mjs --append   appends them to .dev.vars (never overwrites existing keys)
// For production, put each value in a Worker secret instead:
//   npx wrangler secret put VAPID_PRIVATE_KEY   (and VAPID_PUBLIC_KEY, VAPID_SUBJECT)
// Changing the keys later makes every existing Device stop receiving Pushes until it re-subscribes.
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const publicKey = b64url(await crypto.subtle.exportKey("raw", pair.publicKey));
const { d } = await crypto.subtle.exportKey("jwk", pair.privateKey);
const subject = process.env.VAPID_SUBJECT ?? "mailto:you@example.com";
const lines = `VAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${d}\nVAPID_SUBJECT=${subject}\n`;

if (process.argv.includes("--append")) {
  if (existsSync(".dev.vars") && /^VAPID_PRIVATE_KEY=./m.test(readFileSync(".dev.vars", "utf8"))) {
    console.error(".dev.vars already has VAPID keys; leaving them alone.");
    process.exit(1);
  }
  appendFileSync(".dev.vars", `\n${lines}`);
  console.log(`Added VAPID keys to .dev.vars (public key ${publicKey.slice(0, 12)}…).`);
} else {
  process.stdout.write(lines);
}
