/**
 * Telling whoever runs GuineaPing that something broke, through Sentry. Only what is needed to
 * know that it broke leaves the Worker: never a Member's email address, a Watch's criteria, a
 * Profile, or the contents of a request.
 */
import * as Sentry from "@sentry/cloudflare";

type SentryVars = "SENTRY_DSN";

/**
 * Sentry's settings. Off on localhost and wherever no DSN is set. Everything that could carry
 * personal or health information is switched off: who the request came from, cookies (the Access
 * sign-in), headers, request and response bodies (Watches, Profiles, notes), and query strings.
 */
export function sentryOptions(env: Env) {
  const dsn = (env as Env & Partial<Record<SentryVars, string>>).SENTRY_DSN;
  return {
    dsn,
    enabled: !!dsn && env.DEV_AUTH !== "true",
    // Errors only: no performance traces.
    tracesSampleRate: 0,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
  };
}

/**
 * A short reason that is safe to send. ClinicalTrials.gov's error text can repeat the query, and
 * so a Watch's conditions, so only its status is kept.
 */
export function safeReason(err: unknown): string {
  const text = String(err instanceof Error ? err.message : (err ?? ""));
  const upstream = /^ClinicalTrials\.gov answered \d+/.exec(text);
  return (upstream ? upstream[0] : (text.split("\n")[0] ?? "")).slice(0, 120);
}

/** Logs a problem and reports it. `what` is a fixed phrase, so the same problem groups together. */
export function report(what: string, err?: unknown): void {
  console.error(`${what}:`, err);
  Sentry.captureMessage(what, { level: "error", extra: { reason: safeReason(err) } });
}
