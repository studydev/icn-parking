"""Builders for the public `$web/data` documents and the collect/exog pipelines."""
import json
import logging
from datetime import datetime

from . import api
from .kst import SLOTS_PER_DAY, iso_utc, now_utc, parse_iso, slot_index, slot_key, slot_of, to_kst
from .normalize import is_stale, normalize_holidays, normalize_parking, normalize_passenger, prev_state
from .store import Store, get_json, put_json
from .zones import ZoneRegistry, registry

log = logging.getLogger("icnparking")

CACHE_SHORT = "public, max-age=60"
CACHE_LONG = "public, max-age=86400"
STATE_LATEST = "state/latest.json"
STATE_CALENDAR = "state/calendar.json"


def _ymd(d: str) -> str:
    return d.replace("-", "/")


def obs_path(d: str) -> str:
    return f"obs/{_ymd(d)}.jsonl"


def read_obs(private: Store, d: str) -> list[dict]:
    raw = private.get(obs_path(d))
    if not raw:
        return []
    rows = []
    for line in raw.decode("utf-8").splitlines():
        line = line.strip()
        if line:
            try:
                rows.append(json.loads(line))
            except ValueError:
                log.warning("bad obs line in %s", d)
    return rows


def rows_to_jsonl(rows: list[dict]) -> bytes:
    return "".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n" for r in rows).encode("utf-8")


# ---------- day document ----------

