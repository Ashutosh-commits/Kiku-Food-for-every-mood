from __future__ import annotations

import asyncio
import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from ..config import settings
from ..normalize import parse_price
from ..security import normalize_pincode, validate_provider_url
from .base import DishOffer, RestaurantCandidate


class RealDataAPIError(RuntimeError):
    pass


def _first(mapping: dict, *keys):
    for key in keys:
        value = mapping.get(key)
        if value not in (None, ""):
            return value
    return None


def _as_items(payload):
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, dict):
        return []
    for key in ("items", "results", "restaurants", "menu", "data", "records", "rows"):
        value = payload.get(key)
        if isinstance(value, list):
            return value
        if isinstance(value, dict):
            nested = _as_items(value)
            if nested:
                return nested
    return []


def _restaurant_name(item: dict, fallback: str) -> str:
    restaurant = item.get("restaurant")
    if isinstance(restaurant, dict):
        value = _first(restaurant, "name", "restaurant_name", "title")
        if value:
            return str(value).strip()
    return str(_first(item, "restaurant_name", "restaurantName", "outlet_name", "name") or fallback).strip()


def _restaurant_url(item: dict, fallback: str | None) -> str | None:
    restaurant = item.get("restaurant")
    if isinstance(restaurant, dict):
        value = _first(restaurant, "url", "restaurant_url", "listing_url")
        if value:
            return str(value)
    value = _first(item, "restaurant_url", "restaurantUrl", "url", "listing_url", "source_url")
    return str(value) if value else fallback


def _dish_name(item: dict) -> str | None:
    value = _first(item, "dish_name", "dishName", "item_name", "itemName", "name", "title")
    return str(value).strip() if value else None




def _dish_url(item: dict, fallback: str | None, platform: str) -> str | None:
    value = _first(item, "dish_url", "dishUrl", "item_url", "itemUrl", "itemURL", "listing_url", "listingUrl")
    if value:
        try:
            return validate_provider_url(str(value), platform)
        except ValueError:
            return fallback
    return fallback

def _price(item: dict) -> float | None:
    value = _first(item, "price", "item_price", "dish_price", "sale_price", "display_price")
    if isinstance(value, dict):
        value = _first(value, "amount", "value", "sale", "current")
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return parse_price(str(value))


def _float_value(item: dict, *keys) -> float | None:
    value = _first(item, *keys)
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _int_value(item: dict, *keys) -> int | None:
    value = _first(item, *keys)
    if value in (None, ""):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _bool_value(item: dict, *keys) -> bool | None:
    value = _first(item, *keys)
    if value in (None, ""):
        return None
    if isinstance(value, bool):
        return value
    lowered = str(value).strip().lower()
    if lowered in {"true", "1", "yes", "available", "in stock", "instock"}:
        return True
    if lowered in {"false", "0", "no", "unavailable", "out of stock", "oos"}:
        return False
    return None


def _safe_http_url(item: dict, *keys) -> str | None:
    value = _first(item, *keys)
    if not value:
        return None
    candidate = str(value).strip()
    return candidate if candidate.startswith("https://") or candidate.startswith("http://") else None


def _veg(item: dict) -> bool:
    value = _first(item, "is_veg", "isVeg", "vegetarian", "veg", "veg_only")
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"true", "1", "yes", "veg", "vegetarian"}


def _vegan(item: dict) -> bool:
    value = _first(item, "is_vegan", "isVegan", "vegan")
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"true", "1", "yes", "vegan"}


def _region_verified(item: dict, pincode: str | None) -> bool:
    pin = normalize_pincode(pincode)
    if not pin:
        return True
    values = [
        item.get("pincode"), item.get("pin_code"), item.get("postal_code"), item.get("postalCode"),
        item.get("zipcode"), item.get("zip_code"),
    ]
    address = item.get("address")
    if isinstance(address, dict):
        values.extend(address.get(k) for k in ("pincode", "pin_code", "postal_code", "zipcode"))
        address = " ".join(str(v) for v in address.values() if v is not None)
    if address:
        values.append(address)
    return any(pin == normalize_pincode(str(value)) for value in values if value not in (None, "")) or pin in " ".join(str(v) for v in values if v)


