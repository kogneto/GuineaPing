# GuineaPing

Get pinged when a new clinical trial matching your interests is posted on ClinicalTrials.gov.

## How it works

`python -m guineaping` queries the [ClinicalTrials.gov API v2](https://clinicaltrials.gov/data-api/api) for trials
**first posted** since the last run that match `config.toml`, skips any trial ID it has already seen, and:

- calls `guineaping.notify.send_alerts(trials)` with the new trials, if a notifier is installed;
- writes them to `new_trials.md` and prints them;
- saves seen IDs and the run date to `state/seen_ids.json` (override with `SEEN_IDS_FILE`).

State is saved only after alerts succeed, so a failed alert is retried on the next run. On the very first run it
looks back `first_run_lookback_days` (default 7).

Python 3.11+, standard library only.

## Configure

Edit `config.toml`. Entries in a list are OR'ed; lists are AND'ed; an empty list means "any".

```toml
[search]
conditions = ["multiple sclerosis"]
locations = ["Massachusetts"]
phases = ["2", "3"]
statuses = ["RECRUITING", "NOT_YET_RECRUITING"]
```

## Develop

```sh
pip install pytest
python -m pytest
```
