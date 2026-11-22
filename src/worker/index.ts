import { fetchJson } from "../shared/ctgov";
import { app } from "./app";
import { runCheck } from "./check";

export default {
  fetch: app.fetch,
  /** The hourly Check (wrangler.jsonc triggers.crons). */
  scheduled(_event, env, ctx) {
    ctx.waitUntil(
      runCheck(env.DB, fetchJson).then((r) => {
        if (!r.ok) console.error("Check failed:", r.error);
        else console.log(`Check ok: ${r.watchesChecked} Watches, ${r.alertsCreated} Alerts`);
      }),
    );
  },
} satisfies ExportedHandler<Env>;
