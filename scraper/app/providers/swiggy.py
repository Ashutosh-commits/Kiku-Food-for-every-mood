from __future__ import annotations

import re
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from ..normalize import parse_price
from ..security import normalize_pincode, validate_provider_url
from .base import DishOffer, RestaurantCandidate
from .browser import browser_page
from .parsing import extract_structured_menu
from .search import search_provider_links, search_provider_links_by_pincode


def _extract_restaurant_name(soup: BeautifulSoup, fallback: str) -> str:
    candidates = []
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    if title:
        candidates.append(title.split("|")[0].strip())
    for selector in ['meta[property="og:title"]', "h1", "[class*=restaurantName]", "[class*=restaurant-name]"]:
        node = soup.select_one(selector)
        if node:
            value = node.get("content") if node.name == "meta" else node.get_text(" ", strip=True)
            if value:
                candidates.append(value.strip())
    return next((value for value in candidates if value), fallback)


def _extract_eta_minutes(soup: BeautifulSoup) -> int | None:
    for node in soup.select("[class*='time'], [class*='Time'], [class*='eta'], [class*='ETA']"):
        text = node.get_text(" ", strip=True)
        match = re.search(r"(\d{1,3})\s*(?:-\s*\d{1,3}\s*)?(?:min|mins|minutes)\b", text, re.IGNORECASE)
        if match:
            return int(match.group(1))
    return None


def _extract_delivery_fee(soup: BeautifulSoup) -> float | None:
    for node in soup.select("[class*='delivery'], [class*='Delivery']"):
        text = node.get_text(" ", strip=True)
        if "free" in text.lower():
            return 0.0
        price = parse_price(text)
        if price is not None:
            return price
    return None


def _page_mentions_pincode(soup: BeautifulSoup, pincode: str | None) -> bool:
    normalized = normalize_pincode(pincode)
    if not normalized:
        return False
    haystack = soup.get_text(" ", strip=True)
    return normalized in haystack


class SwiggyProvider:
    name = "swiggy"

    def search_restaurants(self, location: str, restaurant: str, pincode: str | None = None) -> list[RestaurantCandidate]:
        # Synchronous compatibility path. The async code uses search_restaurants_async
        # so Google search is never performed directly on the event loop.
        import asyncio
        return asyncio.run(self.search_restaurants_async(location, restaurant, pincode))

    async def search_restaurants_async(self, location: str, restaurant: str, pincode: str | None = None) -> list[RestaurantCandidate]:
        if pincode:
            links = await search_provider_links_by_pincode("Swiggy", pincode, max_results=5)
        else:
            links = await search_provider_links("Swiggy", restaurant, location, max_results=5)
        results: list[RestaurantCandidate] = []
        for url in links:
            try:
                safe = validate_provider_url(url, "swiggy")
            except ValueError:
                continue
            results.append(RestaurantCandidate(
                name=restaurant,
                address=location,
                url=safe,
                provider=self.name,
                pincode=normalize_pincode(pincode),
            ))
        return results

    async def get_menu_async(self, location: str, restaurant: str, restaurant_url: str | None = None, pincode: str | None = None) -> list[DishOffer]:
        normalized_pincode = normalize_pincode(pincode)
        if restaurant_url is None:
            candidates = await self.search_restaurants_async(location, restaurant, normalized_pincode)
            if not candidates:
                raise RuntimeError("No Swiggy restaurant URL found for the requested restaurant/location.")
            restaurant_url = candidates[0].url
        else:
            restaurant_url = validate_provider_url(restaurant_url, "swiggy")

        async with browser_page() as page:
            response = await page.goto(restaurant_url, wait_until="domcontentloaded")
            if response is None:
                raise RuntimeError("Swiggy returned no navigation response.")
            if response.status >= 400:
                raise RuntimeError(f"Swiggy returned HTTP {response.status} for the provider listing.")
            final_url = validate_provider_url(page.url, "swiggy")
            await page.wait_for_timeout(1000)
            html = await page.content()
            if len(html) < 2000:
                raise RuntimeError("Swiggy provider page was unexpectedly small; it may be blocked or incomplete.")
            text = await page.locator("body").inner_text()
            lowered = text.lower()
            if any(marker in lowered for marker in ("access denied", "captcha", "verify you are human", "just a moment")):
                raise RuntimeError("Swiggy provider page appears to be blocked by an anti-bot/interstitial page.")

        soup = BeautifulSoup(html, "html.parser")
        actual_restaurant_name = _extract_restaurant_name(soup, restaurant)
        eta_minutes = _extract_eta_minutes(soup)
        delivery_fee = _extract_delivery_fee(soup)
        pincode_verified = _page_mentions_pincode(soup, normalized_pincode)
        offers = extract_structured_menu(soup, actual_restaurant_name, final_url, normalized_pincode)
        seen = {(o.dish_name, o.price, o.dish_url) for o in offers}

        if not offers:
            containers = soup.select("[class*='detailsContainer'], [class*='itemNameText'], [data-testid*='menu'], article")
            for container in containers:
                name_node = container.select_one("h3, h4, [class*='itemNameText']")
                price_node = container.select_one("span.rupee, [class*='price'], [class*='Price']")
                if not name_node or not price_node:
                    continue
                name = name_node.get_text(" ", strip=True)
                price = parse_price(price_node.get_text(" ", strip=True))
                if not name or price is None:
                    continue
                key = (name, price, None)
                if key in seen:
                    continue
                seen.add(key)
                offers.append(DishOffer(
                    restaurant_name=actual_restaurant_name,
                    restaurant_url=final_url,
                    dish_name=name,
                    price=price,
                    region_pincode=normalized_pincode,
                ))

        for offer in offers:
            offer.eta_minutes = eta_minutes
            offer.delivery_fee = delivery_fee
            offer.region_pincode = normalized_pincode
            offer.region_verified = pincode_verified
        return offers
