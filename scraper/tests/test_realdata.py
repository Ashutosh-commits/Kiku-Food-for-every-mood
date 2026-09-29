from __future__ import annotations

import asyncio

from app.config import settings
from app.providers.realdataapi import RealDataProvider


def test_realdata_provider_is_disabled_without_key():
    original = settings.realdata_api_key
    object.__setattr__(settings, "realdata_api_key", "")
    try:
        provider = RealDataProvider("swiggy")
        assert provider.enabled is False
        assert asyncio.run(provider.get_menu_async("Agra", "Cafe")) == []
    finally:
        object.__setattr__(settings, "realdata_api_key", original)


def test_realdata_provider_normalizes_menu_payload(monkeypatch):
    original = settings.realdata_api_key
    object.__setattr__(settings, "realdata_api_key", "test-key")
    try:
        provider = RealDataProvider("swiggy")
        async def fake_request(path, params):
            assert path == settings.realdata_swiggy_menu_path
            return {
                "items": [
                    {
                        "restaurant_name": "Cafe Agra",
                        "restaurant_url": "https://www.swiggy.com/city/agra/cafe",
                        "item_name": "Paneer Tikka",
                        "price": 249,
                        "is_veg": True,
                    }
                ]
            }
        monkeypatch.setattr(provider, "_request", fake_request)
        items = asyncio.run(provider.get_menu_async("Agra", "Cafe Agra", "https://www.swiggy.com/city/agra/cafe", "282001"))
        assert len(items) == 1
        assert items[0].dish_name == "Paneer Tikka"
        assert items[0].price == 249.0
        assert items[0].vegetarian_verified is True
        assert items[0].restaurant_url.endswith("/cafe")
    finally:
        object.__setattr__(settings, "realdata_api_key", original)
