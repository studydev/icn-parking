"""Measure how accurate gap estimation is on real, complete data.

Takes measured slots from day files, hides a run of 1..6 consecutive slots, estimates it with `fill_gaps` (linear
interpolation) and compares with the hidden truth and with the naive "hold the last value" alternative.
Error is reported in cars and in percentage points of the operating capacity, per zone category and gap length.

    .venv/bin/python scripts/backtest-impute.py --days-dir .localdata/web/data/days [--samples 4000] [--seed 1]

`--days-dir` holds the published `YYYY-MM-DD.json` files (gzip or plain). Gaps are only drawn where the hidden
slots and both anchors are measured (not estimated) and share one operating capacity.
"""
import argparse
import gzip
import json
import random
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "functions"))

from common.impute import MAX_GAP_SLOTS, fill_gaps  # noqa: E402
from common.zones import registry  # noqa: E402


def load_days(folder: Path) -> list[dict]:
    docs = []
    for path in sorted(folder.glob("*.json")):
        raw = path.read_bytes()
        docs.append(json.loads(gzip.decompress(raw) if raw[:2] == b"\x1f\x8b" else raw))
    return docs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days-dir", required=True)
    ap.add_argument("--samples", type=int, default=4000)
    ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args()
    rng, reg = random.Random(a.seed), registry()
    docs = [d for d in load_days(Path(a.days_dir)) if d.get("zones")]
    if not docs:
        sys.exit("no day files found")

    err = defaultdict(lambda: {"n": 0, "lin_car": 0.0, "hold_car": 0.0, "lin_pp": 0.0, "hold_pp": 0.0})
    tried = 0
    while tried < a.samples:
        doc = rng.choice(docs)
        zid = rng.choice(list(doc["zones"]))
        z = doc["zones"][zid]
        length = rng.randint(1, MAX_GAP_SLOTS)
        s = rng.randint(1, len(z["p"]) - length - 2)
        span = range(s - 1, s + length + 1)
        tried += 1
        if z.get("e") or any(z["p"][i] is None or z["c"][i] in (None, 0) for i in span):
            continue
        if len({z["c"][i] for i in span}) != 1:
            continue
        hidden = {"zones": {zid: {"p": list(z["p"]), "c": list(z["c"])}}}
        for i in range(s, s + length):
            hidden["zones"][zid]["p"][i] = None
        guess = fill_gaps(hidden)["zones"][zid]["p"]
        cap = z["c"][s]
        cat = reg.by_id[zid].category if zid in reg.by_id else "?"
        for i in range(s, s + length):
            row = err[(cat, length)]
            truth, last = z["p"][i], z["p"][s - 1]
            row["n"] += 1
            row["lin_car"] += abs(guess[i] - truth)
            row["hold_car"] += abs(last - truth)
            row["lin_pp"] += abs(guess[i] - truth) / cap * 100
            row["hold_pp"] += abs(last - truth) / cap * 100
    print(f"{'category':<6} {'gap':>4} {'slots':>7} | {'linear cars':>11} {'hold cars':>10} | {'linear %p':>9} {'hold %p':>8}")
    for (cat, length), r in sorted(err.items()):
        n = r["n"]
        print(f"{cat:<6} {length * 5:>3}m {n:>7} | {r['lin_car'] / n:>11.2f} {r['hold_car'] / n:>10.2f} | "
              f"{r['lin_pp'] / n:>9.2f} {r['hold_pp'] / n:>8.2f}")


if __name__ == "__main__":
    main()
