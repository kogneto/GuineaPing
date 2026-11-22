import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { verifyWithJwks } from "hono/jwt";
import type { Me } from "../shared/api";

export type AppEnv = { Bindings: Env; Variables: { me: Me } };

/** The DEV_AUTH bypass applies on this exact host only. */
const DEV_HOST = "localhost";

/**
 * The email Cloudflare Access verified. Access adds the JWT header on the paths it protects; the
 * browser also carries it as the CF_Authorization cookie.
 */
async function accessEmail(c: Context<AppEnv>): Promise<string | null> {
  const env = c.env;
  if (env.DEV_AUTH === "true" && new URL(c.req.url).hostname === DEV_HOST) {
    return c.req.header("X-Dev-Email") ?? "dev@localhost";
  }
  const token = c.req.header("Cf-Access-Jwt-Assertion") ?? getCookie(c, "CF_Authorization");
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  try {
    const payload = await verifyWithJwks(
      token,
      {
        jwks_uri: `https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`,
        allowedAlgorithms: ["RS256"],
        verification: { iss: `https://${env.ACCESS_TEAM_DOMAIN}`, aud: env.ACCESS_AUD },
      },
      { cf: { cacheTtl: 3600, cacheEverything: true } },
    );
    return typeof payload.email === "string" && payload.email ? payload.email : null;
  } catch {
    return null;
  }
}

/** Anyone Access let in is a Member; the first visit creates their record. */
async function memberFor(db: D1Database, rawEmail: string): Promise<Me> {
  const email = rawEmail.trim().toLowerCase();
  await db
    .prepare("INSERT INTO members (id, email, created_at) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING")
    .bind(crypto.randomUUID(), email, new Date().toISOString())
    .run();
  const row = await db.prepare("SELECT id FROM members WHERE email = ?").bind(email).first<{ id: string }>();
  return { memberId: row!.id, email };
}

export const requireMember: MiddlewareHandler<AppEnv> = async (c, next) => {
  const email = await accessEmail(c);
  if (!email) return c.json({ error: "Not signed in" }, 401);
  c.set("me", await memberFor(c.env.DB, email));
  await next();
};

export const isDevRequest = (c: Context<AppEnv>) =>
  c.env.DEV_AUTH === "true" && new URL(c.req.url).hostname === DEV_HOST;
