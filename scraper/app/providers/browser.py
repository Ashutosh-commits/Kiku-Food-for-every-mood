from __future__ import annotations

from contextlib import asynccontextmanager
from urllib.parse import urlparse
import ipaddress
import socket

from playwright.async_api import Browser, Page, async_playwright

from ..config import settings

ALLOWED_HOST_SUFFIXES = ("swiggy.com", "zomato.com")


def _host(value: str) -> str | None:
    try:
        return urlparse(value).hostname
    except Exception:
        return None


def _allowed_provider_host(url: str) -> bool:
    host = _host(url)
    if not host:
        return False
    host = host.rstrip(".").lower()
    return any(host == suffix or host.endswith(f".{suffix}") for suffix in ALLOWED_HOST_SUFFIXES)


def _is_private_or_local_host(host: str) -> bool:
    normalized = host.rstrip(".").lower()
    if normalized in {"localhost", "host.docker.internal"} or normalized.endswith((".localhost", ".local", ".internal")):
        return True
    try:
        address = ipaddress.ip_address(normalized)
    except ValueError:
        address = None
    if address is not None:
        return address.is_private or address.is_loopback or address.is_link_local or address.is_multicast or address.is_unspecified or address.is_reserved
    try:
        infos = socket.getaddrinfo(normalized, None, proto=socket.IPPROTO_TCP)
    except OSError:
        return False
    addresses = {info[4][0] for info in infos if info and info[4]}
    for resolved in addresses:
        try:
            address = ipaddress.ip_address(resolved)
        except ValueError:
            continue
        if address.is_private or address.is_loopback or address.is_link_local or address.is_multicast or address.is_unspecified or address.is_reserved:
            return True
    return False


async def _route_filter(route):
    request_url = route.request.url
    if request_url.startswith(("data:", "blob:", "about:")):
        await route.continue_()
        return
    parsed = urlparse(request_url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        await route.abort()
        return

    # The top-level document must stay on the requested provider. Public
    # subresources (CDNs, image hosts, provider APIs, etc.) are allowed so
    # provider pages can actually render, but local/private destinations are
    # blocked to preserve SSRF protection.
    if route.request.resource_type == "document":
        if _allowed_provider_host(request_url):
            await route.continue_()
        else:
            await route.abort()
        return

    if _is_private_or_local_host(parsed.hostname):
        await route.abort()
        return
    await route.continue_()


@asynccontextmanager
async def browser_page():
    async with async_playwright() as playwright:
        launch_kwargs = {"headless": True}
        if settings.browser_channel:
            launch_kwargs["channel"] = settings.browser_channel
        browser: Browser = await playwright.chromium.launch(**launch_kwargs)
        context = await browser.new_context(
            user_agent=settings.user_agent,
            locale="en-IN",
            viewport={"width": 1440, "height": 1000},
            java_script_enabled=True,
        )
        page: Page = await context.new_page()
        page.set_default_timeout(settings.browser_timeout_ms)
        await page.route("**/*", _route_filter)
        try:
            yield page
        finally:
            await context.close()
            await browser.close()
