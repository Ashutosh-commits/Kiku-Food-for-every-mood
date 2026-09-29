from __future__ import annotations

import json
import re
from collections.abc import Iterable

from bs4 import BeautifulSoup

from ..normalize import parse_price
from ..security import normalize_pincode
from .base import DishOffer


DIET_VEGETARIAN = {"vegetarian", "vegetariandiet", "vegetarian diet"}
DIET_VEGAN = {"vegan", "vegandiet", "vegan diet"}


def _as_list(value):
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def _walk_nodes(data) -> Iterable[dict]:
    if isinstance(data, dict):
        yield data
        for key, value in data.items():
            if key == "@graph" and isinstance(value, list):
                yield from _walk_nodes(value)
    elif isinstance(data, list):
        for item in data:
            yield from _walk_nodes(item)


def _extract_offer_price(item: dict) -> float | None:
    offers = _as_list(item.get("offers"))
    for offer in offers:
        if isinstance(offer, dict):
            price = parse_price(offer.get("price") or offer.get("lowPrice"))
            if price is not None:
                return price
    return parse_price(item.get("price"))


def _extract_name(item: dict) -> str | None:
    name = item.get("name")
    if isinstance(name, str) and name.strip():
        return name.strip()
    nested = item.get("item")
    if isinstance(nested, dict):
        name = nested.get("name")
        if isinstance(name, str) and name.strip():
            return name.strip()
    return None


def _extract_url(item: dict) -> str | None:
    for candidate in (item.get("url"), item.get("mainEntityOfPage")):
        if isinstance(candidate, str) and candidate.startswith("https://"):
            return candidate
        if isinstance(candidate, dict):
            value = candidate.get("@id") or candidate.get("url")
            if isinstance(value, str) and value.startswith("https://"):
                return value
    nested = item.get("item")
    if isinstance(nested, dict):
        return _extract_url(nested)
    return None


def _extract_diet(item: dict) -> tuple[list[str], bool, bool]:
    values = []
    for key in ("suitableForDiet", "keywords", "category", "dietaryTags", "tags"):
        raw = item.get(key)
        if isinstance(raw, str):
            values.extend(re.split(r"[,|;/]", raw))
        elif isinstance(raw, list):
            values.extend(str(v) for v in raw)
    normalized = {re.sub(r"[^a-z]", "", value.lower()) for value in values if value}
    vegetarian = bool(normalized & {re.sub(r"[^a-z]", "", v) for v in DIET_VEGETARIAN})
    vegan = bool(normalized & {re.sub(r"[^a-z]", "", v) for v in DIET_VEGAN})
    tags = sorted({v.strip().lower() for v in values if v and isinstance(v, str) and len(v.strip()) <= 32})
    if vegan and "vegan" not in tags:
        tags.append("vegan")
    if vegetarian and "vegetarian" not in tags:
        tags.append("vegetarian")
    return tags, vegetarian, vegan


def _extract_allergens(item: dict) -> tuple[list[str], bool, list[str]]:
    raw = item.get("allergen") or item.get("allergens")
    values = []
    if isinstance(raw, str):
        values.extend(re.split(r"[,|;/]", raw))
    elif isinstance(raw, list):
        values.extend(str(v) for v in raw)
    cleaned = sorted({v.strip().lower() for v in values if v and v.strip()})
    verified = raw is not None
    free_for = []
    if isinstance(item.get("allergenFreeFor"), list):
        free_for = sorted({str(v).strip().lower() for v in item["allergenFreeFor"] if str(v).strip()})
    return cleaned, verified, free_for


def _iter_menu_items(node: dict):
    for key in ("hasMenuItem", "itemListElement", "hasPart", "itemList"):
        value = node.get(key)
        for item in _as_list(value):
            if isinstance(item, dict):
                nested = item.get("item") if isinstance(item.get("item"), dict) else item
                if isinstance(nested, dict):
                    yield nested


def extract_structured_menu(soup: BeautifulSoup, restaurant_name: str, restaurant_url: str, pincode: str | None = None) -> list[DishOffer]:
    offers: list[DishOffer] = []
    seen: set[tuple[str, float | None, str | None]] = set()
    normalized_pincode = normalize_pincode(pincode)
    for script in soup.find_all("script", type="application/ld+json"):
        raw = script.string or script.get_text()
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            continue
        for node in _walk_nodes(data):
            items = list(_iter_menu_items(node))
            if not items and node.get("@type") in {"MenuItem", "Product", "FoodEstablishment"}:
                items = [node]
            for item in items:
                name = _extract_name(item)
                price = _extract_offer_price(item)
                if not name or price is None:
                    continue
                dish_url = _extract_url(item)
                tags, vegetarian, vegan = _extract_diet(item)
                allergens, allergen_verified, allergen_free_for = _extract_allergens(item)
                key = (name, price, dish_url)
                if key in seen:
                    continue
                seen.add(key)
                offers.append(DishOffer(
                    restaurant_name=restaurant_name,
                    restaurant_url=restaurant_url,
                    dish_name=name,
                    price=price,
                    dish_url=dish_url,
                    dietary_tags=tags,
                    vegetarian_verified=vegetarian,
                    vegan_verified=vegan,
                    allergens=allergens,
                    allergen_verified=allergen_verified,
                    allergen_free_for=allergen_free_for,
                    region_pincode=normalized_pincode,
                    provider_evidence="provider_structured_data",
                ))
    return offers
