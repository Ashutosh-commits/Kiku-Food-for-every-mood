from app.config import settings
from app.providers.apify import ApifyProvider


def test_shahid_swiggy_uses_resolved_city_not_post_office():
    original_enabled = settings.apify_swiggy_enabled
    original_token = settings.apify_swiggy_token
    original_actor = settings.apify_swiggy_actor
    object.__setattr__(settings, "apify_swiggy_enabled", True)
    object.__setattr__(settings, "apify_swiggy_token", "test-token")
    object.__setattr__(settings, "apify_swiggy_actor", "shahidirfan~swiggy-restaurant-scraper")
    try:
        provider = ApifyProvider("swiggy")
        payload = provider._location_payload(
            "Aligarh",
            None,
            {
                "city": "Aligarh",
                "postal_offices": ["Civil Lines"],
                "pincode_resolved": True,
            },
        )
        assert payload == {"location": "Aligarh"}
    finally:
        object.__setattr__(settings, "apify_swiggy_enabled", original_enabled)
        object.__setattr__(settings, "apify_swiggy_token", original_token)
        object.__setattr__(settings, "apify_swiggy_actor", original_actor)


def test_swggy_pin_scoped_without_exact_pin_field():
    from app.providers.apify import _pin_from_values
    assert _pin_from_values({"city": "Aligarh"}, "202001", {"city": "Aligarh", "pincode_resolved": True}, "swiggy") is True
