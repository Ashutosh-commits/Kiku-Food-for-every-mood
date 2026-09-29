import asyncio
from app.config import settings
from app.providers.apify import ApifyProvider


def test_shahid_sample_keyword_result_produces_matched_dish(monkeypatch):
    original_enabled = settings.apify_swiggy_enabled
    original_token = settings.apify_swiggy_token
    original_actor = settings.apify_swiggy_actor
    object.__setattr__(settings, "apify_swiggy_enabled", True)
    object.__setattr__(settings, "apify_swiggy_token", "test-token")
    object.__setattr__(settings, "apify_swiggy_actor", "shahidirfan~swiggy-restaurant-scraper")
    try:
        provider = ApifyProvider("swiggy")
        async def fake_request(payload):
            assert payload["location"] == "Aligarh"
            assert payload["keyword"] == "biryani"
            return [{
                "restaurantId": "427151",
                "name": "Behrouz Biryani",
                "url": "https://www.swiggy.com/city/aligarh/behrouz-biryani-civil-lines-rest427151",
                "city": "Aligarh",
                "areaName": "Civil Lines",
                "cuisines": ["Biryani"],
                "avgRating": 4.4,
                "deliveryTime": 45,
                "matchedDishes": [{
                    "name": "Chicken Biryani",
                    "category": "Biryani",
                    "price": "INR 240.00",
                    "finalPrice": "INR 220.00",
                    "isVeg": False,
                    "inStock": True,
                }],
            }]
        monkeypatch.setattr(provider, "_request", fake_request)
        items = asyncio.run(provider.search_restaurants_async("Aligarh", "", "202001", {"city":"Aligarh", "pincode_resolved":True, "postal_offices":["Civil Lines"]}))
        assert len(items) == 1
        assert items[0].pincode_verified is True
        assert items[0].metadata["matchedDishes"][0]["finalPrice"] == "INR 220.00"
    finally:
        object.__setattr__(settings, "apify_swiggy_enabled", original_enabled)
        object.__setattr__(settings, "apify_swiggy_token", original_token)
        object.__setattr__(settings, "apify_swiggy_actor", original_actor)
