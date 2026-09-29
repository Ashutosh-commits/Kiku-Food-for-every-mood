from __future__ import annotations

import asyncio

from app.config import settings
from app.models import SearchRequest
from app.providers.apify import ApifyProvider


def test_apify_provider_uses_working_swiggy_actor_and_separate_tokens():
    old_sw = settings.apify_swiggy_token
    old_zo = settings.apify_zomato_token
    old_zo_enabled = settings.apify_zomato_enabled
    old_sw_actor = settings.apify_swiggy_actor
    object.__setattr__(settings, "apify_swiggy_token", "sw-token")
    object.__setattr__(settings, "apify_zomato_token", "zo-token")
    object.__setattr__(settings, "apify_zomato_enabled", True)
    object.__setattr__(settings, "apify_swiggy_actor", "shahidirfan~swiggy-restaurant-scraper")
    try:
        assert ApifyProvider("swiggy").enabled
        assert ApifyProvider("zomato").enabled
        assert ApifyProvider("swiggy").actor_id == "shahidirfan~swiggy-restaurant-scraper"
        assert ApifyProvider("zomato").actor_id == "thirdwatch~zomato-scraper"
    finally:
        object.__setattr__(settings, "apify_swiggy_token", old_sw)
        object.__setattr__(settings, "apify_zomato_token", old_zo)
        object.__setattr__(settings, "apify_zomato_enabled", old_zo_enabled)
        object.__setattr__(settings, "apify_swiggy_actor", old_sw_actor)


def test_apify_uses_bearer_header_and_bounded_response(monkeypatch):
    old_token = settings.apify_swiggy_token
    old_actor = settings.apify_swiggy_actor
    old_limit = settings.apify_response_max_bytes
    object.__setattr__(settings, "apify_swiggy_token", "secret-token")
    object.__setattr__(settings, "apify_swiggy_actor", "shahidirfan~swiggy-restaurant-scraper")
    object.__setattr__(settings, "apify_response_max_bytes", 1024)
    captured = {}

    class FakeResponse:
        def __enter__(self): return self
        def __exit__(self, exc_type, exc, tb): return False
        def read(self, size=-1):
            captured["read_size"] = size
            return b"[]"

    def fake_urlopen(request, timeout):
        captured["url"] = request.full_url
        captured["authorization"] = request.get_header("Authorization")
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr("app.providers.apify.urlopen", fake_urlopen)
    try:
        provider = ApifyProvider("swiggy")
        assert provider._request_sync({"location": "Aligarh", "keyword": "biryani"}) == []
        assert captured["authorization"] == "Bearer secret-token"
        assert "secret-token" not in captured["url"]
        assert captured["read_size"] == 1025
        assert captured["timeout"] == settings.apify_timeout_seconds
    finally:
        object.__setattr__(settings, "apify_swiggy_token", old_token)
        object.__setattr__(settings, "apify_swiggy_actor", old_actor)
        object.__setattr__(settings, "apify_response_max_bytes", old_limit)


def test_shahid_swiggy_regional_payload_and_matched_dishes(monkeypatch):
    old = settings.apify_swiggy_token
    old_actor = settings.apify_swiggy_actor
    old_keyword = settings.apify_swiggy_region_keyword
    object.__setattr__(settings, "apify_swiggy_token", "sw-token")
    object.__setattr__(settings, "apify_swiggy_actor", "shahidirfan~swiggy-restaurant-scraper")
    object.__setattr__(settings, "apify_swiggy_region_keyword", "biryani")
    try:
        provider = ApifyProvider("swiggy")
        captured = {}
        async def fake_request(payload):
            captured.update(payload)
            return [{
                "restaurantId": "1",
                "name": "Test Biryani",
                "url": "https://www.swiggy.com/city/aligarh/test-rest1",
                "city": "Aligarh",
                "areaName": "Civil Lines",
                "matchedDishes": [{"name": "Chicken Biryani", "finalPrice": "INR 220.00", "isVeg": False}],
            }]
        monkeypatch.setattr(provider, "_request", fake_request)
        candidates = asyncio.run(provider.search_restaurants_async("Aligarh", "", pincode="202001", location_context={"city": "Aligarh", "postal_offices": ["Aligarh"]}))
        assert captured == {"location": "Aligarh", "resultsWanted": settings.apify_swiggy_max_results, "maxPages": settings.apify_swiggy_region_max_pages, "keyword": "biryani"}
        assert candidates[0].metadata["matchedDishes"][0]["name"] == "Chicken Biryani"
    finally:
        object.__setattr__(settings, "apify_swiggy_token", old)
        object.__setattr__(settings, "apify_swiggy_actor", old_actor)
        object.__setattr__(settings, "apify_swiggy_region_keyword", old_keyword)


