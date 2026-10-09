"""Generate synthetic multi-week data (UI testing only — never upload).

Writes raw/obs through the real pipeline into a LocalStore so day/calendar/latest files
are produced exactly like production.

    .venv/bin/python scripts/make_demo_data.py --out /tmp/icn-demo --days 36
"""
import argparse
import math
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "functions"))

from common.pipeline import publish_day, ingest, rows_to_jsonl, obs_path  # noqa: E402
from common.normalize import normalize_parking  # noqa: E402
from common.store import LocalStore, put_json  # noqa: E402
from common.zones import load_zones  # noqa: E402
from common.kst import KST, slot_key  # noqa: E402

CAP = {"t1-short-b1": 520, "t1-short-b2": 1334, "t1-short-b3": 639, "t1-short-gf": 1052, "t1-long-p1": 2769,
       "t1-long-p2": 2581, "t1-long-p3": 1605, "t1-tower-p1": 1379, "t1-tower-p2": 1379, "t1-resv-p5": 1276,
       "t2-short-bm": 751, "t2-short-1f": 988, "t2-short-2f": 947, "t2-short-3f": 896, "t2-short-4f": 976,
       "t2-long": 4404, "t2-tower-p1": 2910, "t2-tower-p2": 2925, "t2-resv": 3779}


def bump(h, c, w):
    return math.exp(-(((h - c) / w) ** 2))


def occ(zid, cat, t: datetime, k):
    dd = t.timestamp() / 86400
    hr = t.hour + t.minute / 60
    dw = t.weekday()
    off = (hash(zid) % 13 - 6) / 100
    wig = 0.012 * math.sin(dd * 24 * 1.7 + k) + 0.012 * (random.random() - 0.5)
    if cat == "단기":
        return max(0.02, min(1, 0.24 + off + 0.48 * bump(hr, 11, 4) + 0.22 * bump(hr, 19, 2.5)
                             + [0.02, -0.04, -0.03, 0, 0.07, 0.05, 0.06][dw] + wig * 1.6))
    wk = math.cos(2 * math.pi * (dw - 4.4) / 7)
    base = 0.74 + 0.07 * wk + 0.015 * math.sin((hr - 9) / 24 * 2 * math.pi) + wig
    # 장기주차장은 주차타워 진입 대기 차량까지 집계되어 금·토에는 면수를 넘기도 합니다(실데이터의 OVER).
    surge = 0.24 * bump(hr, 14, 6) if cat == "장기" and dw in (4, 5) else 0
    return max(0.02, min(1.15 if cat == "장기" else 1, base + off + surge + (0.08 if cat == "타워" else 0) + (-0.1 if cat == "예약" else 0)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="/tmp/icn-demo")
    ap.add_argument("--days", type=int, default=36)
    a = ap.parse_args()
    reg = load_zones()
    private, web = LocalStore(Path(a.out) / "private"), LocalStore(Path(a.out) / "web")
    now = datetime.now(KST).replace(second=0, microsecond=0)
    now = now.replace(minute=now.minute - now.minute % 5)
    start = (now - timedelta(days=a.days)).replace(hour=0, minute=0)
    gaps = {start + timedelta(days=3, hours=h, minutes=m) for h in (3,) for m in range(0, 35, 5)}
    t = start
    by_date = {}
    while t <= now:
        if t not in gaps:
            items = []
            for k, z in enumerate(reg.zones):
                cap = CAP[z.id]
                items.append({"floor": z.raw_names[0], "parking": str(round(cap * occ(z.id, z.category, t, k))),
                              "parkingarea": str(cap), "datetm": t.strftime("%Y%m%d%H%M%S") + ".000"})
            raw = {"slot_kst": slot_key(t), "collected_at_utc": t.astimezone(timezone.utc).isoformat(), "error": None,
                   "body": {"response": {"body": {"items": items}}}}
            rows, _ = normalize_parking(raw, reg)
            by_date.setdefault(t.strftime("%Y-%m-%d"), []).extend(rows)
            last_raw = raw
        t += timedelta(minutes=5)
    for d, rows in sorted(by_date.items()):
        private.put(obs_path(d), rows_to_jsonl(rows))
        publish_day(private, web, d, reg, now.astimezone(timezone.utc), final=d != now.strftime("%Y-%m-%d"))
    put_json(private, f"exog/calendar/{now.year}.json", {"year": now.year, "holidays": {
        "2026-09-24": "추석", "2026-09-25": "추석", "2026-09-26": "추석", "2026-10-03": "개천절",
        "2026-10-05": "대체공휴일(개천절)", "2026-10-09": "한글날"}})
    ingest(private, web, last_raw, now.astimezone(timezone.utc), reg)
    print("demo data:", Path(a.out) / "web/data")


if __name__ == "__main__":
    main()
