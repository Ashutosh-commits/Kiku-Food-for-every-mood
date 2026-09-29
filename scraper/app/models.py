from __future__ import annotations

from datetime import datetime, timezone
from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator

from .security import normalize_pincode, validate_provider_url


class SearchRequest(BaseModel):
    location: str | None = Field(default=None, min_length=2, max_length=120)
    restaurant: str = Field(min_length=2, max_length=160)
    dish: str | None = Field(default=None, max_length=160)
    pincode: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    resolved_city: str | None = Field(default=None, min_length=2, max_length=120)
    swiggy_url: HttpUrl | None = None
    zomato_url: HttpUrl | None = None

    @model_validator(mode="after")
    def validate_discovery_location(self):
        if not self.location and not self.pincode:
            raise ValueError("Provide a city/location or pincode for discovery")
        return self

    @field_validator("pincode")
    @classmethod
    def validate_pincode(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        normalized = normalize_pincode(value)
        if normalized is None:
            raise ValueError("pincode must be a valid 6-digit Indian PIN code")
        return normalized

    @field_validator("swiggy_url")
    @classmethod
    def validate_swiggy_url(cls, value: HttpUrl | None) -> HttpUrl | None:
        if value is None:
            return None
        validate_provider_url(str(value), "swiggy")
        return value

    @field_validator("zomato_url")
    @classmethod
    def validate_zomato_url(cls, value: HttpUrl | None) -> HttpUrl | None:
        if value is None:
            return None
        validate_provider_url(str(value), "zomato")
        return value


class RegionRequest(BaseModel):
    pincode: str = Field(min_length=6, max_length=6)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    resolved_city: str | None = Field(default=None, min_length=2, max_length=120)

    @field_validator("pincode")
    @classmethod
    def validate_pincode(cls, value: str) -> str:
        normalized = normalize_pincode(value)
        if normalized is None:
            raise ValueError("pincode must be a valid 6-digit Indian PIN code")
        return normalized


class PlatformOffer(BaseModel):
    platform: str
    restaurant_name: str | None = None
    restaurant_url: HttpUrl | None = None
    dish_name: str
    dish_url: HttpUrl | None = None
    price: float | None = None
    delivery_fee: float | None = None
    platform_fee: float | None = None
    available: bool = True
    eta_minutes: int | None = None
    checked_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    match_confidence: float = 0.0
    dietary_tags: list[str] = Field(default_factory=list)
    vegetarian_verified: bool = False
    vegan_verified: bool = False
    allergens: list[str] = Field(default_factory=list)
    allergen_verified: bool = False
    allergen_free_for: list[str] = Field(default_factory=list)
    region_pincode: str | None = None
    region_verified: bool = False


class ComparisonResponse(BaseModel):
    restaurant_query: str
    location: str
    canonical_restaurant: str | None
    restaurant_match_confidence: float
    dish_query: str | None
    offers: list[PlatformOffer]
    cheapest_platform: str | None = None
    fastest_platform: str | None = None
    warnings: list[str] = Field(default_factory=list)
    checked_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RegionalDish(BaseModel):
    id: str
    name: str
    restaurant: str
    restaurant_url: HttpUrl
    listing_url: HttpUrl | None = None
    price: float | None = None
    finalPrice: float | None = None
    description: str | None = None
    categoryName: str | None = None
    imageUrl: HttpUrl | None = None
    inStock: bool | None = None
    itemRating: float | None = None
    itemRatingCount: int | None = None
    tags: list[str] = Field(default_factory=list)
    dietaryTags: list[str] = Field(default_factory=list)
    isVegetarian: bool = False
    isVegan: bool = False
    allergens: list[str] = Field(default_factory=list)
    allergenVerified: bool = False
    allergenFreeFor: list[str] = Field(default_factory=list)
    dietaryVerified: bool = False
    pincode: str
    pincodeVerified: bool = False
    provider: str
    checkedAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RegionalRestaurant(BaseModel):
    id: str
    name: str
    provider: str
    url: HttpUrl
    pincode: str
    pincodeVerified: bool = False
    cuisine: str | None = None


class RegionalResponse(BaseModel):
    pincode: str
    checkedAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    dishes: list[RegionalDish] = Field(default_factory=list)
    restaurants: list[RegionalRestaurant] = Field(default_factory=list)
    offers: list[dict] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
