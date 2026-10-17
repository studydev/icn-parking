import copy
import inspect
import json
import sys
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "functions"))

from common import api  # noqa: E402
from common.kst import slot_index, slot_key, slot_of  # noqa: E402
from common.normalize import normalize_holidays, normalize_parking, normalize_passenger  # noqa: E402
from common.impute import fill_gaps  # noqa: E402
from common import pipeline  # noqa: E402
from common.pipeline import (COLLECT_BUDGET_S, MAX_CALLS, build_day, day_summary, heal_days, ingest,  # noqa: E402
                             publish_day, rebuild_obs, read_obs, run_collect, run_exog, terminal_series)
from common.store import LocalStore, get_json, put_json  # noqa: E402
from common.zones import load_zones  # noqa: E402

FIX = Path(__file__).parent / "fixtures"
PARKING = json.loads((FIX / "parking.json").read_text())
PASSENGER = json.loads((FIX / "passenger.json").read_text())


@pytest.fixture(scope="module")
def reg():
    return load_zones()


@pytest.fixture
def stores(tmp_path):
    return LocalStore(tmp_path / "private"), LocalStore(tmp_path / "web")


def utc(s):
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)


def body_with(changes=None, datetm=None):
    b = copy.deepcopy(PARKING)
    for it in b["response"]["body"]["items"]:
        if datetm:
            it["datetm"] = datetm
        if changes and it["floor"] in changes:
            it.update(changes[it["floor"]])
    return b


def raw_rec(body, now, error=None):
    return {"source": "parking", "collected_at_utc": now.isoformat().replace("+00:00", "Z"),
            "slot_kst": slot_key(slot_of(now)), "http_status": 200, "result_code": "00", "latency_ms": 1,
            "attempts": 1, "error": error, "body": body}


def test_slot_floor_kst():
    s = slot_of(utc("2026-10-01T05:34:59"))
    assert slot_key(s) == "2026-10-01T14:30"
    assert slot_index(s) == 14 * 12 + 6


def test_all_real_zones_mapped(reg):
    rows, unknown = normalize_parking(raw_rec(PARKING, utc("2026-10-01T05:00:00")), reg)
    assert unknown == []
    assert len(rows) == 19
    assert {r["zone_id"] for r in rows} == set(reg.by_id)
    r = next(r for r in rows if r["zone_id"] == "t1-short-b1")
    assert r["capacity"] == 520 and r["available"] == 520 - r["parking"]
    assert r["occupancy"] == round(r["parking"] / 520, 4)


def test_whitespace_insensitive_match(reg):
    assert reg.match("T1  단기주차장 지하1층").id == "t1-short-b1"


def test_flags(reg):
    now = utc("2026-10-01T05:00:00")
    rows1, _ = normalize_parking(raw_rec(PARKING, now), reg)
    prev = {r["zone_id"]: {"slot": r["slot_ts_kst"], "source_ts": r["source_ts"], "capacity": r["capacity"]}
            for r in rows1}
    body = body_with({"T1 단기주차장지하1층": {"parking": "600", "parkingarea": "520"},
                      "T1 단기주차장지하2층": {"parkingarea": "1400"},
                      "T1 단기주차장지하3층": {"parkingarea": "0"}})
    # same datetm as before -> STALE; slot jumped 10 minutes -> GAP
    rows2, _ = normalize_parking(raw_rec(body, utc("2026-10-01T05:10:00")), reg, prev)
    by = {r["zone_id"]: r for r in rows2}
    assert "OVER" in by["t1-short-b1"]["flags"] and by["t1-short-b1"]["available"] == 0
    assert "CAPCHANGE" in by["t1-short-b2"]["flags"]
    assert "CLOSED" in by["t1-short-b3"]["flags"] and by["t1-short-b3"]["occupancy"] is None
    assert all("STALE" in r["flags"] and "GAP" in r["flags"] for r in rows2)


def test_unknown_zone(reg):
    body = copy.deepcopy(PARKING)
    body["response"]["body"]["items"].append({"floor": "T2 신규 주차장", "parking": "1", "parkingarea": "10",
                                              "datetm": "20261001040000.000"})
    rows, unknown = normalize_parking(raw_rec(body, utc("2026-10-01T05:00:00")), reg)
    assert unknown == ["T2 신규 주차장"]
    assert "UNKNOWN_ZONE" in rows[-1]["flags"]


