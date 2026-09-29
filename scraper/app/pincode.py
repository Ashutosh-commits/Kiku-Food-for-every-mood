from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .config import settings
from .security import normalize_pincode

LOGGER = logging.getLogger("mise.pincode")


@dataclass(frozen=True)
class PinLocation:
    pincode: str
    city: str | None
    district: str | None
    state: str | None
    latitude: float | None
    longitude: float | None
    display_name: str | None
    postal_offices: tuple[str, ...] = ()


_CACHE: dict[str, tuple[float, PinLocation]] = {}
_INFLIGHT: dict[str, asyncio.Task[PinLocation]] = {}
_RATE_LOCK = asyncio.Lock()
_LAST_GEOCODE_AT = 0.0


def _bounded_text(value: object, limit: int = 160) -> str | None:
    text = str(value or "").strip()
    return text[:limit] or None


def _postoffice_candidates(data: object) -> list[dict]:
    if not isinstance(data, list) or not data:
        return []
    root = data[0]
    if not isinstance(root, dict) or str(root.get("Status", "")).lower() != "success":
        return []
    offices = root.get("PostOffice")
    if not isinstance(offices, list):
        return []
    return [item for item in offices if isinstance(item, dict)]


def _postal_lookup_sync(pincode: str) -> tuple[str | None, str | None, str | None, tuple[str, ...]]:
    url = f"{settings.pin_resolver_postal_base_url.rstrip('/')}/pincode/{pincode}"
    request = Request(url, headers={"Accept": "application/json", "User-Agent": settings.pin_resolver_user_agent})
    try:
        with urlopen(request, timeout=settings.pin_resolver_timeout_seconds) as response:
            raw = response.read(settings.pin_resolver_response_max_bytes + 1)
    except HTTPError as exc:
        raise RuntimeError(f"PIN lookup returned HTTP {exc.code}.") from exc
    except URLError as exc:
        raise RuntimeError(f"PIN lookup failed: {exc.reason}") from exc
    if len(raw) > settings.pin_resolver_response_max_bytes:
        raise RuntimeError("PIN lookup response exceeded the configured size limit.")
    try:
        payload = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError("PIN lookup returned invalid JSON.") from exc

    offices = _postoffice_candidates(payload)
    if not offices:
        raise RuntimeError(f"No postal office mapping was found for PIN {pincode}.")
    first = offices[0]
    district = _bounded_text(first.get("District"))
    state = _bounded_text(first.get("State"))
    division = _bounded_text(first.get("Division"))
    names = tuple(dict.fromkeys(
        value for value in (_bounded_text(item.get("Name")) for item in offices) if value
    ))
    return division or district, district, state, names


def _nominatim_lookup_sync(pincode: str) -> tuple[str | None, float | None, float | None, str | None]:
    params = urlencode({
        "postalcode": pincode,
        "country": "India",
        "format": "json",
        "addressdetails": "1",
        "limit": "1",
    })
    url = f"{settings.pin_resolver_geocode_base_url.rstrip('/')}/search?{params}"
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": settings.pin_resolver_user_agent,
            "Referer": settings.pin_resolver_referer,
        },
    )
    try:
        with urlopen(request, timeout=settings.pin_resolver_timeout_seconds) as response:
            raw = response.read(settings.pin_resolver_response_max_bytes + 1)
    except HTTPError as exc:
        raise RuntimeError(f"PIN geocoding returned HTTP {exc.code}.") from exc
    except URLError as exc:
        raise RuntimeError(f"PIN geocoding failed: {exc.reason}") from exc
    if len(raw) > settings.pin_resolver_response_max_bytes:
        raise RuntimeError("PIN geocoding response exceeded the configured size limit.")
    try:
        payload = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError("PIN geocoding returned invalid JSON.") from exc
    if not isinstance(payload, list) or not payload:
        return None, None, None, None
    result = payload[0] if isinstance(payload[0], dict) else {}
    address = result.get("address") if isinstance(result.get("address"), dict) else {}
    city = next((
        _bounded_text(address.get(key))
        for key in ("city", "town", "village", "municipality")
        if address.get(key)
    ), None)
    try:
        latitude = float(result.get("lat")) if result.get("lat") not in (None, "") else None
        longitude = float(result.get("lon")) if result.get("lon") not in (None, "") else None
    except (TypeError, ValueError):
        latitude = longitude = None
    return city, latitude, longitude, _bounded_text(result.get("display_name"), 300)


async def _rate_limited_nominatim(pincode: str) -> tuple[str | None, float | None, float | None, str | None, str | None, str | None]:
    global _LAST_GEOCODE_AT
    async with _RATE_LOCK:
        wait_seconds = settings.pin_resolver_min_geocode_interval_seconds - (time.monotonic() - _LAST_GEOCODE_AT)
        if wait_seconds > 0:
            await asyncio.sleep(wait_seconds)
        result = await asyncio.to_thread(_nominatim_lookup_sync, pincode)
        _LAST_GEOCODE_AT = time.monotonic()
        return result


async def _resolve_uncached(pincode: str) -> PinLocation:
    postal_city, district, state, post_offices = await asyncio.to_thread(_postal_lookup_sync, pincode)
    try:
        geo_city, latitude, longitude, display_name = await _rate_limited_nominatim(pincode)
    except Exception as exc:
        LOGGER.warning("PIN geocoding failed for %s: %s", pincode, exc)
        geo_city = latitude = longitude = display_name = None

    geo_reference = " ".join(v for v in (geo_city, display_name) if v).lower()
    coordinate_verified = bool(
        latitude is not None and longitude is not None
        and any(token and token.lower() in geo_reference for token in (postal_city, district))
    )
    if not coordinate_verified:
        LOGGER.warning(
            "Ignoring unverified geocode for PIN %s: postal=%r/%r/%r geo=%r/%r/%r display=%r",
            pincode, postal_city, district, state, geo_city, None, None, display_name,
        )
        latitude = longitude = None

    resolved_city = postal_city or geo_city or district
    return PinLocation(
        pincode=pincode,
        city=resolved_city,
        district=district,
        state=state,
        latitude=latitude,
        longitude=longitude,
        display_name=display_name,
        postal_offices=post_offices,
    )


async def resolve_pincode(pincode: str) -> PinLocation:
    normalized = normalize_pincode(pincode)
    if not normalized:
        raise ValueError("A valid 6-digit Indian PIN code is required.")
    now = time.monotonic()
    cached = _CACHE.get(normalized)
    if cached and cached[0] > now:
        return cached[1]
    existing = _INFLIGHT.get(normalized)
    if existing:
        return await existing
    task = asyncio.create_task(_resolve_uncached(normalized))
    _INFLIGHT[normalized] = task
    try:
        result = await task
        _CACHE[normalized] = (time.monotonic() + settings.pin_resolver_cache_ttl_seconds, result)
        while len(_CACHE) > settings.pin_resolver_cache_max_items:
            _CACHE.pop(next(iter(_CACHE)))
        return result
    finally:
        if _INFLIGHT.get(normalized) is task:
            _INFLIGHT.pop(normalized, None)