def test_shahid_swiggy_dish_search_uses_one_actor_run(monkeypatch):
    old = settings.apify_swiggy_token
    old_actor = settings.apify_swiggy_actor
    object.__setattr__(settings, "apify_swiggy_token", "sw-token")
    object.__setattr__(settings, "apify_swiggy_actor", "shahidirfan~swiggy-restaurant-scraper")
    try:
        provider = ApifyProvider("swiggy")
        captured = {}
        async def fake_request(payload):
            captured.update(payload)
            return [{
                "name": "Cafe Agra",
                "url": "https://www.swiggy.com/city/agra/cafe-rest2",
                "city": "Agra",
                "matchedDishes": [{"name": "Paneer Tikka", "finalPrice": "INR 249.00", "isVeg": True}],
            }]
        monkeypatch.setattr(provider, "_request", fake_request)
        items = asyncio.run(provider.get_dish_menu_async("Agra", "Cafe Agra", "Paneer Tikka", pincode="282001", location_context={"city": "Agra", "postal_offices": ["Agra"]}))
        assert captured["location"] == "Agra"
        assert captured["keyword"] == "Paneer Tikka"
        assert len(items) == 1
        assert items[0].dish_name == "Paneer Tikka"
        assert items[0].price == 249.0
    finally:
        object.__setattr__(settings, "apify_swiggy_token", old)
        object.__setattr__(settings, "apify_swiggy_actor", old_actor)


def test_pincode_only_search_request_is_valid():
    request = SearchRequest(location=None, pincode="282001", restaurant="Cafe Agra", dish="Paneer Tikka")
    assert request.location is None
    assert request.pincode == "282001"


def test_apify_zomato_can_be_disabled_without_falling_back_to_actor(monkeypatch):
    old_enabled = settings.apify_zomato_enabled
    old_token = settings.apify_zomato_token
    object.__setattr__(settings, "apify_zomato_enabled", False)
    object.__setattr__(settings, "apify_zomato_token", "zo-token")
    try:
        assert ApifyProvider("zomato").enabled is False
    finally:
        object.__setattr__(settings, "apify_zomato_enabled", old_enabled)
        object.__setattr__(settings, "apify_zomato_token", old_token)


def test_legacy_swiggy_actor_setting_is_migrated_to_working_actor():
    old_token = settings.apify_swiggy_token
    old_actor = settings.apify_swiggy_actor
    object.__setattr__(settings, "apify_swiggy_token", "sw-token")
    object.__setattr__(settings, "apify_swiggy_actor", "thirdwatch~swiggy-scraper")
    try:
        assert ApifyProvider("swiggy").actor_id == "shahidirfan~swiggy-restaurant-scraper"
    finally:
        object.__setattr__(settings, "apify_swiggy_token", old_token)
        object.__setattr__(settings, "apify_swiggy_actor", old_actor)