def test_build_day_dedup_and_stale(reg):
    now = utc("2026-10-01T05:00:00")
    rows_a, _ = normalize_parking(raw_rec(PARKING, now), reg)
    later = body_with({"T1 단기주차장지하1층": {"parking": "300"}})
    rows_b, _ = normalize_parking(raw_rec(later, utc("2026-10-01T05:00:30")), reg)
    stale = [dict(r, slot_ts_kst="2026-10-01T14:05", flags=["STALE"]) for r in rows_a]
    doc = build_day("2026-10-01", rows_a + rows_b + stale, reg)
    z = doc["zones"]["t1-short-b1"]
    assert z["p"][14 * 12] == 300  # later collection wins
    assert z["p"][14 * 12 + 1] is None and z["c"][14 * 12 + 1] == 520  # STALE -> missing
    assert list(doc["zones"])[0] == "t1-short-b1"


def test_terminal_series_excludes_reservation_and_closed(reg):
    rows, _ = normalize_parking(raw_rec(PARKING, utc("2026-10-01T05:00:00")), reg)
    doc = build_day("2026-10-01", rows, reg)
    i = 14 * 12
    t1 = [r for r in rows if r["zone_id"].startswith("t1-") and not r["zone_id"].startswith("t1-resv")]
    expect = sum(r["parking"] for r in t1) / sum(r["capacity"] for r in t1)
    assert terminal_series(doc, reg, "T1")[i] == pytest.approx(expect)
    doc["zones"]["t1-short-b3"]["c"][i] = 0
    doc["zones"]["t1-short-b3"]["p"][i] = None
    assert terminal_series(doc, reg, "T1")[i] is not None
    doc["zones"]["t1-short-b1"]["p"][i] = None
    assert terminal_series(doc, reg, "T1")[i] is None
    s = day_summary(doc, reg, i, i + 2)
    assert s["T1"]["miss"] == 3 and s["T2"]["miss"] == 2 and s["T2"]["at"] == "14:00"


def test_run_collect_success_and_failure(stores, reg):
    private, web = stores
    r1 = run_collect(private, web, "k", now=utc("2026-10-01T05:00:00"), reg=reg,
                     fetch=lambda k: ({"http_status": 200, "result_code": "00", "latency_ms": 1, "attempts": 1,
                                       "error": None}, body_with(datetm="20261001140000.000")))
    assert r1["ok"] and r1["rows"] == 19
    r2 = run_collect(private, web, "k", now=utc("2026-10-01T05:05:00"), reg=reg,
                     fetch=lambda k: ({"http_status": 500, "result_code": None, "latency_ms": 1, "attempts": 4,
                                       "error": "HTTPError 500"}, None))
    assert not r2["ok"]
    assert private.get("raw/parking/2026/10/01/1405.json") is not None  # raw saved even on failure
    assert len(read_obs(private, "2026-10-01")) == 19  # obs only on success
    latest = get_json(web, "data/latest.json")
    assert latest["ok"] is False and latest["error"] == "HTTPError 500"
    assert latest["last_ok_at"] == "2026-10-01T05:00:00Z" and latest["zones"][0]["p"] is not None
    assert web.get("data/latest.json")[:2] == b"\x1f\x8b"
    day = get_json(web, "data/days/2026-10-01.json")
    assert day["zones"]["t2-resv"]["c"][14 * 12] == 3779
    cal = get_json(web, "data/calendar.json")
    assert cal["start"] == "2026-10-01" and cal["days"]["2026-10-01"]["n"] == 1


def test_midnight_finalizes_previous_day(stores, reg):
    private, web = stores
    ok = {"http_status": 200, "result_code": "00", "latency_ms": 1, "attempts": 1, "error": None}
    run_collect(private, web, "k", now=utc("2026-10-01T14:55:00"), reg=reg,
                fetch=lambda k: (ok, body_with(datetm="20261001235500.000")))
    run_collect(private, web, "k", now=utc("2026-10-01T15:00:00"), reg=reg,
                fetch=lambda k: (ok, body_with(datetm="20261002000000.000")))
    assert get_json(web, "data/days/2026-10-01.json")["zones"]["t1-long-p1"]["p"][287] is not None
    assert get_json(web, "data/days/2026-10-02.json")["zones"]["t1-long-p1"]["p"][0] is not None
    assert set(get_json(web, "data/calendar.json")["days"]) == {"2026-10-01", "2026-10-02"}


