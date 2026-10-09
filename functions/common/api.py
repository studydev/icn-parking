"""data.go.kr client (stdlib only to keep cold start light)."""
import json
import time
import urllib.error
import urllib.parse
import urllib.request

PARKING_URL = "https://apis.data.go.kr/B551177/StatusOfParking/getTrackingParking"
PASSENGER_URL = "https://apis.data.go.kr/B551177/passgrAnncmt/getPassgrAnncmt"
HOLIDAY_URL = "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo"
RETRY_DELAYS = (2, 5, 10)
TIMEOUT = 10


def _open(url: str) -> tuple[int, str]:
    with urllib.request.urlopen(url, timeout=TIMEOUT) as r:
        return r.status, r.read().decode("utf-8")


def call(url: str, params: dict, opener=_open, sleep=time.sleep, delays=RETRY_DELAYS) -> tuple[dict, object]:
    """Call with retries. Returns (meta, body); meta['error'] is None on success.

    Success requires HTTP 200, JSON body and header.resultCode == '00'.
    """
    full = f"{url}?{urllib.parse.urlencode(params)}"
    meta = {"http_status": None, "result_code": None, "latency_ms": None, "attempts": 0, "error": None}
    body = None
    for attempt, delay in enumerate((0,) + tuple(delays)):
        if delay:
            sleep(delay)
        meta["attempts"] = attempt + 1
        t0 = time.monotonic()
        try:
            status, text = opener(full)
            meta["http_status"] = status
            meta["latency_ms"] = round((time.monotonic() - t0) * 1000)
            try:
                body = json.loads(text)
            except ValueError:
                body = text[:2000]
                raise RuntimeError("non-JSON response")
            meta["result_code"] = (body.get("response") or {}).get("header", {}).get("resultCode")
            if meta["result_code"] != "00":
                raise RuntimeError(f"resultCode={meta['result_code']}")
            meta["error"] = None
            return meta, body
        except urllib.error.HTTPError as e:
            meta["http_status"], meta["error"] = e.code, f"HTTPError {e.code}"
            meta["latency_ms"] = round((time.monotonic() - t0) * 1000)
        except Exception as e:  # noqa: BLE001 - any failure is recorded and retried
            meta["latency_ms"] = round((time.monotonic() - t0) * 1000)
            meta["error"] = f"{type(e).__name__}: {e}"
    return meta, body


def fetch_parking(key: str, **kw):
    return call(PARKING_URL, {"serviceKey": key, "numOfRows": 100, "pageNo": 1, "type": "json"}, **kw)


def fetch_passenger(key: str, selectdate: int, **kw):
    return call(PASSENGER_URL, {"serviceKey": key, "numOfRows": 100, "pageNo": 1, "type": "json",
                                "selectdate": selectdate}, **kw)


def fetch_holidays(key: str, year: int, **kw):
    return call(HOLIDAY_URL, {"serviceKey": key, "solYear": year, "numOfRows": 100, "_type": "json"}, **kw)
