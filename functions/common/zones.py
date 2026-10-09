import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import yaml

ZONES_FILE = Path(__file__).resolve().parent.parent / "config" / "zones.yaml"
CATEGORY_ORDER = {"단기": 0, "장기": 1, "타워": 2, "예약": 3}


@dataclass(frozen=True)
class Zone:
    id: str
    terminal: str
    category: str
    name: str
    order: int
    raw_names: tuple[str, ...]
    active_from: str
    active_to: str | None = None

    @property
    def in_total(self) -> bool:
        return self.category != "예약"

    def meta(self) -> dict:
        return {"id": self.id, "terminal": self.terminal, "category": self.category, "name": self.name,
                "order": self.order, "active_from": self.active_from, "active_to": self.active_to}


def squash(s: str) -> str:
    return re.sub(r"\s+", "", s or "")


class ZoneRegistry:
    def __init__(self, zones: list[Zone]):
        self.zones = sorted(zones, key=lambda z: (z.terminal, z.order))
        self.by_id = {z.id: z for z in self.zones}
        self._by_raw = {squash(n): z for z in self.zones for n in z.raw_names}

    def match(self, floor: str) -> Zone | None:
        return self._by_raw.get(squash(floor))

    def terminal(self, t: str) -> list[Zone]:
        return [z for z in self.zones if z.terminal == t]


def load_zones(path: Path = ZONES_FILE) -> ZoneRegistry:
    doc = yaml.safe_load(path.read_text(encoding="utf-8"))
    zones = [Zone(id=z["id"], terminal=z["terminal"], category=z["category"], name=z["name"], order=int(z["order"]),
                  raw_names=tuple(z["raw_names"]), active_from=str(z.get("active_from")),
                  active_to=str(z["active_to"]) if z.get("active_to") else None) for z in doc["zones"]]
    return ZoneRegistry(zones)


@lru_cache(maxsize=1)
def registry() -> ZoneRegistry:
    return load_zones()
