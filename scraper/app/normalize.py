from __future__ import annotations

import re
import unicodedata

_STOPWORDS = {
    "restaurant", "restro", "hotel", "cafe", "the", "official",
}


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    value = unicodedata.normalize("NFKD", value).lower()
    value = re.sub(r"[₹$€£]|rs\.?|inr", " ", value)
    value = re.sub(r"[\u2010-\u2015\-_/|]+", " ", value)
    value = re.sub(r"\([^)]*\)", lambda m: f" {m.group(0)[1:-1]} ", value)
    value = re.sub(r"\[[^]]*\]", lambda m: f" {m.group(0)[1:-1]} ", value)
    value = re.sub(r"[^a-z0-9\s]", " ", value)
    tokens = [t for t in value.split() if t and t not in _STOPWORDS]
    return " ".join(tokens)


def parse_price(value: str | int | float | None) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    match = re.search(r"(\d+(?:\.\d+)?)", value.replace(",", ""))
    return float(match.group(1)) if match else None


def extract_variant_tokens(value: str | None) -> set[str]:
    normalized = normalize_text(value)
    tokens = set(normalized.split())
    variants = {"single", "half", "full", "small", "medium", "large", "regular", "jumbo"}
    return tokens & variants
