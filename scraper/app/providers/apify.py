from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from urllib.parse import urlparse

from ..config import settings
from ..matching import similarity
from ..normalize import parse_price
from ..security import normalize_pincode, validate_provider_url
from .base import DishOffer, RestaurantCandidate


class ApifyAPIError(RuntimeError):
    pass


class ApifyUnsupportedLocation(ApifyAPIError):
    pass


LOGGER = logging.getLogger("mise.apify")

SWIGGY_CITIES = {
    "bangalore": "bangalore",
    "bengaluru": "bangalore",
    "mumbai": "mumbai",
    "delhi": "delhi",
    "new delhi": "delhi",
    "hyderabad": "hyderabad",
    "chennai": "chennai",
    "kolkata": "kolkata",
    "pune": "pune",
    "ahmedabad": "ahmedabad",
    "jaipur": "jaipur",
    "lucknow": "lucknow",
    "chandigarh": "chandigarh",
    "kochi": "kochi",
    "cochin": "kochi",
    "goa": "goa",
    "indore": "indore",
    "coimbatore": "coimbatore",
    "nagpur": "nagpur",
    "vizag": "vizag",
    "visakhapatnam": "vizag",
    "bhopal": "bhopal",
    "gurgaon": "gurgaon",
    "gurugram": "gurgaon",
    "noida": "noida",
    "surat": "surat",
    "vadodara": "vadodara",
    "baroda": "vadodara",
    "patna": "patna",
    "thiruvananthapuram": "thiruvananthapuram",
    "trivandrum": "thiruvananthapuram",
    "mysore": "mysore",
    "mysuru": "mysore",
    "mangalore": "mangalore",
    "mangaluru": "mangalore",
    "ranchi": "ranchi",
    "bhubaneswar": "bhubaneswar",
    "dehradun": "dehradun",
    "vijayawada": "vijayawada",
}

ZOMATO_CITIES = {
    key: value
    for key, value in SWIGGY_CITIES.items()
    if value in {
        "bangalore", "mumbai", "delhi", "hyderabad", "chennai", "kolkata", "pune",
        "ahmedabad", "jaipur", "lucknow", "chandigarh", "kochi", "goa", "indore",
        "coimbatore", "nagpur", "vizag", "bhopal", "gurgaon", "noida",
    }
}


def _first(mapping: dict, *keys):
    for key in keys:
        value = mapping.get(key)
        if value not in (None, ""):
            return value
    return None


def _as_items(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("items", "results", "data", "records", "rows", "restaurants", "menu", "dataset"):
            value = payload.get(key)
            if isinstance(value, list):
                return value
            if isinstance(value, dict):
                nested = _as_items(value)
                if nested:
                    return nested
    return []


def _as_float(value) -> float | None:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    parsed = parse_price(str(value))
    return float(parsed) if parsed is not None else None


def _as_int(value) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        match = re.search(r"(\d{1,3})", str(value))
        return int(match.group(1)) if match else None


def _truthy(value) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"true", "1", "yes", "y", "veg", "vegetarian", "vegan"}


def _city_from_location(location: str | None, restaurant_url: str | None, supported: dict[str, str]) -> str:
    raw = str(location or "").strip().lower()
    if raw:
        slug = supported.get(raw)
        if slug:
            return slug
    if restaurant_url:
        try:
            parsed = urlparse(restaurant_url)
            parts = [part for part in parsed.path.split("/") if part]
            for part in parts:
                slug = supported.get(part.replace("-", " ")) or supported.get(part)
                if slug:
                    return slug
        except Exception:
            pass
    raise ApifyUnsupportedLocation(
        "The configured Apify Actor only supports its documented city set. "
        "Kiku will not guess a city from a PIN code or silently use the wrong city."
    )