def test_rebuild_obs_idempotent(stores, reg):
    private, web = stores
    for t, dtm in (("2026-10-01T05:00:00", "20261001140000.000"), ("2026-10-01T05:05:00", "20261001140500.000")):
        raw = raw_rec(body_with(datetm=dtm), utc(t))
        private.put(f"raw/parking/2026/10/01/{raw['slot_kst'][11:13]}{raw['slot_kst'][14:16]}.json",
                    json.dumps(raw).encode())
    assert rebuild_obs(private, "2026-10-01", reg) == 38
    assert rebuild_obs(private, "2026-10-01", reg) == 38
    assert len(read_obs(private, "2026-10-01")) == 38


def test_partial_response_not_shown_as_current(stores, reg):
    private, web = stores
    ok = {"http_status": 200, "result_code": "00", "latency_ms": 1, "attempts": 1, "error": None}
    run_collect(private, web, "k", now=utc("2026-10-01T05:00:00"), reg=reg,
                fetch=lambda k: (ok, body_with(datetm="20261001140000.000")))
    partial = body_with(datetm="20261001140500.000")
    partial["response"]["body"]["items"] = [i for i in partial["response"]["body"]["items"]
                                            if i["floor"] != "T1 장기 P1 주차장"]
    res = run_collect(private, web, "k", now=utc("2026-10-01T05:05:00"), reg=reg, fetch=lambda k: (ok, partial),
                      sleep=lambda s: None)
    assert res["missing"] == ["t1-long-p1"]
    z = {x["id"]: x for x in get_json(web, "data/latest.json")["zones"]}
    assert z["t1-long-p1"]["p"] is None and "MISSING" in z["t1-long-p1"]["flags"]
    assert z["t1-long-p2"]["p"] is not None


def test_ingest_empty_items(stores, reg):
    private, web = stores
    body = copy.deepcopy(PARKING)
    body["response"]["body"]["items"] = []
    res = ingest(private, web, raw_rec(body, utc("2026-10-01T05:00:00")), utc("2026-10-01T05:00:00"), reg)
    assert not res["ok"] and get_json(web, "data/latest.json")["error"] == "empty response"


def test_passenger_normalize():
    raw = {"collected_at_utc": "2026-10-01T00:00:00Z",
           "selectdate": {k: {"error": None, "body": v} for k, v in PASSENGER.items()}}
    docs = normalize_passenger(raw)
    assert sorted(docs) == ["2026-10-01", "2026-10-02"]
    hours = docs["2026-10-01"]["hours"]
    assert [h["hour"] for h in hours] == list(range(24))
    assert {"t1_dep", "t1_arr", "t2_dep", "t2_arr"} <= set(hours[0])


def test_holidays_normalize():
    body = {"response": {"body": {"items": {"item": [
        {"locdate": 20261003, "dateName": "개천절", "isHoliday": "Y"},
        {"locdate": 20261005, "dateName": "대체공휴일(개천절)", "isHoliday": "Y"},
        {"locdate": 20261010, "dateName": "무언가", "isHoliday": "N"}]}}}}
    assert normalize_holidays(body) == {"2026-10-03": "개천절", "2026-10-05": "대체공휴일(개천절)"}
    single = {"response": {"body": {"items": {"item": {"locdate": 20260101, "dateName": "1월1일", "isHoliday": "Y"}}}}}
    assert normalize_holidays(single) == {"2026-01-01": "1월1일"}


def test_run_exog_monthly_refresh(stores):
    private, _ = stores
    calls = []
    fp = lambda k, s: ({"error": None}, PASSENGER[str(s)])  # noqa: E731
    fh = lambda k, y: calls.append(y) or ({"error": None}, {"response": {"body": {"items": ""}}})  # noqa: E731
    run_exog(private, "k", now=utc("2026-09-30T20:05:00"), fetch_passenger=fp, fetch_holidays=fh)
    run_exog(private, "k", now=utc("2026-09-30T21:05:00"), fetch_passenger=fp, fetch_holidays=fh)
    assert calls == [2026, 2027]
    run_exog(private, "k", now=utc("2026-10-31T16:05:00"), fetch_passenger=fp, fetch_holidays=fh)
    assert calls == [2026, 2027, 2026, 2027]
    assert get_json(private, "exog/passenger/2026/10/02.json")["hours"]


def test_api_retry_then_success():
    seq = [urllib.error.HTTPError("u", 503, "x", {}, None), (200, "not json"),
           (200, json.dumps({"response": {"header": {"resultCode": "00"}}}))]
    sleeps = []

    def opener(url):
        v = seq.pop(0)
        if isinstance(v, Exception):
            raise v
        return v

    meta, body = api.call("https://x", {"a": 1}, opener=opener, sleep=sleeps.append)
    assert meta["error"] is None and meta["attempts"] == 3 and sleeps == [2, 5]


