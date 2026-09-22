import test from "node:test";
import assert from "node:assert/strict";
import { normalizeComparison } from "../providers/compare.js";

test("normalizeComparison keeps only Kiku price fields", () => {
  const result = normalizeComparison({
    restaurant_query: "Biryani Blues",
    canonical_restaurant: "Biryani Blues",
    restaurant_match_confidence: 0.98,
    dish_query: "Chicken Biryani",
    checked_at: "2026-09-21T10:00:00Z",
    offers: [
      { platform: "swiggy", restaurant_name: "Biryani Blues", dish_name: "Chicken Biryani", price: 249, checked_at: "2026-09-21T10:00:00Z" },
      { platform: "zomato", restaurant_name: "Biryani Blues", dish_name: "Chicken Biryani", price: 229, checked_at: "2026-09-21T10:00:00Z", etaMinutes: 28, deliveryFee: 35 },
      { platform: "other", price: 100 },
    ],
  });

  assert.equal(result.offers.length, 2);
  assert.deepEqual(Object.keys(result.offers[0]).sort(), ["allergenFreeFor", "allergenFreeVerified", "allergenVerified", "allergens", "checkedAt", "dietaryTags", "dietaryVerified", "dishName", "listed", "matchConfidence", "platform", "price", "restaurantName", "restaurantUrl", "veganVerified", "vegetarianVerified"].sort());
  assert.equal(result.cheapestPlatform, "zomato");
  assert.equal("etaMinutes" in result.offers[1], false);
  assert.equal("deliveryFee" in result.offers[1], false);
});
