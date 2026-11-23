import * as Sentry from "@sentry/cloudflare";
import { app } from "./app";
import { checkAndPush } from "./check";
import { pushNewOpenings } from "./openings/announce";
import { plainFetch, readDueSource } from "./openings/read";
import { SOURCES } from "./openings/sources";
import { vapidFrom } from "./push";
import { report, safeReason, sentryOptions } from "./report";

/** The Sentry cron monitor for the hourly Check. It raises the alarm when a Check fails or never runs. */
const MONITOR = "hourly-check";
/**
 * Matches wrangler.jsonc. Every other trigger there is a Clinic read: one Clinic source per run,
 * each source at most once an hour. Telling the Check apart by its own schedule means a mistyped
 * Clinic schedule can never set off extra Checks.
 */
const CHECK_CRON = "17 * * * *";

const handler = {
  fetch: app.fetch,
  /** The hourly Check and its Pushes (wrangler.jsonc triggers.crons). */
  async scheduled(event, env) {
    // The Clinic read has its own trigger, so a Clinic's site failing can never fail a Check.
    if (event.cron !== CHECK_CRON) {
      const r = await readDueSource(env.DB, SOURCES, plainFetch);
      // Said once when it starts, not every hour it lasts.
      if (r && r.status !== "ok" && r.statusChanged) report(`A Clinic's list could not be read (${r.source}: ${r.status})`, r.detail);
      let pushed = 0;
      const vapid = vapidFrom(env);
      if (r?.fresh.length && vapid) {
        // The read is already saved. A Push that fails loses nothing: the Opening is on the Clinics page.
        pushed = await pushNewOpenings(env.DB, vapid, r.source, r.fresh).then(
          (p) => p.sent,
          (err) => (report("Pushes for new Openings could not be sent", err), 0),
        );
      }
      if (r) console.log(`Clinic read ${r.source}: ${r.status}, ${r.found} Openings, ${r.fresh.length} new, ${pushed} Pushes sent`);
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
