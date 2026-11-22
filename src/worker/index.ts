import { app } from "./app";
import { checkAndPush } from "./check";

export default {
  fetch: app.fetch,
  /** The hourly Check and its Pushes (wrangler.jsonc triggers.crons). */
  scheduled(_event, env, ctx) {
    ctx.waitUntil(
      checkAndPush(env).then((r) => {
        if (!r.ok) console.error("Check failed:", r.error);
        else console.log(`Check ok: ${r.watchesChecked} Watches, ${r.alertsCreated} Alerts, ${r.updates ?? 0} Updates, ${r.pushes?.sent ?? 0} Pushes sent`);
      }),
    );
  },
} satisfies ExportedHandler<Env>;
