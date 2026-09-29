from __future__ import annotations

import hmac
import ipaddress
import re
from urllib.parse import urlparse

PROVIDER_SUFFIXES = {
    "swiggy": ("swiggy.com",),
    "zomato": ("zomato.com",),
}


def normalize_pincode(value: str | None) -> str | None:
    normalized = str(value or "").strip()
    return normalized if re.fullmatch(r"[1-9]\d{5}", normalized) else None


def _host_allowed(host: str, suffixes: tuple[str, ...]) -> bool:
    host = host.rstrip(".").lower()
    return any(host == suffix or host.endswith(f".{suffix}") for suffix in suffixes)


def validate_provider_url(value: str | None, provider: str) -> str | None:
    if not value:
        return None
    parsed = urlparse(str(value))
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError("Provider URLs must use HTTPS and include a hostname.")
    host = parsed.hostname.lower().rstrip(".")
    if not _host_allowed(host, PROVIDER_SUFFIXES[provider]):
        raise ValueError(f"URL is not an allowed {provider} provider host.")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise ValueError("Provider URL hostname must not be an IP address.")
    if parsed.username or parsed.password:
        raise ValueError("Provider URLs must not include userinfo.")
    return parsed.geturl()


def auth_key_matches(provided: str | None, expected: str) -> bool:
    if not expected:
        return True
    return bool(provided) and hmac.compare_digest(provided, expected)
