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

## Deploy (not done yet)

1. `npx wrangler d1 create guineaping`, then put the returned `database_id` in `wrangler.jsonc`.
2. `npx wrangler d1 migrations apply guineaping --remote`
3. Create a Cloudflare Access application for the Worker's hostname, with an email allowlist and one-time PIN. Put its team domain and AUD tag in `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD`.
4. Web Push keys: run `node scripts/vapid-keys.mjs` (without `--append`) and store each line as a secret with `npx wrangler secret put VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (a `mailto:` address push services can contact). If you change the keys later, every Device has to turn notifications on again.
5. `npm run deploy`
