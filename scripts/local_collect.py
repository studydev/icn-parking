"""Temporary local collector (stdlib only).

Saves raw responses in the same layout the Azure `collect`/`exog` functions use,
so `scripts/backfill.py` can replay them into Blob storage later.

    python3 scripts/local_collect.py [--once] [--out .localdata/private]
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

KST = timezone(timedelta(hours=9))
PARKING_URL = "https://apis.data.go.kr/B551177/StatusOfParking/getTrackingParking"
PASSENGER_URL = "https://apis.data.go.kr/B551177/passgrAnncmt/getPassgrAnncmt"
RETRY_DELAYS = (2, 5, 10)
ROOT = Path(__file__).resolve().parent.parent


def load_key():
    key = os.environ.get("DATA_GO_KR_KEY")
    env = ROOT / ".env"
    if not key and env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("DATA_GO_KR_KEY="):
                key = line.split("=", 1)[1].strip()
    if not key:
        sys.exit("DATA_GO_KR_KEY not set")
    return key


def call(url, params):
    qs = urllib.parse.urlencode(params)
    meta = {"http_status": None, "result_code": None, "latency_ms": None, "attempts": 0, "error": None}
    body = None
    for attempt, delay in enumerate((0,) + RETRY_DELAYS):
        if delay:
            time.sleep(delay)
        meta["attempts"] = attempt + 1
        t0 = time.monotonic()
        try:
            with urllib.request.urlopen(f"{url}?{qs}", timeout=10) as r:
                raw = r.read().decode("utf-8")
                meta["http_status"] = r.status
            meta["latency_ms"] = round((time.monotonic() - t0) * 1000)
            try:
                body = json.loads(raw)
            except ValueError:
                body = raw
                raise RuntimeError("non-JSON response")
            meta["result_code"] = body.get("response", {}).get("header", {}).get("resultCode")
            if meta["result_code"] != "00":
                raise RuntimeError(f"resultCode={meta['result_code']}")
            meta["error"] = None
            return meta, body
        except urllib.error.HTTPError as e:
            meta["http_status"], meta["error"] = e.code, f"HTTPError {e.code}"
        except Exception as e:  # noqa: BLE001 - record any failure and retry
            meta["latency_ms"] = round((time.monotonic() - t0) * 1000)
            meta["error"] = f"{type(e).__name__}: {e}"
    return meta, body


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False))
    tmp.replace(path)


def collect_parking(out, key, now_utc):
    kst = now_utc.astimezone(KST)
    slot = kst.replace(minute=kst.minute - kst.minute % 5, second=0, microsecond=0)
    meta, body = call(PARKING_URL, {"serviceKey": key, "numOfRows": 100, "pageNo": 1, "type": "json"})
    rec = {"source": "parking", "collected_at_utc": now_utc.isoformat(timespec="milliseconds"),
           "slot_kst": slot.strftime("%Y-%m-%dT%H:%M"), **meta, "body": body}
    path = out / f"raw/parking/{slot:%Y/%m/%d/%H%M}.json"
    write_json(path, rec)
    return path, meta


def collect_passenger(out, key, now_utc):
    kst = now_utc.astimezone(KST)
    days = {}
    for sel in (0, 1):
        meta, body = call(PASSENGER_URL, {"serviceKey": key, "numOfRows": 100, "pageNo": 1, "type": "json", "selectdate": sel})
        days[str(sel)] = {**meta, "body": body}
    rec = {"source": "passenger", "collected_at_utc": now_utc.isoformat(timespec="milliseconds"), "selectdate": days}
    path = out / f"raw/passenger/{kst:%Y/%m/%d/%H}.json"
    write_json(path, rec)
    return path, {k: v["error"] for k, v in days.items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--out", default=str(ROOT / ".localdata/private"))
    args = ap.parse_args()
    out, key = Path(args.out), load_key()
    last_pass_hour = None
    while True:
        now = datetime.now(timezone.utc)
        path, meta = collect_parking(out, key, now)
        print(f"{now.astimezone(KST):%m-%d %H:%M:%S} parking {meta['http_status']} {meta['result_code']} "
              f"{meta['latency_ms']}ms err={meta['error']} -> {path.relative_to(out)}", flush=True)
        hour = now.astimezone(KST).strftime("%Y%m%d%H")
        if hour != last_pass_hour and now.astimezone(KST).minute >= 5:
            ppath, perr = collect_passenger(out, key, now)
            last_pass_hour = hour
            print(f"  passenger err={perr} -> {ppath.relative_to(out)}", flush=True)
        if args.once:
            return
        now = time.time()
        time.sleep(300 - now % 300 + 1)


if __name__ == "__main__":
    main()
