# GuineaPing

Alerts a small group of patients and family members when a new clinical trial matching a Watch they follow is posted on ClinicalTrials.gov. Vocabulary is in [CONTEXT.md](CONTEXT.md), and decisions are in [docs/adr](docs/adr).

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
- **Add or remove a Member:** in the Zero Trust dashboard, open Access › Applications › GuineaPing › Policies › Members and add or remove their email (use an **Emails** rule, not "Emails ending in"). Their Member record is created the first time they sign in.
- **Push keys** are the Worker secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`. Replacing them cuts off every Device until it turns notifications on again; `node scripts/vapid-keys.mjs` makes a new set.
- **If the Access application is ever recreated,** it gets a new AUD tag. Put it in `ACCESS_AUD` in `wrangler.jsonc` and deploy, or every sign-in is refused.
- **Limits:** a Check makes one outgoing request per Watch (more for very broad ones) plus one per Push. On the Workers paid plan each run allows at least 1,000, far more than a family group needs. A Watch that ClinicalTrials.gov can't answer for is skipped and catches up on its own; a Push no Device received is retried each hour for a day.
