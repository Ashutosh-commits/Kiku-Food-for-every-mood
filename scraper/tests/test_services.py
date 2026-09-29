import asyncio

import pytest

from app.models import SearchRequest
from app.services import compare, scrape_region


class FakeItem:
    def __init__(self, platform, name, url, pincode="282001"):
        self.restaurant_name = "Cafe Agra"
        self.restaurant_url = url
        self.dish_name = name
        self.price = 100.0
        self.eta_minutes = 20
        self.delivery_fee = None
        self.dish_url = None
        self.dietary_tags = ["vegetarian"]
        self.vegetarian_verified = True
        self.vegan_verified = False
        self.allergens = []
        self.allergen_verified = True
        self.allergen_free_for = []
        self.region_pincode = pincode
        self.region_verified = True


@pytest.mark.asyncio
async def test_identical_comparisons_are_coalesced(monkeypatch):
    calls = {"swiggy": 0, "zomato": 0}

    async def fake_sw(self, location, restaurant, restaurant_url=None, pincode=None):
        calls["swiggy"] += 1
        await asyncio.sleep(0.05)
        return [FakeItem("swiggy", "Paneer Tikka", "https://www.swiggy.com/cafe")]

    async def fake_zo(self, location, restaurant, restaurant_url=None, pincode=None):
        calls["zomato"] += 1
        await asyncio.sleep(0.05)
        return [FakeItem("zomato", "Paneer Tikka", "https://www.zomato.com/cafe")]

    monkeypatch.setattr("app.providers.swiggy.SwiggyProvider.get_menu_async", fake_sw)
    monkeypatch.setattr("app.providers.zomato.ZomatoProvider.get_menu_async", fake_zo)

    request = SearchRequest(location="Agra", restaurant="Cafe Agra", dish="Paneer Tikka", pincode="282001")
    results = await asyncio.gather(compare(request), compare(request), compare(request))
    assert all(result.offers for result in results)
    assert calls == {"swiggy": 1, "zomato": 0}


@pytest.mark.asyncio
async def test_provider_failure_is_generic_by_default(monkeypatch):
    async def explode(self, location, restaurant, restaurant_url=None, pincode=None):
        raise RuntimeError("SECRET_PROVIDER_DETAIL")
    monkeypatch.setattr("app.providers.swiggy.SwiggyProvider.get_menu_async", explode)
    monkeypatch.setattr("app.providers.zomato.ZomatoProvider.get_menu_async", explode)
    from app.config import settings
    previous = settings.debug_errors
    object.__setattr__(settings, "debug_errors", False)
    try:
        result = await compare(SearchRequest(location="Aligarh", restaurant="Debug Cafe", pincode="202001"))
        assert all("SECRET_PROVIDER_DETAIL" not in warning for warning in result.warnings)
    finally:
        object.__setattr__(settings, "debug_errors", previous)


@pytest.mark.asyncio
async def test_provider_failure_can_include_diagnostics_for_local_debug(monkeypatch):
    async def explode(self, location, restaurant, restaurant_url=None, pincode=None):
        raise RuntimeError("SECRET_PROVIDER_DETAIL")
    monkeypatch.setattr("app.providers.swiggy.SwiggyProvider.get_menu_async", explode)
    monkeypatch.setattr("app.providers.zomato.ZomatoProvider.get_menu_async", explode)
    from app.config import settings
    previous = settings.debug_errors
    object.__setattr__(settings, "debug_errors", True)
    try:
        result = await compare(SearchRequest(location="Meerut", restaurant="Debug Cafe 2", pincode="250001"))
        assert any("SECRET_PROVIDER_DETAIL" in warning for warning in result.warnings)
    finally:
        object.__setattr__(settings, "debug_errors", previous)


@pytest.mark.asyncio
async def test_regional_discovery_uses_realdata_when_configured(monkeypatch):
    from app.config import settings

    original = settings.realdata_api_key
    object.__setattr__(settings, "realdata_api_key", "test-realdata-key")
    calls = {"search": 0, "menu": 0}

    class Candidate:
        name = "Cafe Agra"
        address = "Agra"
        url = "https://www.swiggy.com/cafe-agra"
        provider = "swiggy"
        pincode = "282001"
        pincode_verified = True

    async def fake_search(self, location, restaurant, pincode=None, location_context=None):
        calls["search"] += 1
        return [Candidate()]

    async def fake_menu(self, location, restaurant, restaurant_url=None, pincode=None, location_context=None):
        calls["menu"] += 1
        from app.providers.base import DishOffer
        return [DishOffer(
            restaurant_name="Cafe Agra",
            restaurant_url="https://www.swiggy.com/cafe-agra",
            dish_name="Paneer Tikka",
            price=249.0,
            region_pincode=pincode,
            region_verified=True,
            provider_evidence="realdata-api",
        )]

    monkeypatch.setattr("app.providers.realdataapi.RealDataProvider.search_restaurants_async", fake_search)
    monkeypatch.setattr("app.providers.realdataapi.RealDataProvider.get_menu_async", fake_menu)
    async def fake_resolve(_pincode):
        from app.pincode import PinLocation
        return PinLocation(pincode="282001", city="Agra", district="Agra", state="Uttar Pradesh", latitude=27.17, longitude=78.04, display_name="Agra", postal_offices=("Agra",))
    monkeypatch.setattr("app.services.resolve_pincode", fake_resolve)
    try:
        result = await scrape_region("282001")
        assert result.pincode == "282001"
        assert result.dishes
        assert calls["search"] == 1
        assert calls["menu"] == 1
    finally:
        object.__setattr__(settings, "realdata_api_key", original)
