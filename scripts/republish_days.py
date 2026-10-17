"""Re-publish day files and the calendar from the stored observations (obs/<date>.jsonl).

Use after changing how day files are derived (for example gap estimation) so past dates pick it up. Observations
are never modified; each date is rebuilt like the collector does and the day file is finalized (1-day cache) for
dates before today.

    DATA_STORAGE_ACCOUNT_URL=https://<acct>.blob.core.windows.net/ \
      .venv/bin/python scripts/republish_days.py --from 2026-10-16 --to 2026-10-16 [--dry-run]
"""
import argparse
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "functions"))
sys.path.insert(0, str(ROOT / "scripts"))

from backfill import wait_for_quiet_window  # noqa: E402
from common.kst import to_kst  # noqa: E402
from common.pipeline import STATE_CALENDAR, publish_day, read_obs  # noqa: E402
from common.store import get_json, stores_from_env  # noqa: E402
from common.zones import registry  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="start", help="first date, YYYY-MM-DD (default: calendar start)")
    ap.add_argument("--to", dest="end", help="last date, YYYY-MM-DD (default: today KST)")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    private, web = stores_from_env()
    reg = registry()
    now = datetime.now(timezone.utc)
    today = to_kst(now).strftime("%Y-%m-%d")
    start = a.start or (get_json(private, STATE_CALENDAR) or {}).get("start") or today
    end = a.end or today
    d, last = date.fromisoformat(start), date.fromisoformat(end)
    while d <= last:
        day = d.isoformat()
        rows = len(read_obs(private, day))
        if not rows:
            print(f"{day}: no observations, skipped")
        elif a.dry_run:
            print(f"{day}: {rows} observation rows would be re-published")
        else:
            # publish_day updates the calendar read-modify-write, which must not overlap a collect run.
            wait_for_quiet_window()
            doc = publish_day(private, web, day, reg, datetime.now(timezone.utc), final=day < today)
            est = len({i for z in doc["zones"].values() for i in z.get("e", [])})
            print(f"{day}: {rows} rows, day file + calendar re-published, {est} estimated slot(s)")
        d += timedelta(days=1)


if __name__ == "__main__":
    main()
