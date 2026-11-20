import datetime as dt
import json
import sys
import types
import urllib.parse

import pytest

from guineaping import checker


def study(nct, date="2026-11-19"):
    return {
        "protocolSection": {
            "identificationModule": {"nctId": nct, "briefTitle": f"Trial {nct}"},
            "statusModule": {"overallStatus": "RECRUITING", "studyFirstPostDateStruct": {"date": date}},
            "designModule": {"phases": ["PHASE2"]},
            "conditionsModule": {"conditions": ["Multiple Sclerosis"]},
            "sponsorCollaboratorsModule": {"leadSponsor": {"name": "Acme"}},
            "contactsLocationsModule": {
                "locations": [
                    {"city": "Boston", "state": "Massachusetts", "country": "United States"},
                    {"city": "Boston", "state": "Massachusetts", "country": "United States"},
                ]
            },
        }
    }


CFG = {
    "conditions": ["multiple sclerosis", "MS"],
    "terms": [],
    "locations": ["Boston"],
    "phases": ["PHASE2", "PHASE3"],
    "statuses": ["RECRUITING"],
    "first_run_lookback_days": 7,
}


def fake_api(pages):
    calls = []

    def get_json(url):
        calls.append(urllib.parse.parse_qs(urllib.parse.urlparse(url).query))
        return pages[len(calls) - 1]

    return get_json, calls


@pytest.mark.parametrize("raw,expected", [("2", "PHASE2"), ("Phase 3", "PHASE3"), ("PHASE1", "PHASE1"),
                                          ("early 1", "EARLY_PHASE1"), ("na", "NA")])
def test_normalize_phase(raw, expected):
    assert checker.normalize_phase(raw) == expected


def test_normalize_phase_rejects_garbage():
    with pytest.raises(ValueError):
        checker.normalize_phase("five")


def test_build_params():
    p = checker.build_params(CFG, dt.date(2026, 11, 13))
    assert p["query.cond"] == '"multiple sclerosis" OR MS'
    assert p["query.locn"] == "Boston"
    assert p["filter.overallStatus"] == "RECRUITING"
    assert p["filter.advanced"] == (
        "AREA[StudyFirstPostDate]RANGE[2026-11-13,MAX] AND AREA[Phase](PHASE2 OR PHASE3)"
    )
    assert "query.term" not in p


def test_first_run_paginates_and_records_state():
    get_json, calls = fake_api([
        {"studies": [study("NCT1")], "nextPageToken": "abc"},
        {"studies": [study("NCT2")]},
    ])
    state = {"last_run": None, "seen": []}
    new = checker.find_new(CFG, state, dt.date(2026, 11, 20), get_json)

    assert [t["nct_id"] for t in new] == ["NCT1", "NCT2"]
    assert calls[0]["filter.advanced"][0].startswith("AREA[StudyFirstPostDate]RANGE[2026-11-13,MAX]")
    assert calls[1]["pageToken"] == ["abc"]
    assert state["last_run"] == "2026-11-20"
    assert set(state["seen"]) == {"NCT1", "NCT2"}


def test_later_run_skips_seen_and_starts_from_last_run():
    get_json, calls = fake_api([{"studies": [study("NCT1"), study("NCT3")]}])
    state = {"last_run": "2026-11-19", "seen": ["NCT1"]}
    new = checker.find_new(CFG, state, dt.date(2026, 11, 20), get_json)

    assert [t["nct_id"] for t in new] == ["NCT3"]
    assert "RANGE[2026-11-19,MAX]" in calls[0]["filter.advanced"][0]


def test_summarize_shape():
    t = checker.summarize(study("NCT9"))
    assert t == {
        "nct_id": "NCT9",
        "title": "Trial NCT9",
        "first_posted": "2026-11-19",
        "status": "RECRUITING",
        "phases": ["PHASE2"],
        "conditions": ["Multiple Sclerosis"],
        "sponsor": "Acme",
        "locations": ["Boston, Massachusetts, United States"],
        "url": "https://clinicaltrials.gov/study/NCT9",
    }


def test_main_end_to_end(tmp_path, monkeypatch):
    cfg = tmp_path / "config.toml"
    cfg.write_text('[search]\nconditions = ["MS"]\nphases = ["2"]\n')
    state = tmp_path / "seen_ids.json"
    report = tmp_path / "new.md"
    out = tmp_path / "gh_out"
    get_json, _ = fake_api([{"studies": [study("NCT5")]}])
    real_fetch = checker.fetch_studies
    monkeypatch.setattr(checker, "fetch_studies", lambda params, g=None: real_fetch(params, get_json))
    monkeypatch.setenv("GITHUB_OUTPUT", str(out))

    sent = []
    notify = types.ModuleType("guineaping.notify")
    notify.send_alerts = sent.extend
    monkeypatch.setitem(sys.modules, "guineaping.notify", notify)

    assert checker.main(["--config", str(cfg), "--state", str(state), "--report", str(report)]) == 0
    assert [t["nct_id"] for t in sent] == ["NCT5"]
    assert json.loads(state.read_text())["seen"] == ["NCT5"]
    assert "NCT5" in report.read_text()
    assert out.read_text() == "new_count=1\n"


def test_failed_alert_does_not_save_state(tmp_path, monkeypatch):
    cfg = tmp_path / "config.toml"
    cfg.write_text("[search]\n")
    state = tmp_path / "seen_ids.json"
    get_json, _ = fake_api([{"studies": [study("NCT6")]}])
    real_fetch = checker.fetch_studies
    monkeypatch.setattr(checker, "fetch_studies", lambda params, g=None: real_fetch(params, get_json))
    monkeypatch.delenv("GITHUB_OUTPUT", raising=False)

    def boom(trials):
        raise RuntimeError("smtp down")

    notify = types.ModuleType("guineaping.notify")
    notify.send_alerts = boom
    monkeypatch.setitem(sys.modules, "guineaping.notify", notify)

    with pytest.raises(RuntimeError):
        checker.main(["--config", str(cfg), "--state", str(state), "--report", str(tmp_path / "r.md")])
    assert not state.exists()
