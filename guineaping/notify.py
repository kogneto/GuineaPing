"""Push alerts for new clinical trials via ntfy (https://ntfy.sh).

Configuration (environment variables):
    NTFY_TOPIC   required. Your private topic name; subscribe to it in the ntfy app.
    NTFY_SERVER  optional. Defaults to https://ntfy.sh.
    NTFY_TOKEN   optional. Access token, if your topic is protected.

Usage from the poller:
    from guineaping.notify import send_alerts
    send_alerts(new_trials)  # list of dicts with nct_id, title, url, ...
"""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.request
from typing import Any, Callable, Iterable, Mapping

log = logging.getLogger(__name__)

DEFAULT_SERVER = "https://ntfy.sh"
MAX_MESSAGE_CHARS = 3500  # ntfy truncates bodies over 4 KB
MAX_INDIVIDUAL = 10  # above this, send one summary alert instead of a flood
RETRIES = 3


class NotifyConfigError(RuntimeError):
    pass


class NotifyError(RuntimeError):
    """Some alerts could not be delivered. `.sent` lists the NCT IDs that were."""

    def __init__(self, message: str, sent: list[str]):
        super().__init__(message)
        self.sent = sent


def _trial_url(trial: Mapping[str, Any]) -> str:
    return trial.get("url") or f"https://clinicaltrials.gov/study/{trial['nct_id']}"


def format_trial(trial: Mapping[str, Any]) -> dict:
    """Build the ntfy JSON payload body (minus topic) for one trial."""
    lines = []
    if trial.get("conditions"):
        lines.append("Conditions: " + ", ".join(trial["conditions"]))
    if trial.get("phases"):
        lines.append("Phase: " + ", ".join(trial["phases"]))
    if trial.get("locations"):
        locs = list(trial["locations"])
        more = f" (+{len(locs) - 3} more)" if len(locs) > 3 else ""
        lines.append("Locations: " + "; ".join(locs[:3]) + more)
    if trial.get("sponsor"):
        lines.append("Sponsor: " + str(trial["sponsor"]))
    if trial.get("status"):
        lines.append("Status: " + str(trial["status"]))
    if trial.get("first_posted"):
        lines.append("First posted: " + str(trial["first_posted"]))
    lines.append(trial["nct_id"])
    url = _trial_url(trial)
    return {
        "title": f"New trial: {trial.get('title') or trial['nct_id']}"[:250],
        "message": "\n".join(lines)[:MAX_MESSAGE_CHARS],
        "click": url,
        "tags": ["test_tube"],
        "actions": [{"action": "view", "label": "Open", "url": url}],
    }


def format_summary(trials: list[Mapping[str, Any]]) -> dict:
    body = "\n".join(
        f"• {t['nct_id']}: {t.get('title') or ''}".rstrip(": ") for t in trials
    )
    return {
        "title": f"{len(trials)} new clinical trials",
        "message": body[:MAX_MESSAGE_CHARS],
        "click": "https://clinicaltrials.gov/search?sort=StudyFirstPostDate",
        "tags": ["test_tube"],
    }


def _post(server: str, payload: dict, token: str | None, timeout: float = 15) -> None:
    req = urllib.request.Request(
        server.rstrip("/"),
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        resp.read()


def send_alerts(
    trials: Iterable[Mapping[str, Any]],
    *,
    env: Mapping[str, str] | None = None,
    post: Callable[[str, dict, str | None], None] = _post,
    sleep: Callable[[float], None] = time.sleep,
) -> list[str]:
    """Send one ntfy push per new trial (or a single summary if there are many).

    Returns the NCT IDs alerted. Raises NotifyConfigError if NTFY_TOPIC is
    unset, and NotifyError (after trying every alert) if any failed, so the
    poller does not mark those trials as seen and retries them next run.
    """
    trials = list(trials)
    if not trials:
        return []
    env = os.environ if env is None else env
    topic = env.get("NTFY_TOPIC", "").strip()
    if not topic:
        raise NotifyConfigError("NTFY_TOPIC is not set")
    server = env.get("NTFY_SERVER", "").strip() or DEFAULT_SERVER
    token = env.get("NTFY_TOKEN", "").strip() or None

    if len(trials) > MAX_INDIVIDUAL:
        batches = [(format_summary(trials), [t["nct_id"] for t in trials])]
    else:
        batches = [(format_trial(t), [t["nct_id"]]) for t in trials]

    sent: list[str] = []
    for payload, ids in batches:
        payload = {"topic": topic, **payload}
        for attempt in range(1, RETRIES + 1):
            try:
                post(server, payload, token)
                sent.extend(ids)
                break
            except (urllib.error.URLError, OSError) as exc:
                log.warning("ntfy send failed (attempt %d/%d): %s", attempt, RETRIES, exc)
                if attempt < RETRIES:
                    sleep(2 ** attempt)
    if len(sent) < len(trials):
        raise NotifyError(f"{len(trials) - len(sent)} of {len(trials)} alerts failed", sent)
    return sent


def main() -> None:
    """Send a test alert: python -m guineaping.notify"""
    logging.basicConfig(level=logging.INFO)
    send_alerts([{
        "nct_id": "NCT00000000",
        "title": "GuineaPing test alert",
        "url": "https://clinicaltrials.gov/",
        "conditions": ["Test"],
    }])
    print("Test alert sent")


if __name__ == "__main__":
    main()
