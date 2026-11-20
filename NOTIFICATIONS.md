# Alerts via ntfy

GuineaPing sends a push notification to your phone for each new trial the checker finds.

## Setup (2 minutes)

1. Install the **ntfy** app (iOS App Store / Google Play) or open https://ntfy.sh/app.
2. Pick a hard-to-guess topic name, e.g. `guineaping-` followed by random characters.
   Anyone who knows the name can read it, so treat it like a password.
3. In the app, tap **+** and subscribe to that topic.
4. Set `NTFY_TOPIC` to that name wherever the checker runs (e.g. a GitHub Actions secret).
5. Send a test: `NTFY_TOPIC=your-topic python -m guineaping.notify`

Optional: `NTFY_SERVER` (self-hosted server, default `https://ntfy.sh`) and `NTFY_TOKEN` (access token for a protected topic).

## Behaviour

- One push per new trial, tapping opens the ClinicalTrials.gov page.
- More than 10 new trials in one run are grouped into a single summary push.
- Each send is retried 3 times. If any alert still fails, `send_alerts` raises, so the checker retries those trials next run.
