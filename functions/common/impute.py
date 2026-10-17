"""Estimate short collection gaps in a published day document.

The API only returns the current state, so a missed slot cannot be fetched later. A gap that is bracketed by two
measured slots with the same operating capacity is filled by linear interpolation of the parking count and the
slot is listed in the zone's `e`. Observations (obs/raw) are never changed: this is a pure function of the
measured day, re-applied on every publish, so a trailing gap is filled as soon as the next measurement arrives.
"""
import copy

MAX_GAP_SLOTS = 6  # 30 minutes
# Bump when the estimation rules change: the collector then re-publishes every finalized day once (see heal_days).
IMPUTE_VERSION = 1


def fill_gaps(doc: dict, max_gap: int = MAX_GAP_SLOTS) -> dict:
    """Return a copy of `doc` whose short gaps hold estimates. Estimated slot indexes are listed in `zone["e"]`."""
    out = copy.deepcopy(doc)
    for z in out["zones"].values():
        filled = _fill_zone(z["p"], z["c"], max_gap)
        if filled:
            z["e"] = filled
    return out


def _bridgeable(p: list, c: list, a: int, b: int) -> bool:
    if p[a] is None or p[b] is None or c[a] is None or c[a] != c[b]:
        return False
    # A capacity already recorded inside the gap (stale rows keep theirs) must agree: otherwise it is a change event.
    return all(c[k] in (None, c[a]) for k in range(a + 1, b))


def _fill_zone(p: list, c: list, max_gap: int) -> list[int]:
    filled: list[int] = []
    n, i = len(p), 0
    while i < n:
        if p[i] is not None:
            i += 1
            continue
        j = i
        while j < n and p[j] is None:
            j += 1
        a, b = i - 1, j  # measured anchors on both sides; a < 0 or b == n means the gap is open-ended
        if a >= 0 and b < n and j - i <= max_gap and _bridgeable(p, c, a, b):
            for k in range(i, j):
                p[k] = round(p[a] + (p[b] - p[a]) * (k - a) / (b - a))
                c[k] = c[a]
                filled.append(k)
        i = j
    return filled