class RealDataProvider:
    """Optional provider backed by Real Data API's documented Swiggy/Zomato endpoints.

    It is disabled unless REALDATA_API_KEY is configured. The public provider pages
    document the endpoint families and bearer-token authentication; exact request
    fields remain configurable because their full reference is account-gated.
    """

    def __init__(self, platform: str):
        self.name = platform
        self.platform = platform
        self.enabled = bool(settings.realdata_api_key)
        if platform == "swiggy":
            self.search_path = settings.realdata_swiggy_search_path
            self.menu_path = settings.realdata_swiggy_menu_path
        elif platform == "zomato":
            self.search_path = settings.realdata_zomato_search_path
            self.menu_path = settings.realdata_zomato_menu_path
        else:
            raise ValueError(f"Unsupported Real Data API platform: {platform}")

    def _request_sync(self, path: str, params: dict[str, str | int | None]) -> object:
        if not self.enabled:
            return []
        clean = {key: value for key, value in params.items() if value not in (None, "")}
        url = f"{settings.realdata_api_base_url}{path}"
        if clean:
            url = f"{url}?{urlencode(clean)}"
        request = Request(
            url,
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {settings.realdata_api_key}",
                "User-Agent": settings.user_agent,
            },
            method="GET",
        )
        try:
            with urlopen(request, timeout=settings.realdata_api_timeout_seconds) as response:
                body = response.read()
        except HTTPError as exc:
            detail = exc.read(500).decode("utf-8", "ignore")
            raise RealDataAPIError(f"{self.platform} Real Data API returned HTTP {exc.code}: {detail[:200]}") from exc
        except URLError as exc:
            raise RealDataAPIError(f"{self.platform} Real Data API request failed: {exc.reason}") from exc
        try:
            return json.loads(body.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise RealDataAPIError(f"{self.platform} Real Data API returned non-JSON data") from exc

    async def _request(self, path: str, params: dict[str, str | int | None]) -> object:
        return await asyncio.to_thread(self._request_sync, path, params)

    async def search_restaurants_async(self, location: str, restaurant: str, pincode: str | None = None) -> list[RestaurantCandidate]:
        if not self.enabled:
            return []
        payload = await self._request(
            self.search_path,
            {
                settings.realdata_query_param: restaurant or "restaurant",
                settings.realdata_location_param: location,
            },
        )
        candidates: list[RestaurantCandidate] = []
        for item in _as_items(payload):
            if not isinstance(item, dict):
                continue
            url = _restaurant_url(item, None)
            if not url:
                continue
            name = _restaurant_name(item, restaurant)
            candidates.append(RestaurantCandidate(
                name=name,
                address=str(_first(item, "address", "locality", "area") or location),
                url=url,
                provider=self.name,
                pincode=normalize_pincode(pincode),
                pincode_verified=_region_verified(item, pincode),
            ))
        return candidates

    async def get_menu_async(self, location: str, restaurant: str, restaurant_url: str | None = None, pincode: str | None = None) -> list[DishOffer]:
        if not self.enabled:
            return []
        if restaurant_url is None:
            candidates = await self.search_restaurants_async(location, restaurant, pincode)
            if not candidates:
                raise RealDataAPIError(f"No {self.platform} restaurant result returned by Real Data API.")
            restaurant_url = candidates[0].url
        payload = await self._request(
            self.menu_path,
            {
                settings.realdata_url_param: restaurant_url,
                settings.realdata_location_param: location,
            },
        )
        normalized_pincode = normalize_pincode(pincode)
        offers: list[DishOffer] = []
        for item in _as_items(payload):
            if not isinstance(item, dict):
                continue
            dish_name = _dish_name(item)
            if not dish_name:
                continue
            source_url = _restaurant_url(item, restaurant_url)
            if not source_url:
                continue
            verified = _region_verified(item, normalized_pincode)
            offers.append(DishOffer(
                restaurant_name=_restaurant_name(item, restaurant),
                restaurant_url=source_url,
                dish_name=dish_name,
                price=_price(item),
                delivery_fee=float(_first(item, "delivery_fee") or 0) if _first(item, "delivery_fee") is not None else None,
                eta_minutes=int(_first(item, "delivery_time_minutes", "eta_minutes") or 0) or None,
                dietary_tags=[str(v) for v in (_first(item, "dietary_tags", "dietaryTags") or [])] if isinstance(_first(item, "dietary_tags", "dietaryTags"), list) else [],
                vegetarian_verified=_veg(item),
                vegan_verified=_vegan(item),
                region_pincode=normalized_pincode,
                region_verified=verified if normalized_pincode else True,
                provider_evidence="realdata-api",
                dish_url=_dish_url(item, None, self.platform),
                description=str(_first(item, "description", "item_description", "itemDescription") or "").strip() or None,
                category_name=str(_first(item, "category", "category_name", "categoryName") or "").strip() or None,
                image_url=_safe_http_url(item, "image_url", "imageUrl", "image", "thumbnail"),
                in_stock=_bool_value(item, "in_stock", "inStock", "available"),
                item_rating=_float_value(item, "rating", "item_rating", "itemRating"),
                item_rating_count=_int_value(item, "rating_count", "ratingCount", "itemRatingCount"),
            ))
        return offers
