from __future__ import annotations

import time
from collections import OrderedDict
from dataclasses import dataclass
from threading import RLock


@dataclass
class CacheEntry:
    value: object
    expires_at: float


class TTLCache:
    def __init__(self, ttl_seconds: int, max_items: int = 128):
        self.ttl_seconds = ttl_seconds
        self.max_items = max_items
        self._items: OrderedDict[str, CacheEntry] = OrderedDict()
        self._lock = RLock()

    def get(self, key: str):
        with self._lock:
            item = self._items.get(key)
            if item is None:
                return None
            if item.expires_at <= time.time():
                self._items.pop(key, None)
                return None
            self._items.move_to_end(key)
            return item.value

    def set(self, key: str, value: object):
        with self._lock:
            self._items[key] = CacheEntry(value, time.time() + self.ttl_seconds)
            self._items.move_to_end(key)
            while len(self._items) > self.max_items:
                self._items.popitem(last=False)
