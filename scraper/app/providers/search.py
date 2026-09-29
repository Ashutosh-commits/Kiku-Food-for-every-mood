from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote_plus

from ..config import settings

try:
    from googlesearch import search as google_search
except Exception:  # pragma: no cover
    google_search = None

SEARCH_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="provider-search")
SEARCH_SEMAPHORE = asyncio.Semaphore(settings.max_concurrent_searches)


def provider_search_urls(platform: str, restaurant: str, location: str) -> list[str]:
    query = quote_plus(f"{platform} {restaurant} {location}")
    return [f"https://www.google.com/search?q={query}"]


def _blocking_search(query: str, max_results: int) -> list[str]:
    if google_search is None:
        return []
    try:
        return list(google_search(query, num_results=max_results))
    except TypeError:
        try:
            return list(google_search(query, num=max_results, stop=max_results))
        except Exception:
            return []
    except Exception:
        return []


async def search_provider_links(platform: str, restaurant: str, location: str, max_results: int = 5) -> list[str]:
    query = f"site:{platform.lower()}.com {restaurant} {location}"
    async with SEARCH_SEMAPHORE:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(SEARCH_EXECUTOR, _blocking_search, query, max_results)


async def search_provider_links_by_pincode(platform: str, pincode: str, max_results: int = 5) -> list[str]:
    query = f"site:{platform.lower()}.com restaurant food {pincode} India"
    async with SEARCH_SEMAPHORE:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(SEARCH_EXECUTOR, _blocking_search, query, max_results)
