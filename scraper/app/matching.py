from __future__ import annotations

from difflib import SequenceMatcher

from .normalize import extract_variant_tokens, normalize_text


def similarity(left: str, right: str) -> float:
    a, b = normalize_text(left), normalize_text(right)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    base = SequenceMatcher(None, a, b).ratio()
    left_variants = extract_variant_tokens(left)
    right_variants = extract_variant_tokens(right)
    if left_variants and right_variants and left_variants.isdisjoint(right_variants):
        return max(0.0, base - 0.22)
    return base


def match_best(query: str, candidates: list[str], threshold: float = 0.78) -> tuple[str | None, float]:
    best_name = None
    best_score = 0.0
    for candidate in candidates:
        score = similarity(query, candidate)
        if score > best_score:
            best_name, best_score = candidate, score
    if best_score < threshold:
        return None, best_score
    return best_name, best_score


def match_dishes(left: dict[str, float | None], right: dict[str, float | None], threshold: float = 0.84) -> list[tuple[str, str, float]]:
    pairs = []
    right_names = list(right)
    for left_name in left:
        for right_name in right_names:
            score = similarity(left_name, right_name)
            if score >= threshold:
                pairs.append((left_name, right_name, score))
    pairs.sort(key=lambda item: item[2], reverse=True)
    used_left: set[str] = set()
    used_right: set[str] = set()
    matches = []
    for left_name, right_name, score in pairs:
        if left_name in used_left or right_name in used_right:
            continue
        used_left.add(left_name)
        used_right.add(right_name)
        matches.append((left_name, right_name, score))
    return matches


def match_restaurant(query: str, candidates: list[dict], threshold: float = 0.82) -> tuple[dict | None, float]:
    best = None
    best_score = 0.0
    q = normalize_text(query)
    for candidate in candidates:
        name = candidate.get("name", "")
        score = similarity(q, name)
        address = candidate.get("address")
        if address:
            score = min(1.0, score * 0.75 + similarity(q, address) * 0.25)
        if score > best_score:
            best, best_score = candidate, score
    if best_score < threshold:
        return None, best_score
    return best, best_score
