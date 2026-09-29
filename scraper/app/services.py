from __future__ import annotations

import asyncio
import hashlib
import logging
from datetime import datetime, timezone

from .cache import TTLCache
from .config import settings
from .matching import match_dishes, similarity
from .models import ComparisonResponse, PlatformOffer, RegionalDish, RegionalResponse, RegionalRestaurant, SearchRequest
from .normalize import normalize_text
from .providers.swiggy import SwiggyProvider
from .providers.zomato import ZomatoProvider
from .providers.realdataapi import RealDataProvider, RealDataAPIError
from .providers.apify import ApifyProvider, ApifyAPIError, ApifyUnsupportedLocation
from .security import normalize_pincode
from .pincode import resolve_pincode

CACHE = TTLCache(settings.cache_ttl_seconds, settings.cache_max_items)
SEMAPHORE = asyncio.Semaphore(settings.max_concurrent_comparisons)
REGION_SEMAPHORE = asyncio.Semaphore(settings.region_max_concurrent_restaurants)
COMPARE_INFLIGHT: dict[str, asyncio.Task] = {}
REGION_INFLIGHT: dict[str, asyncio.Task] = {}
LOGGER = logging.getLogger("mise.scraper")
APIFY_SEMAPHORES = {
    "swiggy": asyncio.Semaphore(settings.apify_max_concurrent_runs),
    "zomato": asyncio.Semaphore(settings.apify_max_concurrent_runs),
}
APIFY_COOLDOWN_UNTIL: dict[str, float] = {}


def _cache_key(request: SearchRequest) -> str:
    return "|".join([
        (request.location or "").strip().lower(),
        request.restaurant.strip().lower(),
        (request.dish or "").strip().lower(),
        request.pincode or "",
        str(request.swiggy_url or ""),
        str(request.zomato_url or ""),
    ])


def _filter_requested_dish(items, query: str | None):
    if not query:
        return items
    scored = [(item, similarity(query, item.dish_name)) for item in items]
    return [item for item, score in scored if score >= 0.72]


def _primary_provider(platform: str):
    if platform == "swiggy" and settings.apify_swiggy_enabled and settings.apify_swiggy_token:
        return ApifyProvider(platform)
    if platform == "zomato" and settings.apify_zomato_enabled and settings.apify_zomato_token:
        return ApifyProvider(platform)
    if platform == "zomato" and not settings.apify_zomato_enabled:
        return None
    if settings.realdata_api_key:
        return RealDataProvider(platform)
    return SwiggyProvider() if platform == "swiggy" else ZomatoProvider()


async def _run_provider(provider, request: SearchRequest, restaurant_url: str | None, location_context: dict | None = None):
    if isinstance(provider, ApifyProvider):
        async with APIFY_SEMAPHORES[provider.platform]:
            return await provider.get_dish_menu_async(
                request.resolved_city or request.location,
                request.restaurant,
                request.dish,
                restaurant_url,
                request.pincode,
                location_context,
            )
    return await provider.get_menu_async(
        request.resolved_city or request.location,
        request.restaurant,
        restaurant_url,
        request.pincode,
    )


async def _scrape_provider(provider, request: SearchRequest, label: str, restaurant_url: str | None, location_context: dict | None = None):
    try:
        result = await asyncio.wait_for(
            _run_provider(provider, request, restaurant_url, location_context),
            timeout=settings.request_timeout_seconds,
        )
        return result, None
    except Exception as exc:
        LOGGER.exception("%s provider scrape failed", label)
        if isinstance(provider, ApifyProvider) and isinstance(exc, ApifyAPIError):
            APIFY_COOLDOWN_UNTIL[provider.platform] = asyncio.get_running_loop().time() + settings.apify_error_cooldown_seconds
        message = f"{label} could not be queried right now."
        if isinstance(exc, ApifyUnsupportedLocation):
            message = f"{label} Apify coverage does not support this location without an exact supported city."
        elif isinstance(exc, ApifyAPIError):
            message = f"{label} Apify provider is temporarily unavailable."
        if settings.debug_errors:
            message += f" ({type(exc).__name__}: {exc})"
        return [], message


