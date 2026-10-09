"""Normalize raw API records into observation rows and exog documents."""
from datetime import datetime, timedelta

from .kst import KST, parse_datetm, parse_slot_key, slot_key
from .zones import ZoneRegistry, squash

STALE_MINUTES = 30


def _int(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def parking_items(body) -> list[dict]:
    try:
        items = body["response"]["body"]["items"]
    except (TypeError, KeyError):
        return []
    if isinstance(items, dict):
        items = items.get("item", [])
    if isinstance(items, dict):
        items = [items]
    return items or []


def normalize_parking(raw: dict, reg: ZoneRegistry, prev: dict | None = None) -> tuple[list[dict], list[str]]:
    """Raw call record -> observation rows.

    prev: {zone_id: {"slot", "source_ts", "capacity"}} from the previous successful call (for flags).
    Returns (rows, unknown_floor_names).
    """
    if raw.get("error"):
        return [], []
    prev = prev or {}
    slot = raw["slot_kst"]
    prev_slot = slot_key(parse_slot_key(slot) - timedelta(minutes=5))
    rows, unknown = [], []
    for it in parking_items(raw.get("body")):
        floor = it.get("floor", "")
        z = reg.match(floor)
        zid = z.id if z else "unknown:" + squash(floor)
        if not z:
            unknown.append(floor)
        parking, capacity = _int(it.get("parking")), _int(it.get("parkingarea"))
        dt = parse_datetm(it.get("datetm", ""))
        source_ts = dt.strftime("%Y-%m-%dT%H:%M:%S") if dt else None
        flags = []
        if not z:
            flags.append("UNKNOWN_ZONE")
        if parking is None or capacity is None:
            flags.append("BAD_VALUE")
        if capacity == 0:
            flags.append("CLOSED")
        p = prev.get(zid)
        if p:
            if source_ts and p.get("source_ts") == source_ts:
                flags.append("STALE")
            if capacity is not None and p.get("capacity") not in (None, capacity):
                flags.append("CAPCHANGE")
            if p.get("slot") and p["slot"] < prev_slot:
                flags.append("GAP")
        if parking is not None and capacity and parking > capacity:
            flags.append("OVER")
        available = max(capacity - parking, 0) if parking is not None and capacity else None
        occupancy = round(parking / capacity, 4) if parking is not None and capacity else None
        rows.append({"slot_ts_kst": slot, "zone_id": zid, "parking": parking, "capacity": capacity,
                     "available": available, "occupancy": occupancy, "source_ts": source_ts,
                     "collected_at_utc": raw["collected_at_utc"], "flags": flags})
    return rows, unknown


def prev_state(rows: list[dict]) -> dict:
    return {r["zone_id"]: {"slot": r["slot_ts_kst"], "source_ts": r["source_ts"], "capacity": r["capacity"]}
            for r in rows}


def is_stale(source_ts: str | None, now: datetime) -> bool:
    if not source_ts:
        return True
    ts = datetime.strptime(source_ts, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=KST)
    return now - ts > timedelta(minutes=STALE_MINUTES)


# ---------- passenger forecast ----------

PASSENGER_SUMS = {"t1_arr": "t1egsum1", "t1_dep": "t1dgsum1", "t2_arr": "t2egsum1", "t2_dep": "t2dgsum2"}


def normalize_passenger(raw: dict) -> dict[str, dict]:
    """Raw passenger record (selectdate 0/1) -> {date: exog doc}."""
    out = {}
    fetched = raw["collected_at_utc"]
    for part in (raw.get("selectdate") or {}).values():
        if part.get("error"):
            continue
        for it in parking_items(part.get("body")):
            adate, atime = it.get("adate", ""), it.get("atime", "")
            if not (adate.isdigit() and len(atime) == 5 and atime[:2].isdigit()):
                continue
            d = f"{adate[:4]}-{adate[4:6]}-{adate[6:]}"
            doc = out.setdefault(d, {"date": d, "fetched_at_utc": fetched, "hours": []})
            row = {"hour": int(atime[:2])}
            for k, f in PASSENGER_SUMS.items():
                v = it.get(f)
                row[k] = round(float(v)) if v not in (None, "") else None
            row["raw"] = {k: v for k, v in it.items() if k not in ("adate", "atime", "tmp1", "tmp2")}
            doc["hours"].append(row)
    for doc in out.values():
        doc["hours"].sort(key=lambda r: r["hour"])
    return out


# ---------- holidays ----------

def normalize_holidays(body) -> dict[str, str]:
    out = {}
    for it in parking_items(body):
        if it.get("isHoliday") != "Y":
            continue
        s = str(it.get("locdate"))
        d = f"{s[:4]}-{s[4:6]}-{s[6:8]}"
        out[d] = f"{out[d]}·{it['dateName']}" if d in out else it["dateName"]
    return out
