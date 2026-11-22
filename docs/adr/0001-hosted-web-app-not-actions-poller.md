# Hosted web app on Cloudflare, not a GitHub Actions poller

GuineaPing began as a serverless Python poller: a GitHub Actions cron job read one `config.toml`, kept seen trial IDs on a `state` git branch, and pushed to a single ntfy topic (see the closed PRs #1–#3, whose branches are kept for reference). Once the app became a group tool with per-person Watches, Follows, Owners and Private watches, it needed identity and per-Member state that a config file and one topic could not hold. So we rebuilt it as a web app on our usual stack: React + Vite + Hono on Cloudflare Workers, D1, a Cron Trigger for the hourly Check, and Cloudflare Access (email allowlist, one-time code) for sign-in.

## Consequences

- The old checker's ClinicalTrials.gov query (filtering by first-posted date range, phase and status, and following `nextPageToken` paging) carried over. It was then re-verified against the live API, because the old checker never ran successfully. The old checker re-checked only the last run's day. That is not enough: ClinicalTrials.gov refreshes about once a day and can publish Trials dated a day or two back. So each Check looks back three days before the last successful Check, and each Watch remembers which Trials it has already found.
- Group membership is managed in the Cloudflare Access allowlist, not in the app. There is no in-app admin role.