def test_api_gives_up():
    meta, _ = api.call("https://x", {}, opener=lambda u: (200, json.dumps({"response": {"header": {"resultCode": "22"}}})),
                       sleep=lambda s: None)
    assert meta["attempts"] == 4 and meta["error"] == "RuntimeError: resultCode=22"


def test_service_key_encoded_once():
    seen = []
    api.call("https://x", {"serviceKey": "a/b+c=="}, opener=lambda u: seen.append(u) or (200, "{}"),
             sleep=lambda s: None, delays=())
    assert "serviceKey=a%2Fb%2Bc%3D%3D" in seen[0]


# ---------- retry budget, stale re-polls and gap estimation ----------

OK_META = {"http_status": 200, "result_code": "00", "latency_ms": 1, "attempts": 1, "error": None}
SLOT = 14 * 12  # 14:00 KST


def test_api_deadline_stops_retrying():
    now = [0.0]
    sleeps = []

    def sleep(s):
        sleeps.append(s)
        now[0] += s

    meta, _ = api.call("https://x", {}, sleep=sleep, delays=api.PARKING_RETRY_DELAYS, deadline=20.0,
                       clock=lambda: now[0],
                       opener=lambda u: (200, json.dumps({"response": {"header": {"resultCode": "22"}}})))
    # 20s budget: after 2s and 7s of backoff a 10s-timeout attempt still fits, after 17s it no longer does.
    assert sleeps == [2, 5] and meta["attempts"] == 3 and meta["error"] == "RuntimeError: resultCode=22"


def test_parking_backoff_fits_the_five_minute_slot():
    assert len(api.PARKING_RETRY_DELAYS) + 1 == MAX_CALLS
    assert sum(api.PARKING_RETRY_DELAYS) + MAX_CALLS * api.TIMEOUT < 300


def test_build_day_fresh_row_beats_later_stale_duplicate(reg):
    fresh, _ = normalize_parking(raw_rec(PARKING, utc("2026-10-01T05:00:00")), reg)
    stale = [dict(r, collected_at_utc="2026-10-01T05:01:00Z", flags=["STALE"], parking=999) for r in fresh]
    doc = build_day("2026-10-01", fresh + stale, reg)
    assert doc["zones"]["t1-short-b1"]["p"][SLOT] == fresh[0]["parking"]


def test_collect_repolls_stale_response_and_stores_the_fresh_one(stores, reg):
    private, web = stores
    run_collect(private, web, "k", now=utc("2026-10-01T05:00:00"), reg=reg,
                fetch=lambda k: (OK_META, body_with(datetm="20261001140000.000")))
    answers = [body_with(datetm="20261001140000.000"),  # the source has not refreshed yet: every zone is STALE
               body_with({"T1 단기주차장지하1층": {"parking": "250"}}, datetm="20261001140500.000")]
    calls, sleeps = [], []

    def fetch(k):
        calls.append(k)
        return OK_META, answers[len(calls) - 1]

    res = run_collect(private, web, "k", now=utc("2026-10-01T05:05:00"), reg=reg, fetch=fetch, sleep=sleeps.append)
    assert res["ok"] and len(calls) == 2 and sleeps == [20]
    raw = get_json(private, "raw/parking/2026/10/01/1405.json")
    assert raw["attempts"] == 2 and raw["soft_retries"] == 1
    assert len(read_obs(private, "2026-10-01")) == 38  # one ingest per slot
    assert get_json(web, "data/days/2026-10-01.json")["zones"]["t1-short-b1"]["p"][SLOT + 1] == 250


def test_collect_call_cap_and_zone_stale_last_slot_is_not_retried(stores, reg):
    private, web = stores

    def body(datetm):  # one zone's source timestamp never advances
        b = body_with(datetm=datetm)
        for it in b["response"]["body"]["items"]:
            if it["floor"] == "T1 장기 P1 주차장":
                it["datetm"] = "20261001140000.000"
        return b

    run_collect(private, web, "k", now=utc("2026-10-01T05:00:00"), reg=reg,
                fetch=lambda k: (OK_META, body("20261001140000.000")))
    calls = []

    def fetch_for(datetm):
        def fetch(k):
            calls.append(k)
            return OK_META, body(datetm)
        return fetch

    run_collect(private, web, "k", now=utc("2026-10-01T05:05:00"), reg=reg, sleep=lambda s: None,
                fetch=fetch_for("20261001140500.000"))
    assert len(calls) == MAX_CALLS  # healthy last slot, stale now: re-polled until the call cap
    calls.clear()
    run_collect(private, web, "k", now=utc("2026-10-01T05:10:00"), reg=reg, sleep=lambda s: None,
                fetch=fetch_for("20261001141000.000"))
    assert len(calls) == 1  # already stale last slot: a stuck source must not burn the daily quota


