from __future__ import annotations

import asyncio
import json

from app.config import settings
from app.pincode import _nominatim_lookup_sync, _postal_lookup_sync, resolve_pincode


def test_postal_lookup_extracts_city_state_and_post_offices(monkeypatch):
    payload = [{
        "Status": "Success",
        "PostOffice": [
            {"Name": "Example HO", "District": "Agra", "State": "Uttar Pradesh", "Division": "Agra"},
            {"Name": "Example BO", "District": "Agra", "State": "Uttar Pradesh", "Division": "Agra"},
        ],
    }]

    class FakeResponse:
        def __enter__(self): return self
        def __exit__(self, exc_type, exc, tb): return False
        def read(self, size=-1): return json.dumps(payload).encode()

    monkeypatch.setattr("app.pincode.urlopen", lambda request, timeout: FakeResponse())
    city, district, state, offices = _postal_lookup_sync("282001")
    assert city == "Agra"
    assert district == "Agra"
    assert state == "Uttar Pradesh"
    assert offices == ("Example HO", "Example BO")


def test_nominatim_lookup_extracts_coordinates(monkeypatch):
    payload = [{
        "display_name": "Example, Agra, Uttar Pradesh, India",
        "lat": "27.1767",
        "lon": "78.0081",
        "address": {"city": "Agra", "state": "Uttar Pradesh"},
    }]

    class FakeResponse:
        def __enter__(self): return self
        def __exit__(self, exc_type, exc, tb): return False
        def read(self, size=-1): return json.dumps(payload).encode()

    monkeypatch.setattr("app.pincode.urlopen", lambda request, timeout: FakeResponse())
    city, lat, lon, display = _nominatim_lookup_sync("282001")
    assert city == "Agra"
    assert lat == 27.1767
    assert lon == 78.0081
    assert display.startswith("Example")


def test_resolve_pincode_coalesces_and_caches(monkeypatch):
    old_ttl = settings.pin_resolver_cache_ttl_seconds
    object.__setattr__(settings, "pin_resolver_cache_ttl_seconds", 3600)
    import app.pincode as resolver
    resolver._CACHE.clear()
    resolver._INFLIGHT.clear()
    calls = {"postal": 0, "geo": 0}

    async def fake_postal(pin):
        calls["postal"] += 1
        return "Agra", "Agra", "Uttar Pradesh", ("Example HO",)

    async def fake_geo(pin):
        calls["geo"] += 1
        return "Agra", 27.17, 78.00, "Example"

    monkeypatch.setattr(resolver, "_postal_lookup_sync", lambda pin: ("Agra", "Agra", "Uttar Pradesh", ("Example HO",)))
    monkeypatch.setattr(resolver, "_rate_limited_nominatim", fake_geo)

    async def run():
        first, second = await asyncio.gather(resolve_pincode("282001"), resolve_pincode("282001"))
        third = await resolve_pincode("282001")
        return first, second, third

    first, second, third = asyncio.run(run())
    assert first == second == third
    assert calls["geo"] == 1
    assert first.city == "Agra"
    assert first.latitude == 27.17
    assert first.longitude == 78.0
    object.__setattr__(settings, "pin_resolver_cache_ttl_seconds", old_ttl)