async def _scrape_provider_with_fallback(platform: str, request: SearchRequest, label: str, restaurant_url: str | None, location_context: dict | None = None):
    primary = _primary_provider(platform)
    primary_was_apify = isinstance(primary, ApifyProvider)
    if primary_was_apify:
        cooldown_until = APIFY_COOLDOWN_UNTIL.get(platform, 0.0)
        if asyncio.get_running_loop().time() < cooldown_until:
            primary = None
    if primary is None:
        items, error = [], f"{label} Apify provider is in a temporary cooldown after an upstream error."
    else:
        items, error = await _scrape_provider(primary, request, label, restaurant_url, location_context)
    if items or not primary_was_apify or not settings.apify_fallback_realdata or not settings.realdata_api_key:
        return items, error
    fallback = RealDataProvider(platform)
    fallback_items, fallback_error = await _scrape_provider(fallback, request, label, restaurant_url, location_context)
    if fallback_items:
        warnings = f"{label} used the Real Data API fallback after the Apify provider was unavailable."
        return fallback_items, warnings
    return items, fallback_error or error


async def _compare_uncached(request: SearchRequest) -> ComparisonResponse:
    location_context = None
    effective_request = request
    if request.pincode:
        try:
            resolved = await resolve_pincode(request.pincode)
        except Exception as exc:
            if not request.location:
                raise RuntimeError(f"Could not resolve PIN {request.pincode} to a provider location.") from exc
            LOGGER.warning("PIN resolution unavailable for %s; using the user-supplied location as a temporary provider target: %s", request.pincode, exc)
            effective_request = request
        else:
            location_context = {
                "pincode": resolved.pincode,
                "city": resolved.city,
                "district": resolved.district,
                "state": resolved.state,
                "latitude": resolved.latitude,
                "longitude": resolved.longitude,
                "display_name": resolved.display_name,
            }
            effective_request = request.model_copy(update={
                "resolved_city": resolved.city,
                "location": resolved.city or request.location,
                "latitude": resolved.latitude,
                "longitude": resolved.longitude,
            })

    async with SEMAPHORE:
        (swiggy_items, swiggy_error), (zomato_items, zomato_error) = await asyncio.gather(
            _scrape_provider_with_fallback("swiggy", effective_request, "Swiggy", str(effective_request.swiggy_url) if effective_request.swiggy_url else None, location_context),
            _scrape_provider_with_fallback("zomato", effective_request, "Zomato", str(effective_request.zomato_url) if effective_request.zomato_url else None, location_context),
        )

    warnings = [w for w in (swiggy_error, zomato_error) if w]
    if settings.apify_swiggy_token or settings.apify_zomato_token:
        warnings.append("Apify is configured as the primary comparison provider; PIN-based provider targeting uses the resolved postal location, with provider-visible PIN evidence accepted when available.")
    elif settings.realdata_api_key:
        warnings.append("Real Data API is enabled for provider comparisons; regional PIN verification remains fail-closed until provider responses include verifiable PIN evidence.")
    swiggy_items = _filter_requested_dish(swiggy_items, request.dish)
    zomato_items = _filter_requested_dish(zomato_items, request.dish)
    if request.pincode:
        swiggy_items = [item for item in swiggy_items if item.region_verified and item.region_pincode == request.pincode]
        zomato_items = [item for item in zomato_items if item.region_verified and item.region_pincode == request.pincode]

    restaurant_names = [
        normalize_text(item.restaurant_name)
        for item in [*swiggy_items, *zomato_items]
        if item.restaurant_name
    ]
    unique_names = list(dict.fromkeys(restaurant_names))
    restaurant_match_confidence = 0.0
    if len(unique_names) >= 2:
        restaurant_match_confidence = max(
            similarity(left, right) for index, left in enumerate(unique_names) for right in unique_names[index + 1:]
        )
    elif unique_names:
        restaurant_match_confidence = 1.0

    if swiggy_items and zomato_items and restaurant_match_confidence < 0.82:
        warnings.append("Provider restaurant listings could not be verified as the same restaurant; cross-provider matches were withheld.")
        matched_pairs = []
    else:
        matched_pairs = match_dishes(
            {item.dish_name: item.price for item in swiggy_items},
            {item.dish_name: item.price for item in zomato_items},
        )

    swiggy_by_name = {}
    zomato_by_name = {}
    for item in swiggy_items:
        swiggy_by_name.setdefault(item.dish_name, item)
    for item in zomato_items:
        zomato_by_name.setdefault(item.dish_name, item)

    offers: list[PlatformOffer] = []
    for left_name, right_name, score in matched_pairs:
        sw = swiggy_by_name[left_name]
        zo = zomato_by_name[right_name]
        for item, platform in ((sw, "swiggy"), (zo, "zomato")):
            offers.append(PlatformOffer(
                platform=platform,
                restaurant_name=item.restaurant_name,
                restaurant_url=item.restaurant_url,
                dish_name=item.dish_name,
                dish_url=item.dish_url,
                price=item.price,
                delivery_fee=item.delivery_fee,
                eta_minutes=item.eta_minutes,
                match_confidence=score,
                dietary_tags=item.dietary_tags,
                vegetarian_verified=item.vegetarian_verified,
                vegan_verified=item.vegan_verified,
                allergens=item.allergens,
                allergen_verified=item.allergen_verified,
                allergen_free_for=item.allergen_free_for,
                region_pincode=item.region_pincode,
                region_verified=item.region_verified,
            ))

    if not swiggy_items and not zomato_items:
        warnings.append("No provider listings were available for this request.")

    if (swiggy_items and not zomato_items) or (zomato_items and not swiggy_items):
        available = swiggy_items or zomato_items
        warnings.append("Only one provider returned usable data; no cross-provider match was claimed.")
        for item in available:
            offers.append(PlatformOffer(
                platform="swiggy" if item in swiggy_items else "zomato",
                restaurant_name=item.restaurant_name,
                restaurant_url=item.restaurant_url,
                dish_name=item.dish_name,
                dish_url=item.dish_url,
                price=item.price,
                delivery_fee=item.delivery_fee,
                eta_minutes=item.eta_minutes,
                dietary_tags=item.dietary_tags,
                vegetarian_verified=item.vegetarian_verified,
                vegan_verified=item.vegan_verified,
                allergens=item.allergens,
                allergen_verified=item.allergen_verified,
                allergen_free_for=item.allergen_free_for,
                region_pincode=item.region_pincode,
                region_verified=item.region_verified,
            ))

    priced = [offer for offer in offers if offer.price is not None]
    timed = [offer for offer in offers if offer.eta_minutes is not None]
    return ComparisonResponse(
        restaurant_query=request.restaurant,
        location=request.location or request.pincode or "",
        canonical_restaurant=offers[0].restaurant_name if offers else None,
        restaurant_match_confidence=restaurant_match_confidence,
        dish_query=request.dish,
        offers=offers,
        cheapest_platform=min(priced, key=lambda item: item.price).platform if priced else None,
        fastest_platform=min(timed, key=lambda item: item.eta_minutes).platform if timed else None,
        warnings=list(dict.fromkeys(warnings)),
        checked_at=datetime.now(timezone.utc),
    )