def day_doc(p, c=None):
    return {"zones": {"z": {"p": list(p), "c": list(c) if c else [520] * len(p)}}}


def test_fill_gaps_interpolates_and_marks_estimated_slots():
    src = day_doc([100, None, None, 130, 140])
    z = fill_gaps(src)["zones"]["z"]
    assert z["p"] == [100, 110, 120, 130, 140] and z["c"] == [520] * 5 and z["e"] == [1, 2]
    assert src["zones"]["z"]["p"][1] is None and "e" not in src["zones"]["z"]  # input is untouched
    again = fill_gaps(fill_gaps(src))
    assert again == fill_gaps(src)  # idempotent


def test_fill_gaps_limit_is_thirty_minutes():
    six = fill_gaps(day_doc([0] + [None] * 6 + [70]))["zones"]["z"]
    assert six["e"] == [1, 2, 3, 4, 5, 6] and six["p"][3] == 30
    seven = fill_gaps(day_doc([0] + [None] * 7 + [80]))["zones"]["z"]
    assert "e" not in seven and seven["p"][1:8] == [None] * 7


def test_fill_gaps_leaves_open_ended_and_capacity_change_gaps():
    z = fill_gaps(day_doc([None, 100, None, None]))["zones"]["z"]
    assert z["p"] == [None, 100, None, None] and "e" not in z  # leading and trailing gaps have one anchor only
    z = fill_gaps(day_doc([100, None, 200], [520, None, 378]))["zones"]["z"]
    assert z["p"][1] is None  # capacity changed across the gap: when is unknown
    z = fill_gaps(day_doc([100, None, 200], [520, 378, 520]))["zones"]["z"]
    assert z["p"][1] is None  # a capacity recorded inside the gap disagrees with its anchors


def test_fill_gaps_keeps_a_closed_zone_closed_and_stale_slot_capacity():
    z = fill_gaps(day_doc([0, None, 0], [0, None, 0]))["zones"]["z"]
    assert z["p"] == [0, 0, 0] and z["c"] == [0, 0, 0] and z["e"] == [1]
    z = fill_gaps(day_doc([100, None, 200], [520, 520, 520]))["zones"]["z"]  # STALE row: capacity known, p null
    assert z["p"][1] == 150 and z["e"] == [1]


def test_fill_gaps_is_per_zone():
    doc = {"zones": {"a": {"p": [10, None, 30], "c": [100, 100, 100]}, "b": {"p": [10, 20, 30], "c": [100, 100, 100]}}}
    out = fill_gaps(doc)["zones"]
    assert out["a"]["e"] == [1] and "e" not in out["b"]


def test_publish_day_fills_a_missed_slot_once_the_next_measurement_arrives(stores, reg):
    private, web = stores

    def collect(t, parking, datetm):
        return run_collect(private, web, "k", now=utc(t), reg=reg,
                           fetch=lambda k: (OK_META, body_with({"T1 단기주차장지하1층": {"parking": str(parking)}},
                                                               datetm=datetm)))

    collect("2026-10-01T05:00:00", 200, "20261001140000.000")
    # 14:05 is never collected. Until 14:10 arrives there is nothing to anchor an estimate on.
    day = get_json(web, "data/days/2026-10-01.json")
    assert day["zones"]["t1-short-b1"]["p"][SLOT + 1] is None and "e" not in day["zones"]["t1-short-b1"]
    collect("2026-10-01T05:10:00", 300, "20261001141000.000")
    day = get_json(web, "data/days/2026-10-01.json")
    z = day["zones"]["t1-short-b1"]
    assert z["p"][SLOT:SLOT + 3] == [200, 250, 300] and z["c"][SLOT + 1] == 520 and z["e"] == [SLOT + 1]
    assert all(zz["e"] == [SLOT + 1] for zz in day["zones"].values())
    cal = get_json(web, "data/calendar.json")["days"]["2026-10-01"]
    assert cal["est"] == 1 and cal["n"] == 2  # the calendar reports measured slots; the estimate is counted apart
    obs = read_obs(private, "2026-10-01")
    assert {r["slot_ts_kst"][11:] for r in obs} == {"14:00", "14:10"}  # observations hold no synthetic rows
    publish_day(private, web, "2026-10-01", reg, utc("2026-10-01T05:10:00"))
    assert get_json(web, "data/days/2026-10-01.json")["zones"]["t1-short-b1"]["p"][SLOT:SLOT + 3] == [200, 250, 300]