def _pin_from_values(item: dict, pincode: str | None, location_context: dict | None = None, platform: str | None = None) -> bool:
    pin = normalize_pincode(pincode)
    if not pin:
        return True
    values = [
        item.get("pincode"), item.get("pin_code"), item.get("postal_code"), item.get("postalCode"),
        item.get("zipcode"), item.get("zip_code"),
    ]
    address = item.get("address")
    if isinstance(address, dict):
        values.extend(address.get(k) for k in ("pincode", "pin_code", "postal_code", "zipcode", "zip"))
        values.extend(str(v) for v in address.values() if v not in (None, ""))
    elif address:
        values.append(str(address))
    location = item.get("location")
    if isinstance(location, dict):
        values.extend(location.get(k) for k in ("pincode", "pin_code", "postal_code", "zipcode", "zip"))
        values.extend(str(v) for v in location.values() if v not in (None, ""))
    elif location:
        values.append(str(location))
    explicit = any(pin == normalize_pincode(str(value)) for value in values if value not in (None, "")) or pin in " ".join(str(value) for value in values if value not in (None, ""))
    if explicit:
        return True

    context = location_context or {}
    if platform == "swiggy" and context.get("latitude") is not None and context.get("longitude") is not None:
        # Coordinate-scoped provider targeting is strong evidence for the resolved PIN area.
        return True
    if platform == "swiggy" and context.get("city") and context.get("pincode_resolved"):
        # The Shahid Irfan Actor does not currently expose a PIN field in its output.
        # Kiku therefore treats a result returned from the successfully resolved PIN
        # city as PIN-scoped, not as proof that the restaurant exposes that exact PIN.
        # The UI wording makes this distinction explicit.
        return True

    if platform == "zomato":
        expected_city = str(context.get("city") or "").strip().lower()
        observed_city = str(_first(item, "city", "restaurant_city", "area_city") or "").strip().lower()
        if not observed_city:
            nested = item.get("restaurant") if isinstance(item.get("restaurant"), dict) else None
            if nested:
                observed_city = str(_first(nested, "city", "restaurant_city") or "").strip().lower()
        if expected_city and observed_city and expected_city == observed_city:
            return True
    return False


def _restaurant_name(item: dict, fallback: str = "") -> str:
    restaurant = item.get("restaurant")
    if isinstance(restaurant, dict):
        value = _first(restaurant, "name", "restaurant_name", "title")
        if value:
            return str(value).strip()
    return str(_first(item, "restaurant_name", "restaurantName", "name", "title") or fallback).strip()


def _restaurant_url(item: dict, fallback: str | None = None) -> str | None:
    restaurant = item.get("restaurant")
    if isinstance(restaurant, dict):
        value = _first(restaurant, "url", "restaurant_url", "listing_url")
        if value:
            return str(value)
    value = _first(item, "restaurant_url", "restaurantUrl", "url", "listing_url", "source_url")
    return str(value) if value else fallback


def _dish_name(item: dict) -> str | None:
    return str(_first(item, "dish_name", "dishName", "item_name", "itemName", "name", "title") or "").strip() or None


def _nested_menu(item: dict) -> list[dict]:
    for key in ("menu", "menu_items", "menuItems", "items", "dishes"):
        value = item.get(key)
        if isinstance(value, list):
            return [entry for entry in value if isinstance(entry, dict)]
    return []


def _normalize_zomato_menu_item(parent: dict, item: dict, requested_pin: str | None, location_context: dict | None = None) -> DishOffer | None:
    dish_name = _dish_name(item)
    price = _as_float(_first(item, "price", "item_price", "dish_price", "sale_price", "current_price"))
    if not dish_name or price is None:
        return None
    restaurant_name = _restaurant_name(parent, "") or _restaurant_name(item, "Unknown restaurant")
    restaurant_url = _restaurant_url(parent) or _restaurant_url(item)
    if not restaurant_url:
        return None
    try:
        restaurant_url = validate_provider_url(restaurant_url, "zomato")
    except ValueError:
        return None
    return DishOffer(
        restaurant_name=restaurant_name,
        restaurant_url=restaurant_url,
        dish_name=dish_name,
        price=price,
        eta_minutes=_as_int(_first(parent, "delivery_time_minutes", "eta_minutes", "delivery_time")),
        delivery_fee=_as_float(_first(parent, "delivery_fee")),
        dish_url=str(_first(item, "url", "dish_url", "listing_url") or "") or None,
        dietary_tags=[str(value) for value in (_first(item, "dietary_tags", "dietaryTags") or [])] if isinstance(_first(item, "dietary_tags", "dietaryTags"), list) else [],
        vegetarian_verified=_truthy(_first(item, "is_veg", "isVeg", "vegetarian", "veg")),
        vegan_verified=_truthy(_first(item, "is_vegan", "isVegan", "vegan")),
        allergens=[str(value) for value in (_first(item, "allergens") or [])] if isinstance(_first(item, "allergens"), list) else [],
        allergen_verified=bool(_first(item, "allergen_verified", "allergenVerified")),
        allergen_free_for=[str(value) for value in (_first(item, "allergen_free_for", "allergenFreeFor") or [])] if isinstance(_first(item, "allergen_free_for", "allergenFreeFor"), list) else [],
        region_pincode=normalize_pincode(requested_pin),
        region_verified=_pin_from_values(parent, requested_pin, location_context, "zomato"),
        provider_evidence="apify-thirdwatch-zomato",
    )


