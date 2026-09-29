from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class RestaurantCandidate:
    name: str
    address: str | None
    url: str
    provider: str
    pincode: str | None = None
    pincode_verified: bool = False
    metadata: dict = field(default_factory=dict)


@dataclass
class DishOffer:
    restaurant_name: str
    restaurant_url: str
    dish_name: str
    price: float | None
    eta_minutes: int | None = None
    delivery_fee: float | None = None
    dish_url: str | None = None
    dietary_tags: list[str] = field(default_factory=list)
    vegetarian_verified: bool = False
    vegan_verified: bool = False
    allergens: list[str] = field(default_factory=list)
    allergen_verified: bool = False
    allergen_free_for: list[str] = field(default_factory=list)
    region_pincode: str | None = None
    region_verified: bool = False
    provider_evidence: str | None = None
    final_price: float | None = None
    description: str | None = None
    category_name: str | None = None
    image_url: str | None = None
    in_stock: bool | None = None
    item_rating: float | None = None
    item_rating_count: int | None = None


class FoodProvider(Protocol):
    name: str

    def search_restaurants(self, location: str, restaurant: str, pincode: str | None = None) -> list[RestaurantCandidate]: ...

    async def get_menu_async(
        self, location: str, restaurant: str, restaurant_url: str | None = None, pincode: str | None = None
    ) -> list[DishOffer]: ...