async def compare(request: SearchRequest) -> ComparisonResponse:
    cache_key = _cache_key(request)
    cached = CACHE.get(cache_key)
    if cached:
        return cached
    existing = COMPARE_INFLIGHT.get(cache_key)
    if existing:
        return await existing

    task = asyncio.create_task(_compare_uncached(request))
    COMPARE_INFLIGHT[cache_key] = task
    try:
        response = await task
        CACHE.set(cache_key, response)
        return response
    finally:
        if COMPARE_INFLIGHT.get(cache_key) is task:
            COMPARE_INFLIGHT.pop(cache_key, None)


async def _scrape_regional_uncached(pincode: str) -> RegionalResponse:
    normalized = normalize_pincode(pincode)
    if not normalized:
        raise ValueError("A valid 6-digit Indian PIN code is required.")

    resolved = await resolve_pincode(normalized)
    LOGGER.info(
        "Regional PIN %s resolved city=%r district=%r lat=%r lon=%r postal_offices=%s",
        normalized, resolved.city, resolved.district, resolved.latitude, resolved.longitude, list(resolved.postal_offices)[:3],
    )
    location_context = {
        "pincode": resolved.pincode,
        "city": resolved.city,
        "district": resolved.district,
        "state": resolved.state,
        "latitude": resolved.latitude,
        "longitude": resolved.longitude,
        "display_name": resolved.display_name,
        "postal_offices": list(resolved.postal_offices),
        "pincode_resolved": True,
    }
    warnings: list[str] = []
    if resolved.city:
        warnings.append(f"PIN {normalized} resolved to {resolved.city}{f', {resolved.state}' if resolved.state else ''} for provider targeting.")

    providers = []
    if settings.apify_swiggy_enabled and settings.apify_swiggy_token:
        providers.append(ApifyProvider("swiggy"))
    if settings.apify_zomato_enabled and settings.apify_zomato_token:
        providers.append(ApifyProvider("zomato"))
    if not providers and settings.realdata_api_key:
        providers = [RealDataProvider("swiggy")]
        if settings.apify_zomato_enabled:
            providers.append(RealDataProvider("zomato"))
    if not providers:
        providers = [SwiggyProvider()]
    all_dishes: list[RegionalDish] = []
    restaurants: dict[str, RegionalRestaurant] = {}

    async def scrape_candidate(provider, candidate):
        async with REGION_SEMAPHORE:
            try:
                items = await provider.get_menu_async(
                    resolved.city or normalized,
                    candidate.name,
                    candidate.url,
                    normalized,
                    location_context,
                )
                return provider.name, candidate, items, None
            except Exception as exc:
                LOGGER.exception("%s regional scrape failed for %s", provider.name, candidate.url)
                detail = f" ({type(exc).__name__}: {exc})" if settings.debug_errors else ""
                return provider.name, candidate, [], f"{provider.name.title()} could not scrape one provider listing.{detail}"

    def _merge_matched_dishes(existing: list[dict], incoming: list[dict]) -> list[dict]:
        merged: dict[str, dict] = {}
        for item in [*existing, *incoming]:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            key = normalize_text(name)
            if key not in merged:
                merged[key] = dict(item)
                continue
            # Prefer whichever record has a concrete current price/stock signal.
            current = merged[key]
            if current.get("finalPrice") in (None, "") and item.get("finalPrice") not in (None, ""):
                current["finalPrice"] = item.get("finalPrice")
            if current.get("price") in (None, "") and item.get("price") not in (None, ""):
                current["price"] = item.get("price")
            if "inStock" not in current and "inStock" in item:
                current["inStock"] = item.get("inStock")
        return list(merged.values())

    async def enrich_swiggy_with_fallbacks(candidates, city: str, pincode: str):
        """Use non-Apify menu sources after regional restaurant discovery.

        This avoids consuming another full-permission Apify menu run. Real Data API is
        preferred when configured; direct Swiggy page extraction is the last local fallback.
        """
        async def one_candidate(candidate):
            async with REGION_SEMAPHORE:
                if settings.realdata_api_key:
                    try:
                        provider = RealDataProvider("swiggy")
                        items = await provider.get_menu_async(city, candidate.name, candidate.url, pincode)
                        verified = []
                        for item in items:
                            if candidate.pincode_verified:
                                item.region_verified = True
                            if item.region_verified:
                                verified.append(item)
                        if verified:
                            return candidate, verified, "realdata-api", None
                    except Exception as exc:
                        LOGGER.warning("Real Data API Swiggy menu fallback failed for %s: %s", candidate.name, type(exc).__name__)

                try:
                    provider = SwiggyProvider()
                    items = await provider.get_menu_async(city, candidate.name, candidate.url, pincode)
                    verified = []
                    for item in items:
                        # The restaurant URL itself was discovered and PIN-verified by the
                        # regional discovery Actor, so preserve that verified regional scope
                        # even when the page does not echo the PIN in rendered text.
                        if candidate.pincode_verified:
                            item.region_verified = True
                        if item.region_verified:
                            verified.append(item)
                    if verified:
                        return candidate, verified, "swiggy-direct", None
                except Exception as exc:
                    LOGGER.warning("Direct Swiggy menu fallback failed for %s: %s", candidate.name, type(exc).__name__)
                return candidate, [], None, None

        results = await asyncio.gather(*(one_candidate(candidate) for candidate in candidates))
        merged = []
        sources = []
        for candidate, items, source, _error in results:
            if items:
                merged.extend(items)
                if source and source not in sources:
                    sources.append(source)
        return merged, sources

    async def one_provider(provider):
        try:
            if isinstance(provider, ApifyProvider) and provider.platform == "swiggy" and provider._is_shahid_swiggy:
                # Regional discovery remains broad and PIN-keyed. The full-permission
                # Smacient menu Actor is opt-in so a failed/unauthorized Actor cannot block
                # the product's dish suggestions or burn another account run.
                async with APIFY_SEMAPHORES["swiggy"]:
                    candidates = await provider.search_restaurants_async(
                        resolved.city or normalized, "", normalized, location_context, use_region_keyword=False
                    )
                LOGGER.info("Swiggy regional city browse PIN=%s restaurants=%s", normalized, len(candidates))
            else:
                candidates = await provider.search_restaurants_async(resolved.city or normalized, "", normalized, location_context)
        except Exception as exc:
            LOGGER.exception("%s regional discovery failed", provider.name)
            detail = f" ({type(exc).__name__}: {exc})" if settings.debug_errors else ""
            return provider.name, provider, [], f"{provider.name.title()} regional discovery failed.{detail}"
        bounded = candidates[: settings.region_max_restaurants_per_provider]
        LOGGER.info(
            "%s regional candidates for PIN=%s after normalization: %s (verified=%s)",
            provider.name, normalized, len(bounded), sum(1 for item in bounded if item.pincode_verified),
        )
        return provider.name, provider, bounded, None

    provider_results = await asyncio.gather(*(one_provider(provider) for provider in providers))

    for provider_name, provider, candidates, provider_error in provider_results:
        if provider_error:
            warnings.append(provider_error)
            continue
        if not candidates:
            warnings.append(f"{provider_name.title()} returned no regional restaurant results for PIN {normalized}.")
            continue

        # Swiggy regional discovery: discover restaurants with the working Actor, then
        # enrich from Real Data/direct Swiggy unless the Smacient menu Actor is explicitly enabled.
        if isinstance(provider, ApifyProvider) and provider.platform == "swiggy" and provider._is_shahid_swiggy:
            for candidate in candidates:
                restaurant_key = f"{provider_name}:{normalize_text(candidate.name)}:{candidate.url}"
                restaurants[restaurant_key] = RegionalRestaurant(
                    id=f"{provider_name}:{hashlib.sha256(candidate.url.encode()).hexdigest()[:20]}",
                    name=candidate.name,
                    provider=provider_name,
                    url=candidate.url,
                    pincode=normalized,
                    pincodeVerified=bool(candidate.pincode_verified),
                    cuisine=", ".join(str(v) for v in (candidate.metadata.get("cuisines") or []) if v) or None,
                )

            # Do not invoke the full-permission Smacient menu Actor in the regional path.
            # It is account-gated and previously returned HTTP 403 before producing menu rows.
            # Use the configured Real Data API first, then direct Swiggy page extraction.
            menu_items = []
            menu_source = None
            if not menu_items:
                menu_items, fallback_sources = await enrich_swiggy_with_fallbacks(
                    candidates, resolved.city or normalized, normalized
                )
                if fallback_sources:
                    menu_source = ",".join(fallback_sources)
                    warnings.append(f"Swiggy regional menu enrichment used {', '.join(fallback_sources)} for PIN {normalized}.")

            for item in menu_items:
                if not item.region_verified:
                    continue
                restaurant_url = item.restaurant_url
                dish_id = f"{provider_name}:{hashlib.sha256(repr((restaurant_url, item.dish_name, item.price, item.final_price, item.dish_url)).encode()).hexdigest()[:20]}"
                all_dishes.append(RegionalDish(
                    id=dish_id,
                    name=item.dish_name,
                    restaurant=item.restaurant_name,
                    restaurant_url=restaurant_url,
                    listing_url=item.dish_url or restaurant_url,
                    price=item.price,
                    finalPrice=item.final_price,
                    description=item.description,
                    categoryName=item.category_name,
                    imageUrl=item.image_url,
                    inStock=item.in_stock,
                    itemRating=item.item_rating,
                    itemRatingCount=item.item_rating_count,
                    tags=item.dietary_tags,
                    dietaryTags=item.dietary_tags,
                    isVegetarian=item.vegetarian_verified,
                    isVegan=item.vegan_verified,
                    allergens=item.allergens,
                    allergenVerified=item.allergen_verified,
                    allergenFreeFor=item.allergen_free_for,
                    dietaryVerified=bool(item.vegetarian_verified or item.vegan_verified or item.dietary_tags),
                    pincode=normalized,
                    pincodeVerified=True,
                    provider=provider_name,
                ))
                if len(all_dishes) >= settings.region_max_dishes:
                    break

            warnings.append(
                f"Swiggy regional discovery found {len(candidates)} restaurants and {len(menu_items)} menu items for PIN {normalized}."
            )
            if not menu_items:
                warnings.append("Swiggy returned restaurants but no usable menu items for the PIN-resolved location.")
            elif menu_source:
                warnings.append(f"Swiggy regional menu source: {menu_source}.")
            continue

        # Non-Apify or non-Shahid providers still need menu enrichment.
        tasks = []
        for candidate in candidates:
            tasks.append(scrape_candidate(provider, candidate))
        scraped = await asyncio.gather(*tasks)
        for provider_name2, candidate, items, error in scraped:
            if error:
                warnings.append(error)
                continue
            verified_items = [item for item in items if item.region_verified]
            restaurant_key = f"{provider_name2}:{normalize_text(candidate.name)}:{candidate.url}"
            if not verified_items:
                warnings.append(f"{provider_name2.title()} returned no menu records verified for PIN {normalized} for {candidate.name}.")
                continue
            restaurants[restaurant_key] = RegionalRestaurant(
                id=f"{provider_name2}:{hashlib.sha256(candidate.url.encode()).hexdigest()[:20]}",
                name=candidate.name,
                provider=provider_name2,
                url=candidate.url,
                pincode=normalized,
                pincodeVerified=True,
            )
            for item in verified_items:
                all_dishes.append(RegionalDish(
                    id=f"{provider_name2}:{hashlib.sha256(repr((item.restaurant_url, item.dish_name, item.price, item.dish_url)).encode()).hexdigest()[:20]}",
                    name=item.dish_name,
                    restaurant=item.restaurant_name,
                    restaurant_url=item.restaurant_url,
                    listing_url=item.dish_url or item.restaurant_url,
                    price=item.price,
                    finalPrice=item.final_price,
                    description=item.description,
                    categoryName=item.category_name,
                    imageUrl=item.image_url,
                    inStock=item.in_stock,
                    itemRating=item.item_rating,
                    itemRatingCount=item.item_rating_count,
                    tags=item.dietary_tags,
                    dietaryTags=item.dietary_tags,
                    isVegetarian=item.vegetarian_verified,
                    isVegan=item.vegan_verified,
                    allergens=item.allergens,
                    allergenVerified=item.allergen_verified,
                    allergenFreeFor=item.allergen_free_for,
                    dietaryVerified=bool(item.vegetarian_verified or item.vegan_verified or item.dietary_tags),
                    pincode=normalized,
                    pincodeVerified=True,
                    provider=provider_name2,
                ))
                if len(all_dishes) >= settings.region_max_dishes:
                    break
            if len(all_dishes) >= settings.region_max_dishes:
                break
        if len(all_dishes) >= settings.region_max_dishes:
            break

    if not all_dishes:
        warnings.append("Swiggy returned no usable menu items for the PIN-resolved location.")

    unique_dishes = {}
    for dish in all_dishes:
        unique_dishes[dish.id] = dish

    return RegionalResponse(
        pincode=normalized,
        dishes=list(unique_dishes.values())[: settings.region_max_dishes],
        restaurants=list(restaurants.values())[: settings.region_max_restaurants],
        offers=[],
        warnings=list(dict.fromkeys(warnings)),
    )


async def scrape_region(pincode: str) -> RegionalResponse:
    normalized = normalize_pincode(pincode)
    if not normalized:
        raise ValueError("A valid 6-digit Indian PIN code is required.")
    cached = CACHE.get(f"region:{normalized}")
    if cached:
        return cached
    existing = REGION_INFLIGHT.get(normalized)
    if existing:
        return await existing
    task = asyncio.create_task(_scrape_regional_uncached(normalized))
    REGION_INFLIGHT[normalized] = task
    try:
        response = await task
        CACHE.set(f"region:{normalized}", response)
        return response
    finally:
        if REGION_INFLIGHT.get(normalized) is task:
            REGION_INFLIGHT.pop(normalized, None)
