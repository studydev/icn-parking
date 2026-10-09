from datetime import date, datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
SLOTS_PER_DAY = 288


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def to_kst(dt: datetime) -> datetime:
    return dt.astimezone(KST)


def slot_of(dt: datetime) -> datetime:
    """KST time floored to the 5-minute slot."""
    k = to_kst(dt)
    return k.replace(minute=k.minute - k.minute % 5, second=0, microsecond=0)


def slot_key(slot: datetime) -> str:
    return slot.strftime("%Y-%m-%dT%H:%M")


def parse_slot_key(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%dT%H:%M").replace(tzinfo=KST)


def slot_index(slot: datetime) -> int:
    return slot.hour * 12 + slot.minute // 5


def parse_datetm(s: str) -> datetime | None:
    """API `datetm` is `yyyyMMddHHmmss.fff` in KST."""
    if not s:
        return None
    try:
        return datetime.strptime(s.split(".")[0], "%Y%m%d%H%M%S").replace(tzinfo=KST)
    except ValueError:
        return None


def iso_utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def parse_iso(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def day_path(d: date) -> str:
    return f"{d:%Y/%m/%d}"
