import test from "node:test";
import assert from "node:assert/strict";
import { filterComparisonOffers, matchesDietaryFilter, normalizeDietaryEvidence } from "../../shared/dietary.js";

test("vegetarian filtering requires explicit provider evidence", () => {
  assert.equal(matchesDietaryFilter({ name: "Veg Biryani" }, { dietary: ["Vegetarian"] }), false);
  assert.equal(matchesDietaryFilter({ name: "Veg Biryani", tags: ["Vegetarian"] }, { dietary: ["Vegetarian"] }), true);
  assert.equal(matchesDietaryFilter({ name: "Paneer", dietaryTags: ["vegetarian"], dietaryVerified: true }, { dietary: ["Vegetarian"] }), true);
});

test("allergen filtering fails closed when source does not declare allergens", () => {
  assert.equal(matchesDietaryFilter({ name: "Pasta" }, { allergies: ["Dairy"] }), false);
  assert.equal(matchesDietaryFilter({ name: "Pasta", allergens: [], allergenVerified: true }, { allergies: ["Dairy"] }), true);
  assert.equal(matchesDietaryFilter({ name: "Pasta", allergenVerified: true }, { allergies: ["Dairy"] }), false);
  assert.equal(matchesDietaryFilter({ name: "Pasta", allergens: ["milk"], allergenVerified: true }, { allergies: ["Dairy"] }), false);
});

test("allergen-free-only requires verified empty allergen evidence", () => {
  assert.equal(matchesDietaryFilter({ name: "Pasta", allergens: [] }, { allergenFreeOnly: true }), true);
  assert.equal(matchesDietaryFilter({ name: "Pasta" }, { allergenFreeOnly: true }), false);
  assert.equal(matchesDietaryFilter({ name: "Pasta", allergens: ["soy"], allergenVerified: true }, { allergenFreeOnly: true }), false);
});

test("comparison offers do not use dish-name heuristics", () => {
  const offers = [
    { platform: "swiggy", dishName: "Veg Pizza", tags: [] },
    { platform: "zomato", dishName: "Veg Pizza", tags: ["Vegetarian"] },
  ].map(normalizeDietaryEvidence);
  const filtered = filterComparisonOffers(offers, { dietary: ["vegetarian"] });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].dietaryTags.includes("vegetarian"), true);
});

test("scraper metadata aliases normalize to the same safety contract", () => {
  const evidence = normalizeDietaryEvidence({ is_vegetarian: true, dietary_verified: true, allergens: ["milk"], allergen_verified: true });
  assert.equal(evidence.vegetarianVerified, true);
  assert.equal(evidence.allergenVerified, true);
  assert.deepEqual(evidence.dietaryTags, ["vegetarian"]);
  assert.deepEqual(evidence.allergens, ["dairy"]);
});
