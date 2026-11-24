# GuineaPing

Alerts a small group of people, mostly healthy volunteers, when a new clinical trial matching a Watch they follow is posted on ClinicalTrials.gov. Vocabulary is in [CONTEXT.md](CONTEXT.md), and decisions are in [docs/adr](docs/adr).

React + Vite + Hono on Cloudflare Workers, with D1. A Cron Trigger runs the hourly Check, and Cloudflare Access handles sign-in.

## Develop

```sh
npm install
cp .dev.vars.example .dev.vars        # signs you in as dev@localhost on localhost only
node scripts/vapid-keys.mjs --append  # Web Push keys for local testing
npx wrangler d1 migrations apply guineaping --local
npm run dev                           # http://localhost:5173
npm test
```

Vite's Cloudflare plugin doesn't fire cron triggers. Use the **Run a Check now (dev)** link in the footer instead (`POST /api/dev/check`, which only works on localhost). To act as another Member locally, send an `X-Dev-Email` header. Pushes need a real browser that allows notifications on localhost (e.g. Chrome); the Devices page turns them on.

## Deployment

Live at **https://guineaping.andy-deloose.workers.dev**, behind Cloudflare Access (team `white-brook-3170`, application "GuineaPing", one-time PIN by email, 30-day sessions).

- **Deploy a change:** `npx wrangler d1 migrations apply guineaping --remote` (when there are new migrations), then `npm run deploy`.
- **Add or remove a Member:** the Organiser does it in the app, under Settings; any other Member can only leave. The app then updates the Access policy "Members" itself (as **Emails** rules) and refuses a removed Member straight away, even if Access still honours their old session. This needs a Cloudflare API token with the account permission **Access: Apps and Policies → Edit**, stored as the Worker secret `CF_ACCESS_TOKEN` (`npx wrangler secret put CF_ACCESS_TOKEN`). That token can change every Access application on the account, not only this one. Until it is set, Settings only lists the Members, and people are added in the Zero Trust dashboard: Access › Applications › GuineaPing › Policies › Members.
- **Push keys** are the Worker secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`. Replacing them cuts off every Device until it turns notifications on again; `node scripts/vapid-keys.mjs` makes a new set.
- **If the Access application is ever recreated,** it gets a new AUD tag. Put it in `ACCESS_AUD` in `wrangler.jsonc` and deploy, or every sign-in is refused.
- **Errors:** the Worker reports errors and failed Checks to Sentry (project `guineaping`), and a Sentry cron monitor, `hourly-check`, raises an issue when two Checks in a row fail or don't run. No email addresses, request contents, cookies or Watch criteria are sent; `src/worker/report.ts` says exactly what is.
- **Tips:** the block that tells Members where they can tip shows only once a handle is set. Set any of `TIP_NAME`, `TIP_CASHAPP`, `TIP_VENMO`, `TIP_PAYPAL` (a paypal.me link or an email address) and `TIP_ZELLE` (an email address or phone number) with `npx wrangler secret put <NAME>`, so they stay out of the repository. A value of the wrong shape is ignored.
- **Clinic read:** a second Cron Trigger (every three minutes) reads one Clinic’s study list per run, each at most once an hour, and pushes new Openings to Members who asked for them at that Clinic; [ADR 0003](docs/adr/0003-read-clinic-sites-that-do-not-forbid-it.md) has the rules. A problem is reported to Sentry once, when it starts. If a Clinic’s site refuses GuineaPing, reading it stops until someone clears `refused_at` in the `clinic_sources` table. Locally, `POST /api/dev/read-clinic` reads the next due source.
- **Limits:** a Check makes one outgoing request per Watch (more for very broad ones) plus one per Push. On the Workers paid plan each run allows at least 1,000, far more than a family group needs. A Watch that ClinicalTrials.gov can't answer for is skipped and catches up on its own; a Push no Device received is retried each hour for a day.