class ApifyProvider:
    """Thirdwatch Actor adapter using the Apify REST API.

    Each platform has its own token so credentials and usage stay isolated.
    Requests are made server-side with Bearer auth, as recommended by Apify.
    """

    def __init__(self, platform: str):
        if platform not in {"swiggy", "zomato"}:
            raise ValueError(f"Unsupported Apify platform: {platform}")
        self.name = platform
        self.platform = platform
        enabled_flag = settings.apify_swiggy_enabled if platform == "swiggy" else settings.apify_zomato_enabled
        self.token = settings.apify_swiggy_token if platform == "swiggy" else settings.apify_zomato_token
        configured_actor = settings.apify_swiggy_actor if platform == "swiggy" else settings.apify_zomato_actor
        if platform == "swiggy" and configured_actor == "thirdwatch~swiggy-scraper":
            # Migrate the old Kiku default to the actor that has been verified with the current account.
            configured_actor = "shahidirfan~swiggy-restaurant-scraper"
        self.actor_id = configured_actor
        self.max_results = settings.apify_swiggy_max_results if platform == "swiggy" else settings.apify_zomato_max_results
        self.menu_actor_id = settings.apify_swiggy_menu_actor if platform == "swiggy" else None
        self.enabled = bool(enabled_flag and self.token and self.actor_id)
        self.supported_cities = SWIGGY_CITIES if platform == "swiggy" else ZOMATO_CITIES

    @property
    def _is_shahid_swiggy(self) -> bool:
        return self.platform == "swiggy" and self.actor_id == "shahidirfan~swiggy-restaurant-scraper"


    def _actor_run_url(self, actor_id: str | None = None) -> str:
        actor_path = (actor_id or self.actor_id).replace("~", "%7E")
        return f"{settings.apify_api_base_url}/v2/acts/{actor_path}/runs"

    def _run_status_url(self, run_id: str, wait_for_finish: float = 0) -> str:
        suffix = f"?waitForFinish={max(0, min(60, int(wait_for_finish)))}" if wait_for_finish else ""
        return f"{settings.apify_api_base_url}/v2/actor-runs/{run_id}{suffix}"

    def _run_log_url(self, run_id: str) -> str:
        return f"{settings.apify_api_base_url}/v2/actor-runs/{run_id}/log"

    def _dataset_items_url(self, run_id: str) -> str:
        return f"{settings.apify_api_base_url}/v2/actor-runs/{run_id}/dataset/items?format=json"

    def _headers(self, *, accept: str = "application/json") -> dict[str, str]:
        return {"Accept": accept, "Content-Type": "application/json", "Authorization": f"Bearer {self.token}", "User-Agent": settings.user_agent}

    def _read_bounded(self, response, max_bytes: int | None = None) -> bytes:
        limit = max_bytes or settings.apify_response_max_bytes
        body = response.read(limit + 1)
        if len(body) > limit:
            raise ApifyAPIError(f"{self.platform} Apify response exceeded the configured size limit.")
        return body

    def _request_sync(self, payload: dict, actor_id: str | None = None, run_timeout_seconds: float | None = None) -> object:
        if not self.enabled:
            return []
        request = Request(self._actor_run_url(actor_id), data=json.dumps(payload, separators=(",", ":")).encode("utf-8"), headers=self._headers(), method="POST")
        try:
            with urlopen(request, timeout=settings.apify_timeout_seconds) as response:
                body = self._read_bounded(response)
        except HTTPError as exc:
            detail = exc.read(1200).decode("utf-8", "ignore")
            raise ApifyAPIError(f"{self.platform} Apify Actor start returned HTTP {exc.code}: {detail[:500]}") from exc
        except URLError as exc:
            raise ApifyAPIError(f"{self.platform} Apify Actor start failed: {exc.reason}") from exc
        try:
            started = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise ApifyAPIError(f"{self.platform} Apify Actor start returned non-JSON data") from exc
        if isinstance(started, list):
            return started
        run = started.get("data") if isinstance(started, dict) else None
        run_id = str((run or {}).get("id") or "").strip()
        if not run_id:
            raise ApifyAPIError(f"{self.platform} Apify Actor did not return a run ID: {str(started)[:500]}")

        deadline = time.monotonic() + (run_timeout_seconds if run_timeout_seconds is not None else settings.apify_run_timeout_seconds)
        status = str((run or {}).get("status") or "RUNNING")
        last_status = run or {}
        while status in {"READY", "RUNNING"} and time.monotonic() < deadline:
            remaining = max(0.0, deadline - time.monotonic())
            wait_for_finish = min(settings.apify_status_wait_seconds, remaining, 60)
            status_request = Request(self._run_status_url(run_id, wait_for_finish), headers=self._headers(), method="GET")
            try:
                with urlopen(status_request, timeout=max(settings.apify_timeout_seconds, wait_for_finish + 10)) as response:
                    status_body = self._read_bounded(response, 2 * 1024 * 1024)
            except HTTPError as exc:
                detail = exc.read(1200).decode("utf-8", "ignore")
                raise ApifyAPIError(f"{self.platform} Apify run-status returned HTTP {exc.code}: {detail[:500]}") from exc
            except URLError as exc:
                raise ApifyAPIError(f"{self.platform} Apify run-status request failed: {exc.reason}") from exc
            last_status = json.loads(status_body.decode("utf-8")).get("data", {})
            status = str(last_status.get("status") or "")

        if status != "SUCCEEDED":
            log_tail = self._fetch_run_log_tail(run_id)
            detail = f"run {run_id} ended with status {status or 'UNKNOWN'}"
            if log_tail:
                detail += f"; Apify log tail: {log_tail}"
            if time.monotonic() >= deadline and status in {"READY", "RUNNING"}:
                detail += "; Kiku stopped waiting for the Actor run after the configured timeout."
            raise ApifyAPIError(f"{self.platform} Apify Actor {detail}")

        dataset_request = Request(self._dataset_items_url(run_id), headers=self._headers(), method="GET")
        try:
            with urlopen(dataset_request, timeout=settings.apify_timeout_seconds) as response:
                dataset_body = self._read_bounded(response)
        except HTTPError as exc:
            detail = exc.read(1200).decode("utf-8", "ignore")
            raise ApifyAPIError(f"{self.platform} Apify dataset returned HTTP {exc.code}: {detail[:500]}") from exc
        except URLError as exc:
            raise ApifyAPIError(f"{self.platform} Apify dataset request failed: {exc.reason}") from exc
        return json.loads(dataset_body.decode("utf-8"))

    def _fetch_run_log_tail(self, run_id: str) -> str:
        request = Request(self._run_log_url(run_id), headers=self._headers(accept="text/plain"), method="GET")
        try:
            with urlopen(request, timeout=15) as response:
                text = response.read(6001).decode("utf-8", "ignore").strip()
            return " ".join(text.splitlines()[-20:])[-4000:]
        except Exception:
            return ""

    async def _request(self, payload: dict, actor_id: str | None = None, run_timeout_seconds: float | None = None) -> object:
        return await asyncio.to_thread(self._request_sync, payload, actor_id, run_timeout_seconds)

    def _city(self, location: str | None, restaurant_url: str | None, *, allow_missing: bool = False) -> str | None:
        try:
            return _city_from_location(location, restaurant_url, self.supported_cities)
        except ApifyUnsupportedLocation:
            if allow_missing:
                return None
            raise

    def _location_payload(self, location: str | None, restaurant_url: str | None, location_context: dict | None) -> dict:
        context = location_context or {}
        latitude = context.get("latitude")
        longitude = context.get("longitude")
        city = context.get("city") or location

        if self._is_shahid_swiggy:
            # The verified Actor accepts a city/location string. Using the first
            # postal-office name here made some valid PINs fail because the Actor
            # could not resolve strings such as "Civil Lines, Aligarh" reliably.
            # Prefer the resolved city (the same form that succeeded in the manual
            # Apify test) and keep the PIN mapping in Kiku's cache/metadata.
            resolved_location = str(city or location or "").strip()
            if not resolved_location:
                raise ApifyUnsupportedLocation("Swiggy location could not be resolved from the requested PIN.")
            return {"location": resolved_location}

        supported_city = self._city(str(city) if city else None, restaurant_url, allow_missing=True)
        payload: dict = {}
        if supported_city:
            payload["city"] = supported_city
        if self.platform == "swiggy" and latitude is not None and longitude is not None:
            payload["latitude"] = float(latitude)
            payload["longitude"] = float(longitude)
        if self.platform == "zomato" and not supported_city:
            raise ApifyUnsupportedLocation(
                "The configured Zomato Actor supports a fixed city set and does not expose custom coordinates. "
                "The resolved PIN city is outside that supported set."
            )
        if self.platform == "swiggy" and not supported_city and not (latitude is not None and longitude is not None):
            raise ApifyUnsupportedLocation(
                "Swiggy requires a supported city or resolved coordinates for this PIN."
            )
        return payload

    def _build_shahid_swiggy_candidate(self, item: dict, location: str, restaurant: str, pincode: str | None, location_context: dict | None):
        url = _restaurant_url(item)
        if not url:
            return None
        try:
            url = validate_provider_url(url, "swiggy")
        except ValueError:
            return None
        return RestaurantCandidate(
            name=_restaurant_name(item, restaurant),
            address=str(_first(item, "address", "locality", "areaName", "area_name", "location") or location),
            url=url,
            provider=self.name,
            pincode=normalize_pincode(pincode),
            pincode_verified=_pin_from_values(item, pincode, location_context, "swiggy"),
            metadata={
                "city": _first(item, "city"),
                "areaName": _first(item, "areaName", "area_name"),
                "locality": _first(item, "locality"),
                "cuisines": _first(item, "cuisines") or [],
                "rating": _first(item, "avgRating", "rating"),
                "deliveryTime": _first(item, "deliveryTime", "delivery_time", "deliveryTimeMinutes"),
                "imageUrl": _first(item, "imageUrl", "image_url"),
                "restaurantId": str(_first(item, "restaurantId", "restaurant_id", "restId", "id") or "").strip() or None,
                "matchedDishes": item.get("matchedDishes") if isinstance(item.get("matchedDishes"), list) else [],
                "keywords": [str(item.get("_kikuKeyword") or "").strip()] if item.get("_kikuKeyword") else [],
            },
        )

    async def search_restaurants_for_keyword_async(
        self,
        location: str,
        restaurant: str,
        pincode: str | None,
        location_context: dict | None,
        keyword: str,
    ) -> list[RestaurantCandidate]:
        if not self.enabled:
            return []
        location_payload = self._location_payload(location, None, location_context)
        if not self._is_shahid_swiggy:
            raise ApifyAPIError("search_restaurants_for_keyword_async is only supported for the verified Shahid Irfan Swiggy Actor")
        payload = {
            **location_payload,
            "resultsWanted": self.max_results,
            "maxPages": settings.apify_swiggy_region_max_pages,
            "keyword": keyword.strip(),
        }
        LOGGER.info("Swiggy regional Actor input: actor=%s keyword=%s payload=%s", self.actor_id, keyword, payload)
        items = _as_items(await self._request(payload))
        matched_total = sum(
            len(item.get("matchedDishes") or [])
            for item in items
            if isinstance(item, dict) and isinstance(item.get("matchedDishes"), list)
        )
        LOGGER.info("Swiggy keyword=%s returned %s restaurant records and %s matched dishes for PIN=%s", keyword, len(items), matched_total, pincode)
        candidates: list[RestaurantCandidate] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            item = dict(item)
            item["_kikuKeyword"] = keyword
            candidate = self._build_shahid_swiggy_candidate(item, location, restaurant, pincode, location_context)
            if candidate:
                candidates.append(candidate)
        return candidates

    async def search_restaurants_async(self, location: str, restaurant: str, pincode: str | None = None, location_context: dict | None = None, use_region_keyword: bool = True) -> list[RestaurantCandidate]:
        if not self.enabled:
            return []
        location_payload = self._location_payload(location, None, location_context)
        if self._is_shahid_swiggy:
            keyword = str(settings.apify_swiggy_region_keyword or "").strip() if use_region_keyword else ""
            if not keyword:
                # City browsing mode remains available for explicit restaurant discovery.
                payload = {
                    **location_payload,
                    "resultsWanted": self.max_results,
                    "maxPages": settings.apify_swiggy_region_max_pages,
                }
                LOGGER.info("Swiggy regional Actor input: actor=%s payload=%s", self.actor_id, payload)
                items = _as_items(await self._request(payload))
            else:
                items = _as_items(await self._request({
                    **location_payload,
                    "resultsWanted": self.max_results,
                    "maxPages": settings.apify_swiggy_region_max_pages,
                    "keyword": keyword,
                }))
            candidates: list[RestaurantCandidate] = []
            for item in items:
                if not isinstance(item, dict):
                    continue
                candidate = self._build_shahid_swiggy_candidate(item, location, restaurant, pincode, location_context)
                if candidate:
                    candidates.append(candidate)
            return candidates

        payload = {
            "queries": [restaurant] if restaurant else [],
            "maxResults": self.max_results,
            **location_payload,
            **({"searchType": "restaurant", "includeCollections": False} if self.platform == "swiggy" else {"deliveryOnly": True, "includeMenu": False}),
        }
        items = _as_items(await self._request(payload))
        candidates: list[RestaurantCandidate] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            url = _restaurant_url(item)
            if not url:
                continue
            try:
                url = validate_provider_url(url, self.platform)
            except ValueError:
                continue
            candidates.append(RestaurantCandidate(
                name=_restaurant_name(item, restaurant),
                address=str(_first(item, "address", "location", "locality", "area_name") or location),
                url=url,
                provider=self.name,
                pincode=normalize_pincode(pincode),
                pincode_verified=_pin_from_values(item, pincode, location_context, self.platform),
            ))
        return candidates

    async def get_region_menus_async(self, city: str, location: str | None, candidates: list[RestaurantCandidate], pincode: str | None = None, location_context: dict | None = None) -> list[DishOffer]:
        if not self.enabled or self.platform != "swiggy" or not self.menu_actor_id:
            return []
        bounded = candidates[: settings.apify_swiggy_menu_max_restaurants]
        ids = [
    str(
        c.metadata.get("restaurantId")
        or c.metadata.get("restaurant_id")
        or ""
    ).strip()
    for c in bounded
]
        names = [str(c.name).strip() for c in bounded]
        LOGGER.info(
    "Swiggy menu enrichment candidates: %s",
    [
        {
            "name": c.name,
            "restaurantId": c.metadata.get("restaurantId"),
            "url": c.url,
        }
        for c in bounded
    ],
)
        pairs = [(rid, name) for rid, name in zip(ids, names) if rid and name]
        if not pairs:
            LOGGER.warning("No Swiggy restaurant IDs available for menu enrichment in %s", city)
            return []
        ids = [rid for rid, _ in pairs]
        names = [name for _, name in pairs]
        payload = {
            "city": str(city).strip(),
            "location": str(location or "").strip(),
            "restaurantIds": ids,
            "restaurantNames": names,
        }
        LOGGER.info("Swiggy menu Actor input: actor=%s city=%s location=%s restaurants=%s", self.menu_actor_id, city, location, len(ids))
        items = _as_items(await self._request(payload, self.menu_actor_id, settings.apify_swiggy_menu_run_timeout_seconds))
        LOGGER.info("Swiggy menu Actor returned %s item rows for PIN=%s", len(items), pincode)
        normalized_pin = normalize_pincode(pincode)
        candidate_by_id = {}
        for candidate in bounded:
            rid = str(candidate.metadata.get("restaurantId") or "").strip()
            if rid:
                candidate_by_id[rid] = candidate
        offers: list[DishOffer] = []
        for row in items:
            if not isinstance(row, dict):
                continue
            row_id = str(_first(row, "restaurantId", "restaurant_id", "restId") or "").strip()
            restaurant_name = str(_first(row, "restaurantName", "restaurant_name", "name") or "").strip()
            candidate = candidate_by_id.get(row_id)
            if candidate is None and restaurant_name:
                candidate = min(bounded, key=lambda c: similarity(c.name, restaurant_name)) if bounded else None
                if candidate and similarity(candidate.name, restaurant_name) < 0.65:
                    candidate = None
            if candidate is None:
                continue
            dish_name = str(_first(row, "itemName", "item_name", "dishName", "dish_name") or "").strip()
            if not dish_name:
                continue
            restaurant_url = candidate.url
            price = _as_float(_first(row, "price", "finalPrice", "final_price"))
            final_price = _as_float(_first(row, "finalPrice", "final_price"))
            dish_url = str(_first(row, "itemUrl", "item_url", "dishUrl", "dish_url", "listingUrl", "listing_url") or "").strip() or None
            dietary_tags=[]
            category = _first(row, "categoryName", "category", "category_name")
            if category:
                dietary_tags.append(str(category))
            is_veg = _truthy(_first(row, "isVeg", "is_veg", "vegetarian", "veg"))
            in_stock = _first(row, "inStock", "in_stock")
            if in_stock not in (None, ""):
                in_stock = _truthy(in_stock)
            else:
                in_stock = None
            rating = _as_float(_first(row, "itemRating", "rating"))
            rating_count = _as_int(_first(row, "itemRatingCount", "ratingCount"))
            offers.append(DishOffer(
                restaurant_name=restaurant_name or candidate.name,
                restaurant_url=str(restaurant_url),
                dish_name=dish_name,
                price=price,
                final_price=final_price,
                eta_minutes=_as_int(_first(row, "deliveryTime", "delivery_time", "deliveryTimeMinutes")),
                dish_url=dish_url,
                dietary_tags=dietary_tags,
                vegetarian_verified=is_veg,
                region_pincode=normalized_pin,
                region_verified=bool(candidate.pincode_verified),
                provider_evidence="apify-smacient-swiggy-menu",
                description=str(_first(row, "itemDescription", "description") or "").strip() or None,
                category_name=str(category).strip() if category else None,
                image_url=str(_first(row, "imageUrl", "image_url") or "").strip() or None,
                in_stock=in_stock,
                item_rating=rating,
                item_rating_count=rating_count,
            ))
            if len(offers) >= settings.region_max_dishes:
                break
        return offers

    async def get_menu_async(self, location: str | None, restaurant: str, restaurant_url: str | None = None, pincode: str | None = None, location_context: dict | None = None) -> list[DishOffer]:
        return await self.get_dish_menu_async(location, restaurant, None, restaurant_url, pincode, location_context)

    async def get_dish_menu_async(
        self,
        location: str | None,
        restaurant: str,
        dish: str | None,
        restaurant_url: str | None = None,
        pincode: str | None = None,
        location_context: dict | None = None,
    ) -> list[DishOffer]:
        if not self.enabled:
            return []
        normalized_pin = normalize_pincode(pincode)
        location_payload = self._location_payload(location, restaurant_url, location_context)
        requested_dish = str(dish or "").strip()
        combined_query = " ".join(part for part in (restaurant, requested_dish) if part).strip()

        if self._is_shahid_swiggy:
            query = requested_dish or settings.apify_swiggy_region_keyword or restaurant
            payload = {
                **location_payload,
                "keyword": query,
                "resultsWanted": self.max_results,
                "maxPages": settings.apify_swiggy_region_max_pages,
            }
            items = _as_items(await self._request(payload))
            offers: list[DishOffer] = []
            for item in items:
                if not isinstance(item, dict):
                    continue
                item_restaurant = _restaurant_name(item, restaurant)
                if restaurant and item_restaurant and similarity(restaurant, item_restaurant) < 0.55:
                    continue
                nested = item.get("matchedDishes") if isinstance(item.get("matchedDishes"), list) else []
                for matched in nested:
                    if not isinstance(matched, dict):
                        continue
                    dish_name = str(matched.get("name") or "").strip()
                    if not dish_name:
                        continue
                    raw_price = matched.get("finalPrice", matched.get("price"))
                    price = _as_float(raw_price)
                    offers.append(DishOffer(
                        restaurant_name=item_restaurant,
                        restaurant_url=str(_restaurant_url(item, restaurant_url) or ""),
                        dish_name=dish_name,
                        price=price,
                        eta_minutes=_as_int(_first(item, "deliveryTime", "delivery_time", "deliveryTimeMinutes")),
                        dietary_tags=[str(matched.get("category"))] if matched.get("category") else [],
                        vegetarian_verified=bool(matched.get("isVeg")),
                        region_pincode=normalized_pin,
                        region_verified=_pin_from_values(item, normalized_pin, location_context, "swiggy"),
                        provider_evidence="apify-shahidirfan-swiggy",
                    ))
                    if len(offers) >= settings.region_max_dishes:
                        break
                if len(offers) >= settings.region_max_dishes:
                    break
            return offers

        if self.platform == "swiggy":
            query = combined_query or restaurant or requested_dish or "food"
            payload = {
                "queries": [query],
                **location_payload,
                "searchType": "dish",
                "maxResults": self.max_results,
                "includeCollections": False,
            }
            items = _as_items(await self._request(payload))
            offers: list[DishOffer] = []
            for item in items:
                if not isinstance(item, dict):
                    continue
                dish_name = _dish_name(item)
                price = _as_float(_first(item, "price", "item_price", "dish_price", "sale_price"))
                url = _restaurant_url(item, restaurant_url)
                if not dish_name or price is None or not url:
                    continue
                try:
                    url = validate_provider_url(url, "swiggy")
                except ValueError:
                    continue
                restaurant_name = _restaurant_name(item, restaurant)
                if restaurant and restaurant_name and similarity(restaurant, restaurant_name) < 0.55:
                    continue
                offers.append(DishOffer(
                    restaurant_name=restaurant_name,
                    restaurant_url=url,
                    dish_name=dish_name,
                    price=price,
                    eta_minutes=_as_int(_first(item, "delivery_time_minutes", "eta_minutes", "delivery_time")),
                    delivery_fee=_as_float(_first(item, "delivery_fee")),
                    dietary_tags=[str(value) for value in (_first(item, "dietary_tags", "dietaryTags") or [])] if isinstance(_first(item, "dietary_tags", "dietaryTags"), list) else [],
                    vegetarian_verified=_truthy(_first(item, "is_veg", "isVeg", "vegetarian", "veg")),
                    vegan_verified=_truthy(_first(item, "is_vegan", "isVegan", "vegan")),
                    allergens=[str(value) for value in (_first(item, "allergens") or [])] if isinstance(_first(item, "allergens"), list) else [],
                    allergen_verified=bool(_first(item, "allergen_verified", "allergenVerified")),
                    allergen_free_for=[str(value) for value in (_first(item, "allergen_free_for", "allergenFreeFor") or [])] if isinstance(_first(item, "allergen_free_for", "allergenFreeFor"), list) else [],
                    region_pincode=normalized_pin,
                    region_verified=_pin_from_values(item, normalized_pin, location_context, "swiggy"),
                    provider_evidence="apify-thirdwatch-swiggy",
                ))
            return offers

        payload = {
            "queries": [restaurant or requested_dish or "food"],
            **location_payload,
            "maxResults": self.max_results,
            "deliveryOnly": True,
            "includeMenu": True,
        }
        items = _as_items(await self._request(payload))
        offers: list[DishOffer] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            restaurant_name = _restaurant_name(item, restaurant)
            if restaurant and restaurant_name and similarity(restaurant, restaurant_name) < 0.55:
                continue
            nested = _nested_menu(item)
            if nested:
                for menu_item in nested:
                    normalized = _normalize_zomato_menu_item(item, menu_item, normalized_pin, location_context)
                    if normalized:
                        offers.append(normalized)
            else:
                normalized = _normalize_zomato_menu_item(item, item, normalized_pin, location_context)
                if normalized:
                    offers.append(normalized)
        return offers
