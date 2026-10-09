"""Move locally collected raw files into Blob storage and rebuild obs/day/calendar for those dates.

Existing blobs are never overwritten (Azure's own raw wins for the same slot). Rebuilds are
idempotent: obs/<date>.jsonl is regenerated from every raw record of that date.

    DATA_STORAGE_ACCOUNT_URL=https://<acct>.blob.core.windows.net/ \
      .venv/bin/python scripts/backfill.py [--local .localdata/private] [--dry-run]
"""
import argparse
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "functions"))

from common.kst import to_kst  # noqa: E402
from common.normalize import normalize_passenger  # noqa: E402
from common.pipeline import publish_day, rebuild_obs  # noqa: E402
from common.store import LocalStore, get_json, put_json, stores_from_env  # noqa: E402
from common.zones import registry  # noqa: E402


def wait_for_quiet_window():
    """Collect runs at hh:m0/m5:00; rebuild between +60s and +200s of the 5-minute cycle."""
    while not 60 <= time.time() % 300 <= 200:
        time.sleep(5)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--local", default=str(ROOT / ".localdata/private"))
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    local = LocalStore(a.local)
    private, web = stores_from_env()
    reg = registry()

    existing = set(private.list("raw/"))
    uploaded, dates = 0, set()
    for path in local.list("raw/"):
        if not path.endswith(".json"):
            continue
        if path.startswith("raw/parking/"):
            dates.add("-".join(path.split("/")[2:5]))
        if path in existing:
            continue
        uploaded += 1
        if not a.dry_run:
            private.put(path, local.get(path), content_type="application/json")
    print(f"raw uploaded: {uploaded} (skipped existing: {len(local.list('raw/')) - uploaded})")

    for path in local.list("raw/passenger/"):
        raw = get_json(local, path)
        for d, doc in normalize_passenger(raw).items():
            target = f"exog/passenger/{d.replace('-', '/')}.json"
            if private.get(target) is None and not a.dry_run:
                put_json(private, target, doc)

    if a.dry_run:
        print("dates:", sorted(dates))
        return
    now = datetime.now(timezone.utc)
    today = to_kst(now).strftime("%Y-%m-%d")
    for d in sorted(dates):
        # obs rebuild and calendar read-modify-write must not overlap a collect run.
        wait_for_quiet_window()
        now = datetime.now(timezone.utc)
        n = rebuild_obs(private, d, reg)
        publish_day(private, web, d, reg, now, final=d < today)
        print(f"{d}: obs rows {n}, day file + calendar republished")


if __name__ == "__main__":
    main()