def build_day(d: str, rows: list[dict], reg: ZoneRegistry) -> dict:
    """288-slot parking/capacity arrays per zone. Duplicate slot+zone keeps the latest collection.
    STALE / invalid values become null (shown as 수집 누락)."""
    best: dict[tuple[str, int], dict] = {}
    for r in rows:
        s = r.get("slot_ts_kst", "")
        if s[:10] != d or r["zone_id"] not in reg.by_id:
            continue
        k = (r["zone_id"], int(s[11:13]) * 12 + int(s[14:16]) // 5)
        if k not in best or r["collected_at_utc"] >= best[k]["collected_at_utc"]:
            best[k] = r
    zones = {}
    for (zid, i), r in best.items():
        z = zones.setdefault(zid, {"p": [None] * SLOTS_PER_DAY, "c": [None] * SLOTS_PER_DAY})
        cap, park = r.get("capacity"), r.get("parking")
        z["c"][i] = cap
        bad = "STALE" in r.get("flags", []) or park is None or cap is None
        z["p"][i] = None if bad else park
    ordered = {z.id: zones[z.id] for z in reg.zones if z.id in zones}
    return {"v": 1, "date": d, "zones": ordered}


def terminal_series(doc: dict, reg: ZoneRegistry, terminal: str) -> list[float | None]:
    """Capacity-weighted occupancy of a terminal per slot (예약 excluded). None if any zone is missing."""
    zs = [doc["zones"][z.id] for z in reg.terminal(terminal) if z.in_total and z.id in doc["zones"]]
    out = []
    for i in range(SLOTS_PER_DAY):
        sp = sc = 0
        ok = bool(zs)
        for z in zs:
            p, c = z["p"][i], z["c"][i]
            if c == 0:
                continue
            if p is None or c is None:
                ok = False
                break
            sp, sc = sp + p, sc + c
        out.append(sp / sc if ok and sc else None)
    return out


def day_summary(doc: dict, reg: ZoneRegistry, first_idx: int, last_idx: int) -> dict:
    """Per-terminal max/avg occupancy and missing slot count over [first_idx, last_idx]."""
    out = {}
    for t in ("T1", "T2"):
        ser = terminal_series(doc, reg, t)[first_idx:last_idx + 1]
        vals = [(v, first_idx + i) for i, v in enumerate(ser) if v is not None]
        if vals:
            mx, at = max(vals, key=lambda x: x[0])
            out[t] = {"max": round(mx, 4), "at": f"{at // 12:02d}:{at % 12 * 5:02d}",
                      "avg": round(sum(v for v, _ in vals) / len(vals), 4), "miss": len(ser) - len(vals)}
        else:
            out[t] = {"max": None, "at": None, "avg": None, "miss": len(ser)}
    return out


def slot_bounds(doc: dict, d: str, start: str, now_slot: datetime) -> tuple[int, int]:
    first = 0
    if d == start:
        idx = [i for z in doc["zones"].values() for i, c in enumerate(z["c"]) if c is not None]
        first = min(idx) if idx else 0
    last = slot_index(now_slot) if d == now_slot.strftime("%Y-%m-%d") else SLOTS_PER_DAY - 1
    return first, last


def load_holidays(private: Store, years) -> dict[str, str]:
    out = {}
    for y in years:
        doc = get_json(private, f"exog/calendar/{y}.json")
        if doc:
            out.update(doc.get("holidays", {}))
    return dict(sorted(out.items()))


def publish_day(private: Store, web: Store, d: str, reg: ZoneRegistry, now: datetime, final: bool = False) -> dict:
    """Rebuild day file from obs, update calendar master and publish both."""
    doc = build_day(d, read_obs(private, d), reg)
    doc["updated_at"] = iso_utc(now)
    put_json(web, f"data/days/{d}.json", doc, gz=True, cache_control=CACHE_LONG if final else CACHE_SHORT)

    cal = get_json(private, STATE_CALENDAR) or {"v": 1, "start": d, "days": {}}
    if d < cal["start"]:
        cal["start"] = d
    if doc["zones"]:
        first, last = slot_bounds(doc, d, cal["start"], slot_of(now))
        n = len({i for z in doc["zones"].values() for i, c in enumerate(z["c"]) if c is not None})
        cal["days"][d] = {"n": n, **day_summary(doc, reg, first, last)}
    cal["days"] = dict(sorted(cal["days"].items()))
    cal["updated_at"] = iso_utc(now)
    put_json(private, STATE_CALENDAR, cal)
    pub = dict(cal)
    pub["holidays"] = load_holidays(private, range(int(cal["start"][:4]), to_kst(now).year + 2))
    put_json(web, "data/calendar.json", pub, gz=True, cache_control=CACHE_SHORT)
    return doc


def build_latest(state: dict, reg: ZoneRegistry, now: datetime, start: str | None) -> dict:
    """Per-zone values are published only if they came from the latest successful call and weren't STALE;
    otherwise p/c are null with a MISSING/STALE flag so the page never shows old values as current."""
    zs = state.get("zones", {})
    cur_slot = state.get("slot")
    items = []
    for z in reg.zones:
        r = zs.get(z.id) or {}
        flags = list(r.get("flags", []))
        fresh = bool(r) and r.get("slot_ts_kst") == cur_slot and "STALE" not in flags
        if r and r.get("slot_ts_kst") != cur_slot:
            flags.append("MISSING")
        items.append({**z.meta(), "p": r.get("parking") if fresh else None, "c": r.get("capacity") if fresh else None,
                      "ts": r.get("source_ts"), "slot": r.get("slot_ts_kst"), "flags": flags})
    tss = [r.get("source_ts") for r in zs.values() if r.get("source_ts") and r.get("slot_ts_kst") == cur_slot]
    source_ts = max(tss) if tss else None
    return {"v": 1, "generated_at": iso_utc(now), "last_attempt_at": state.get("last_attempt_at"),
            "last_ok_at": state.get("last_ok_at"), "ok": state.get("ok", False), "error": state.get("error"),
            "slot": state.get("slot"), "source_ts": source_ts, "stale": is_stale(source_ts, to_kst(now)),
            "start": start, "zones": items}


# ---------- collect ----------

def raw_parking_path(slot_key_: str) -> str:
    return f"raw/parking/{slot_key_[:4]}/{slot_key_[5:7]}/{slot_key_[8:10]}/{slot_key_[11:13]}{slot_key_[14:16]}.json"


def run_collect(private: Store, web: Store, key: str, now: datetime | None = None, fetch=None,
                reg: ZoneRegistry | None = None) -> dict:
    now = now or now_utc()
    reg = reg or registry()
    fetch = fetch or api.fetch_parking
    slot = slot_of(now)
    meta, body = fetch(key)
    raw = {"source": "parking", "collected_at_utc": now.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
           "slot_kst": slot_key(slot), **meta, "body": body}
    private.put(raw_parking_path(raw["slot_kst"]), json.dumps(raw, ensure_ascii=False).encode("utf-8"),
                content_type="application/json")
    return ingest(private, web, raw, now, reg)


def ingest(private: Store, web: Store, raw: dict, now: datetime, reg: ZoneRegistry) -> dict:
    state = get_json(private, STATE_LATEST) or {}
    state["last_attempt_at"] = iso_utc(parse_iso(raw["collected_at_utc"]))
    result = {"slot": raw["slot_kst"], "ok": False, "rows": 0, "unknown": []}
    if raw.get("error"):
        state.update(ok=False, error=raw["error"])
        log.warning("parking call failed slot=%s error=%s", raw["slot_kst"], raw["error"])
    else:
        prev = {zid: {"slot": r.get("slot_ts_kst"), "source_ts": r.get("source_ts"), "capacity": r.get("capacity")}
                for zid, r in state.get("zones", {}).items()}
        rows, unknown = normalize_parking(raw, reg, prev)
        if unknown:
            log.warning("unknown parking zones: %s", unknown)
        missing = sorted({z.id for z in reg.zones if not z.active_to} - {r["zone_id"] for r in rows})
        if rows and missing:
            log.warning("zones missing from response slot=%s: %s", raw["slot_kst"], missing)
        d = raw["slot_kst"][:10]
        if rows:
            private.append(obs_path(d), rows_to_jsonl(rows))
            prev_slot = state.get("slot")
            zones = state.get("zones", {})
            zones.update({r["zone_id"]: r for r in rows})
            state.update(ok=True, error=None, last_ok_at=state["last_attempt_at"], slot=raw["slot_kst"], zones=zones)
            put_json(private, STATE_LATEST, state)
            if prev_slot and prev_slot[:10] < d:
                publish_day(private, web, prev_slot[:10], reg, now, final=True)
            publish_day(private, web, d, reg, now)
            result.update(ok=True, rows=len(rows), unknown=unknown, missing=missing)
        else:
            state.update(ok=False, error="empty response")
            log.warning("parking call returned no items slot=%s", raw["slot_kst"])
    if not result["ok"]:
        put_json(private, STATE_LATEST, state)
    cal = get_json(private, STATE_CALENDAR) or {}
    put_json(web, "data/latest.json", build_latest(state, reg, now, cal.get("start")), gz=True,
             cache_control=CACHE_SHORT)
    return result


# ---------- rebuild (backfill / repair) ----------

def rebuild_obs(private: Store, d: str, reg: ZoneRegistry) -> int:
    """Regenerate obs/<d>.jsonl from every raw parking record of that date (idempotent)."""
    rows, prev = [], {}
    paths = private.list(f"raw/parking/{_ymd(d)}/")
    raws = [get_json(private, p) for p in paths]
    for raw in sorted((r for r in raws if r), key=lambda r: (r["slot_kst"], r["collected_at_utc"])):
        rs, _ = normalize_parking(raw, reg, prev)
        rows.extend(rs)
        prev.update(prev_state(rs))
    if hasattr(private, "put_append"):
        private.put_append(obs_path(d), rows_to_jsonl(rows))
    else:
        private.put(obs_path(d), rows_to_jsonl(rows), content_type="application/x-ndjson")
    return len(rows)


# ---------- exog ----------

def run_exog(private: Store, key: str, now: datetime | None = None, fetch_passenger=None, fetch_holidays=None) -> dict:
    now = now or now_utc()
    fetch_passenger = fetch_passenger or api.fetch_passenger
    fetch_holidays = fetch_holidays or api.fetch_holidays
    k = to_kst(now)
    parts = {}
    for sel in (0, 1):
        meta, body = fetch_passenger(key, sel)
        parts[str(sel)] = {**meta, "body": body}
    raw = {"source": "passenger", "collected_at_utc": iso_utc(now), "selectdate": parts}
    private.put(f"raw/passenger/{k:%Y/%m/%d/%H}.json", json.dumps(raw, ensure_ascii=False).encode("utf-8"),
                content_type="application/json")
    docs = normalize_passenger(raw)
    for d, doc in docs.items():
        put_json(private, f"exog/passenger/{_ymd(d)}.json", doc)
    errors = {s: p["error"] for s, p in parts.items() if p["error"]}
    if errors:
        log.warning("passenger call failed: %s", errors)

    refreshed = []
    for y in (k.year, k.year + 1) if k.month >= 10 else (k.year,):
        path = f"exog/calendar/{y}.json"
        cur = get_json(private, path)
        if cur and cur.get("fetched_month") == f"{k:%Y-%m}":
            continue
        meta, body = fetch_holidays(key, y)
        if meta["error"]:
            log.warning("holiday call failed year=%s error=%s", y, meta["error"])
            continue
        put_json(private, path, {"year": y, "fetched_at_utc": iso_utc(now), "fetched_month": f"{k:%Y-%m}",
                                 "holidays": normalize_holidays(body)})
        refreshed.append(y)
    return {"passenger_days": sorted(docs), "passenger_errors": errors, "holidays_refreshed": refreshed}
