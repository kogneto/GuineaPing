"""Find clinical trials first posted on ClinicalTrials.gov since the last run.

Uses the public ClinicalTrials.gov API v2 (no key needed) and the standard
library only. Run with:  python -m guineaping.checker
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import tomllib
import urllib.parse
import urllib.request
from pathlib import Path

API_URL = "https://clinicaltrials.gov/api/v2/studies"
STUDY_URL = "https://clinicaltrials.gov/study/{nct_id}"
FIELDS = ",".join(
    [
        "NCTId",
        "BriefTitle",
        "StudyFirstPostDate",
        "OverallStatus",
        "Phase",
        "Condition",
        "LocationCity",
        "LocationState",
        "LocationCountry",
        "LeadSponsorName",
    ]
)

PHASE_ALIASES = {
    "early1": "EARLY_PHASE1",
    "earlyphase1": "EARLY_PHASE1",
    "0": "EARLY_PHASE1",
    "1": "PHASE1",
    "2": "PHASE2",
    "3": "PHASE3",
    "4": "PHASE4",
    "na": "NA",
}


def normalize_phase(value: str) -> str:
    """Accept '2', 'Phase 2', 'PHASE2', 'early 1' etc. and return the API enum."""
    key = value.strip().lower().replace("phase", "").replace("_", "").replace(" ", "")
    if key in PHASE_ALIASES:
        return PHASE_ALIASES[key]
    raise ValueError(f"Unknown phase {value!r}; use 1, 2, 3, 4, early1 or NA")


def load_config(path: Path) -> dict:
    with path.open("rb") as f:
        cfg = tomllib.load(f)
    search = cfg.get("search", {})
    return {
        "conditions": list(search.get("conditions", [])),
        "terms": list(search.get("terms", [])),
        "locations": list(search.get("locations", [])),
        "phases": [normalize_phase(p) for p in search.get("phases", [])],
        "statuses": [s.strip().upper() for s in search.get("statuses", [])],
        "first_run_lookback_days": int(cfg.get("first_run_lookback_days", 7)),
    }


def _or(values: list[str]) -> str:
    """Join search terms with OR, quoting multi-word terms."""
    parts = [f'"{v}"' if " " in v and not v.startswith('"') else v for v in values]
    return " OR ".join(parts)


def build_params(cfg: dict, since: dt.date) -> dict:
    advanced = [f"AREA[StudyFirstPostDate]RANGE[{since.isoformat()},MAX]"]
    if cfg["phases"]:
        advanced.append("AREA[Phase](" + " OR ".join(cfg["phases"]) + ")")
    params = {
        "format": "json",
        "pageSize": "100",
        "fields": FIELDS,
        "filter.advanced": " AND ".join(advanced),
    }
    if cfg["conditions"]:
        params["query.cond"] = _or(cfg["conditions"])
    if cfg["terms"]:
        params["query.term"] = _or(cfg["terms"])
    if cfg["locations"]:
        params["query.locn"] = _or(cfg["locations"])
    if cfg["statuses"]:
        params["filter.overallStatus"] = ",".join(cfg["statuses"])
    return params


def http_get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "GuineaPing/0.1", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def fetch_studies(params: dict, get_json=http_get_json) -> list[dict]:
    studies: list[dict] = []
    token = None
    while True:
        page = dict(params)
        if token:
            page["pageToken"] = token
        data = get_json(API_URL + "?" + urllib.parse.urlencode(page))
        studies.extend(data.get("studies", []))
        token = data.get("nextPageToken")
        if not token:
            return studies


def summarize(study: dict) -> dict:
    ps = study.get("protocolSection", {})
    ident = ps.get("identificationModule", {})
    status = ps.get("statusModule", {})
    design = ps.get("designModule", {})
    conds = ps.get("conditionsModule", {})
    sponsor = ps.get("sponsorCollaboratorsModule", {}).get("leadSponsor", {})
    locs = ps.get("contactsLocationsModule", {}).get("locations", [])
    places = []
    for loc in locs:
        place = ", ".join(x for x in (loc.get("city"), loc.get("state"), loc.get("country")) if x)
        if place and place not in places:
            places.append(place)
    nct_id = ident.get("nctId", "")
    return {
        "nct_id": nct_id,
        "title": ident.get("briefTitle", ""),
        "first_posted": status.get("studyFirstPostDateStruct", {}).get("date", ""),
        "status": status.get("overallStatus", ""),
        "phases": design.get("phases", []),
        "conditions": conds.get("conditions", []),
        "sponsor": sponsor.get("name", ""),
        "locations": places,
        "url": STUDY_URL.format(nct_id=nct_id),
    }


def load_state(path: Path) -> dict:
    if path.exists():
        return json.loads(path.read_text())
    return {"last_run": None, "seen": []}


def save_state(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    state["seen"] = sorted(set(state["seen"]))
    path.write_text(json.dumps(state, indent=2) + "\n")


def find_new(cfg: dict, state: dict, today: dt.date, get_json=http_get_json) -> list[dict]:
    """Return unseen trials and update state in place."""
    if state.get("last_run"):
        # Re-check the last run's day too: post dates have day granularity and
        # trials posted later that day would otherwise be missed. Seen IDs dedupe.
        since = dt.date.fromisoformat(state["last_run"])
    else:
        since = today - dt.timedelta(days=cfg["first_run_lookback_days"])
    seen = set(state.get("seen", []))
    new = []
    for study in fetch_studies(build_params(cfg, since), get_json):
        trial = summarize(study)
        if trial["nct_id"] and trial["nct_id"] not in seen:
            seen.add(trial["nct_id"])
            new.append(trial)
    state["seen"] = list(seen)
    state["last_run"] = today.isoformat()
    return new


def to_markdown(trials: list[dict]) -> str:
    lines = [f"## {len(trials)} new clinical trial{'s' if len(trials) != 1 else ''}", ""]
    for t in trials:
        phases = ", ".join(t["phases"]) or "n/a"
        lines.append(f"### [{t['nct_id']}]({t['url']}): {t['title']}")
        lines.append(f"- First posted: {t['first_posted']} · Status: {t['status']} · Phase: {phases}")
        if t["conditions"]:
            lines.append(f"- Conditions: {', '.join(t['conditions'])}")
        if t["sponsor"]:
            lines.append(f"- Sponsor: {t['sponsor']}")
        if t["locations"]:
            shown = "; ".join(t["locations"][:5])
            more = f" (+{len(t['locations']) - 5} more)" if len(t["locations"]) > 5 else ""
            lines.append(f"- Locations: {shown}{more}")
        lines.append("")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--config", default="config.toml", type=Path)
    ap.add_argument("--state", type=Path,
                    default=Path(os.environ.get("SEEN_IDS_FILE", "state/seen_ids.json")))
    ap.add_argument("--report", default="new_trials.md", type=Path,
                    help="Markdown report written when new trials are found")
    args = ap.parse_args(argv)

    cfg = load_config(args.config)
    state = load_state(args.state)
    today = dt.datetime.now(dt.timezone.utc).date()
    new = find_new(cfg, state, today)

    # Alert before saving state, so a failed alert is retried next run.
    if new:
        try:
            from guineaping.notify import send_alerts
        except ImportError:
            print("No notifier installed; printing results only.", file=sys.stderr)
        else:
            send_alerts(new)
    save_state(args.state, state)

    if new:
        report = to_markdown(new)
        args.report.write_text(report)
        print(report)
    else:
        args.report.unlink(missing_ok=True)
        print("No new trials.")

    # Expose the count to GitHub Actions.
    if gh_out := os.environ.get("GITHUB_OUTPUT"):
        with open(gh_out, "a") as f:
            f.write(f"new_count={len(new)}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