def test_default_fetch_hands_the_budget_to_the_api_client(stores, reg, monkeypatch):
    private, web = stores
    seen = {}

    def fake_fetch(key, **kw):
        seen.update(kw)
        return OK_META, body_with(datetm="20261001140000.000")

    monkeypatch.setattr(api, "fetch_parking", fake_fetch)
    run_collect(private, web, "k", now=utc("2026-10-01T05:00:00"), reg=reg, clock=lambda: 1000.0)
    assert seen["deadline"] == 1000.0 + COLLECT_BUDGET_S and seen["delays"] == api.PARKING_RETRY_DELAYS
    assert set(seen) <= set(inspect.signature(api.call).parameters)  # every keyword is one api.call accepts


def test_heal_days_republishes_finalized_days_once_per_rule_version(stores, reg, monkeypatch):
    private, web = stores

    def collect(t, parking, datetm):
        return run_collect(private, web, "k", now=utc(t), reg=reg,
                           fetch=lambda k: (OK_META, body_with({"T1 단기주차장지하1층": {"parking": str(parking)}},
                                                               datetm=datetm)))

    collect("2026-10-01T05:00:00", 200, "20261001140000.000")
    collect("2026-10-01T05:10:00", 300, "20261001141000.000")  # 14:05 was never collected
    # Simulate the day file a collector without gap estimation had finalized (hole, 1-day cache, no `e`).
    legacy = build_day("2026-10-01", read_obs(private, "2026-10-01"), reg)
    put_json(web, "data/days/2026-10-01.json", legacy, gz=True)
    assert "e" not in get_json(web, "data/days/2026-10-01.json")["zones"]["t1-short-b1"]

    assert heal_days(private, web, reg, utc("2026-10-01T05:15:00")) == []  # today is never healed
    later = utc("2026-10-01T15:05:00")  # 2026-10-02 00:05 KST: 10-01 is final
    assert heal_days(private, web, reg, later) == ["2026-10-01"]
    z = get_json(web, "data/days/2026-10-01.json")["zones"]["t1-short-b1"]
    assert z["p"][SLOT + 1] == 250 and z["e"] == [SLOT + 1]
    assert heal_days(private, web, reg, later) == []  # done: later runs only read two small blobs

    monkeypatch.setattr(pipeline, "IMPUTE_VERSION", 2)  # new rules -> every finalized day is rebuilt once more
    assert heal_days(private, web, reg, later) == ["2026-10-01"]
    assert heal_days(private, web, reg, later) == []


def test_heal_days_skips_days_without_observations_and_is_bounded(stores, reg):
    private, web = stores
    put_json(web, "data/days/2026-09-29.json", {"v": 1, "date": "2026-09-29", "zones": {"keep": {"p": [1], "c": [2]}}})
    days = {d: {"n": 1} for d in ("2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01")}
    put_json(private, "state/calendar.json", {"v": 1, "start": "2026-09-28", "days": days})
    now = utc("2026-10-02T03:00:00")
    assert heal_days(private, web, reg, now) == []  # newest three considered, none has obs: nothing is rebuilt
    assert get_json(private, "state/heal.json")["days"] == ["2026-10-01", "2026-09-30", "2026-09-29"]
    assert get_json(web, "data/days/2026-09-29.json")["zones"] == {"keep": {"p": [1], "c": [2]}}  # untouched
    heal_days(private, web, reg, now)
    assert get_json(private, "state/heal.json")["days"][-1] == "2026-09-28"


def test_collect_survives_a_failing_heal(stores, reg, monkeypatch):
    private, web = stores

    def boom(*a, **k):
        raise RuntimeError("storage hiccup")

    monkeypatch.setattr(pipeline, "heal_days", boom)
    res = run_collect(private, web, "k", now=utc("2026-10-01T05:00:00"), reg=reg,
                      fetch=lambda k: (OK_META, body_with(datetm="20261001140000.000")))
    assert res["ok"] and "healed" not in res
