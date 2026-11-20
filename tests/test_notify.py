import urllib.error

import pytest

from guineaping import notify

ENV = {"NTFY_TOPIC": "my-topic"}
TRIAL = {
    "nct_id": "NCT01234567",
    "title": "A Study of Something",
    "url": "https://clinicaltrials.gov/study/NCT01234567",
    "conditions": ["Asthma", "COPD"],
    "sponsor": "Acme",
    "phases": ["PHASE2"],
    "locations": ["Boston, Massachusetts, United States", "A", "B", "C"],
    "first_posted": "2026-11-20",
}


class Recorder:
    def __init__(self, fail_times=0):
        self.calls, self.fail_times = [], fail_times

    def __call__(self, server, payload, token):
        self.calls.append((server, payload, token))
        if self.fail_times:
            self.fail_times -= 1
            raise urllib.error.URLError("down")


def test_empty_list_sends_nothing():
    rec = Recorder()
    assert notify.send_alerts([], env={}, post=rec) == []
    assert rec.calls == []


def test_missing_topic_raises():
    with pytest.raises(notify.NotifyConfigError):
        notify.send_alerts([TRIAL], env={}, post=Recorder())


def test_one_push_per_trial():
    rec = Recorder()
    second = {"nct_id": "NCT07654321", "title": "Other"}
    assert notify.send_alerts([TRIAL, second], env=ENV, post=rec) == [
        "NCT01234567", "NCT07654321"]
    server, payload, token = rec.calls[0]
    assert server == "https://ntfy.sh" and token is None
    assert payload["topic"] == "my-topic"
    assert payload["title"] == "New trial: A Study of Something"
    assert "Asthma, COPD" in payload["message"]
    assert "Phase: PHASE2" in payload["message"]
    assert "(+1 more)" in payload["message"]
    assert payload["click"] == TRIAL["url"]
    assert rec.calls[1][1]["click"] == "https://clinicaltrials.gov/study/NCT07654321"


def test_custom_server_and_token():
    rec = Recorder()
    env = {**ENV, "NTFY_SERVER": "https://ntfy.example.com", "NTFY_TOKEN": "tk"}
    notify.send_alerts([TRIAL], env=env, post=rec)
    assert rec.calls[0][0] == "https://ntfy.example.com"
    assert rec.calls[0][2] == "tk"


def test_many_trials_become_one_summary():
    rec = Recorder()
    trials = [{"nct_id": f"NCT{i:08d}", "title": f"T{i}"} for i in range(15)]
    assert len(notify.send_alerts(trials, env=ENV, post=rec)) == 15
    assert len(rec.calls) == 1
    assert rec.calls[0][1]["title"] == "15 new clinical trials"


def test_retries_then_succeeds():
    rec = Recorder(fail_times=2)
    assert notify.send_alerts([TRIAL], env=ENV, post=rec, sleep=lambda s: None) == ["NCT01234567"]
    assert len(rec.calls) == 3


def test_gives_up_and_raises_with_sent_ids():
    rec = Recorder(fail_times=notify.RETRIES)  # first trial fails, second succeeds
    second = {"nct_id": "NCT07654321", "title": "Other"}
    with pytest.raises(notify.NotifyError) as exc:
        notify.send_alerts([TRIAL, second], env=ENV, post=rec, sleep=lambda s: None)
    assert exc.value.sent == ["NCT07654321"]
    assert len(rec.calls) == notify.RETRIES + 1