def test_shahid_swiggy_region_keyword_set_covers_planned_dish_families(monkeypatch):
    old_token = settings.apify_swiggy_token
    old_actor = settings.apify_swiggy_actor
    old_keywords = settings.apify_swiggy_region_keywords
    object.__setattr__(settings, "apify_swiggy_token", "sw-token")
    object.__setattr__(settings, "apify_swiggy_actor", "shahidirfan~swiggy-restaurant-scraper")
    object.__setattr__(settings, "apify_swiggy_region_keywords", ("biryani", "paneer", "pizza"))
    try:
        provider = ApifyProvider("swiggy")
        seen = []
        async def fake_request(payload):
            seen.append(payload["keyword"])
            return [{
                "restaurantId": "1",
                "name": "Test Restaurant",
                "url": "https://www.swiggy.com/city/aligarh/test-restaurant-rest1",
                "city": "Aligarh",
                "matchedDishes": [{"name": f"{payload['keyword']} dish", "finalPrice": "INR 100.00", "isVeg": True}],
            }]
        monkeypatch.setattr(provider, "_request", fake_request)
        candidates = []
        import asyncio
        async def run():
            merged = {}
            for keyword in settings.apify_swiggy_region_keywords:
                for candidate in await provider.search_restaurants_for_keyword_async("Aligarh", "", "202001", {"city":"Aligarh", "pincode_resolved":True}, keyword):
                    existing = merged.get(candidate.url)
                    if existing is None:
                        merged[candidate.url] = candidate
                    else:
                        existing.metadata["matchedDishes"].extend(candidate.metadata["matchedDishes"])
            return list(merged.values())
        candidates = asyncio.run(run())
        assert seen == ["biryani", "paneer", "pizza"]
        assert len(candidates) == 1
        assert len(candidates[0].metadata["matchedDishes"]) == 3
    finally:
        object.__setattr__(settings, "apify_swiggy_token", old_token)
        object.__setattr__(settings, "apify_swiggy_actor", old_actor)
        object.__setattr__(settings, "apify_swiggy_region_keywords", old_keywords)


def test_swggy_menu_actor_batch_normalization(monkeypatch):
    from app.providers.apify import ApifyProvider
    from app.providers.base import RestaurantCandidate
    old_token = settings.apify_swiggy_token
    old_actor = settings.apify_swiggy_actor
    object.__setattr__(settings, "apify_swiggy_token", "test")
    object.__setattr__(settings, "apify_swiggy_actor", "shahidirfan~swiggy-restaurant-scraper")
    provider = ApifyProvider("swiggy")

    async def fake_request(payload, actor_id=None):
        assert actor_id == "smacient~swiggy-restaurant-menu-extractor"
        assert payload["restaurantIds"] == ["427151", "470304"]
        assert payload["restaurantNames"] == ["Behrouz Biryani", "Lazeez Biryani House"]
        return [
            {"restaurantId":"427151","restaurantName":"Behrouz Biryani","itemName":"Dum Gosht Biryani","price":"579","finalPrice":"549","categoryName":"Recommended","itemDescription":"Dum cooked mutton biryani","isVeg":False,"inStock":True,"imageUrl":"https://example.com/a.jpg"},
            {"restaurantId":"470304","restaurantName":"Lazeez Biryani House","itemName":"Chicken Biryani","price":"299","finalPrice":"279","categoryName":"Biryani","isVeg":False,"inStock":True,"imageUrl":"https://example.com/b.jpg"},
        ]
    monkeypatch.setattr(provider, "_request", fake_request)
    candidates = [
        RestaurantCandidate("Behrouz Biryani", "Civil Lines", "https://www.swiggy.com/city/aligarh/behrouz-biryani-rest427151", "swiggy", "202001", True, {"restaurantId":"427151"}),
        RestaurantCandidate("Lazeez Biryani House", "Civil Lines", "https://www.swiggy.com/city/aligarh/lazeez-biryani-rest470304", "swiggy", "202001", True, {"restaurantId":"470304"}),
    ]
    import asyncio
    offers = asyncio.run(provider.get_region_menus_async("Aligarh", "Civil Lines", candidates, "202001", {"city":"Aligarh","pincode_resolved":True}))
    assert len(offers) == 2
    assert offers[0].final_price == 549.0
    assert offers[0].category_name == "Recommended"
    assert offers[1].restaurant_name == "Lazeez Biryani House"
    object.__setattr__(settings, "apify_swiggy_token", old_token)
    object.__setattr__(settings, "apify_swiggy_actor", old_actor)
