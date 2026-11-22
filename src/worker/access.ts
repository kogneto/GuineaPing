/**
 * The Cloudflare Access allowlist: which email addresses may sign in at all. GuineaPing's own
 * Members table decides who is a Member; this keeps Access's "Members" policy in step with it, so
 * inviting someone doesn't need the Cloudflare dashboard.
 */

export type AccessConfig = { accountId: string; appId: string; policyId: string; token: string };

type AccessVars = "CF_ACCOUNT_ID" | "ACCESS_APP_ID" | "ACCESS_POLICY_ID" | "CF_ACCESS_TOKEN";

/** Null until the API token secret is set: inviting and removing are then switched off. */
export function accessFrom(env: Env): AccessConfig | null {
  const e = env as Env & Partial<Record<AccessVars, string>>;
  if (!e.CF_ACCOUNT_ID || !e.ACCESS_APP_ID || !e.ACCESS_POLICY_ID || !e.CF_ACCESS_TOKEN) return null;
  return { accountId: e.CF_ACCOUNT_ID, appId: e.ACCESS_APP_ID, policyId: e.ACCESS_POLICY_ID, token: e.CF_ACCESS_TOKEN };
}

type Rule = Record<string, unknown> & { email?: { email?: string } };
type Policy = { name: string; decision: string; include: Rule[]; exclude?: Rule[]; require?: Rule[]; session_duration?: string; precedence?: number };

const isEmailRule = (rule: Rule, email: string) => rule.email?.email?.toLowerCase() === email;

/**
 * Adds `email` to, or takes it off, the policy's list of allowed addresses. Every other rule on
 * the policy is left as it is. Throws if Cloudflare refuses, so callers never report a change
 * that didn't happen.
 */
export async function setAllowed(cfg: AccessConfig, email: string, allowed: boolean, call: typeof fetch = fetch): Promise<void> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/access/apps/${cfg.appId}/policies/${cfg.policyId}`;
  const headers = { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" };
  const current = await call(url, { headers });
  if (!current.ok) throw new Error(`Cloudflare Access answered ${current.status} reading the sign-in list`);
  const policy = ((await current.json()) as { result: Policy }).result;
  const has = policy.include.some((r) => isEmailRule(r, email));
  if (has === allowed) return;
  const include = allowed ? [...policy.include, { email: { email } }] : policy.include.filter((r) => !isEmailRule(r, email));
  // Access refuses a policy that allows nobody; the last address stays until someone else is added.
  if (!include.length) throw new Error("The sign-in list can't be left empty");
  // Send back everything Cloudflare gave us except what it sets itself, so a setting added to the
  // policy later in the dashboard isn't silently reset by the next invite.
  const body: Record<string, unknown> = { ...policy, include };
  for (const readOnly of ["id", "uid", "created_at", "updated_at", "reusable"]) delete body[readOnly];
  const saved = await call(url, { method: "PUT", headers, body: JSON.stringify(body) });
  if (!saved.ok) throw new Error(`Cloudflare Access answered ${saved.status} changing the sign-in list`);
}
