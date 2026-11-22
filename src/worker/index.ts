import * as Sentry from "@sentry/cloudflare";
import { app } from "./app";
import { checkAndPush } from "./check";
import { plainFetch, readDueSource } from "./openings/read";
import { SOURCES } from "./openings/sources";
import { report, safeReason, sentryOptions } from "./report";

/** The Sentry cron monitor for the hourly Check. It raises the alarm when a Check fails or never runs. */
const MONITOR = "hourly-check";
/** Matches wrangler.jsonc. Each run reads at most one Clinic source, and each source at most once a day. */
const CLINIC_CRON = "47 * * * *";

const handler = {
  fetch: app.fetch,
  /** The hourly Check and its Pushes (wrangler.jsonc triggers.crons). */
  async scheduled(event, env) {
    // The Clinic read has its own trigger, so a Clinic's site failing can never fail a Check.
    if (event.cron === CLINIC_CRON) {
      const r = await readDueSource(env.DB, SOURCES, plainFetch);
      if (r && r.status !== "ok") report(`A Clinic's list could not be read (${r.source}: ${r.status})`, r.detail);
      if (r) console.log(`Clinic read ${r.source}: ${r.status}, ${r.found} Openings`);
      return;
    }
    await Sentry.withMonitor(
      MONITOR,
      async () => {
        const r = await checkAndPush(env);
        // A failed Check throws, so the monitor records the failure and Sentry reports it once.
        if (!r.ok) {
          console.error("Check failed:", r.error);
          throw new Error(`Check failed: ${safeReason(r.error)}`);
        }
        if (r.watchesFailed) report("Some Watches could not be checked", `${r.watchesFailed} of ${r.watchesChecked + r.watchesFailed}`);
        console.log(`Check ok: ${r.watchesChecked} Watches, ${r.alertsCreated} Alerts, ${r.updates ?? 0} Updates, ${r.pushes?.sent ?? 0} Pushes sent`);
      },
      // Matches wrangler.jsonc. Two failures or misses in a row open an issue; one good Check closes it.
      { schedule: { type: "crontab", value: "17 * * * *" }, timezone: "UTC", checkinMargin: 5, maxRuntime: 5, failureIssueThreshold: 2, recoveryThreshold: 1 },
    );
  },
} satisfies ExportedHandler<Env>;

export default Sentry.withSentry(sentryOptions, handler);
