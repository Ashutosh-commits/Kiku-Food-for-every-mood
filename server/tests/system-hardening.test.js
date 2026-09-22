import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeDietaryEvidence, matchesDietaryFilter, detectPotentialAllergensFromIngredients } from "../../shared/dietary.js";
import { normalizeComparison } from "../providers/compare.js";
import { hashPassword, verifyPassword } from "../lib/crypto.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("password scrypt parameters work and malformed encodings fail closed", async () => {
  const encoded = await hashPassword("Kiku-test-password-123!");
  assert.match(encoded, /^scrypt\$32768\$8\$1\$/);
  assert.equal(await verifyPassword("Kiku-test-password-123!", encoded), true);
  assert.equal(await verifyPassword("wrong-password", encoded), false);
  assert.equal(await verifyPassword("anything", "scrypt$999999999$8$1$bad$abcd"), false);
});

test("dietary evidence never upgrades an explicit negative verification flag", () => {
  assert.equal(normalizeDietaryEvidence({ dietaryVerified: false, tags: ["vegetarian"] }).vegetarianVerified, false);
  assert.equal(normalizeDietaryEvidence({ isVegetarian: false, tags: ["vegetarian"] }).vegetarianVerified, false);
  assert.equal(normalizeDietaryEvidence({ isVegan: true }).vegetarianVerified, true);
  assert.equal(normalizeDietaryEvidence({ isVegetarian: false, isVegan: true }).vegetarianVerified, false);
});

test("dietary aliases and provider free tags are normalized safely", () => {
  assert.equal(matchesDietaryFilter({ dietaryTags: ["vegan"], dietaryVerified: true }, { dietary: ["vegetarian"] }), true);
  assert.equal(matchesDietaryFilter({ tags: ["dairy-free"] }, { allergies: ["lactose"] }), true);
  assert.equal(matchesDietaryFilter({ allergens: ["dairy"], tags: ["dairy-free"] }, { allergies: ["lactose"] }), false);
  assert.equal(matchesDietaryFilter({ allergens: ["peanuts"], allergenVerified: true }, { allergies: ["groundnut"] }), false);
  assert.equal(matchesDietaryFilter({ allergens: ["tree_nuts"], allergenVerified: true }, { allergies: ["peanut"] }), true);
  assert.equal(matchesDietaryFilter({ allergenVerified: true }, { allergies: ["dairy"] }), false);
  assert.equal(matchesDietaryFilter({ allergens: [], allergenVerified: true }, { allergies: ["dairy"] }), true);
  assert.equal(matchesDietaryFilter({ allergenFree: true, allergens: ["dairy"] }, { allergenFreeOnly: true }), false);
});

test("recipe ingredient warning detects known allergy-name matches without claiming safety", () => {
  assert.deepEqual(
    detectPotentialAllergensFromIngredients([["Groundnut oil", "1 tbsp"], ["Butter", "20 g"]], ["peanut", "lactose"]),
    ["peanuts", "dairy"],
  );
  assert.deepEqual(detectPotentialAllergensFromIngredients([["Eggplant", "1"]], ["egg"]), []);
});

test("comparison prices reject null, empty, negative and non-numeric values", () => {
  const result = normalizeComparison({ offers: [
    { platform: "swiggy", dish_name: "A", price: null },
    { platform: "zomato", dish_name: "B", price: "" },
    { platform: "swiggy", dish_name: "C", price: -10 },
    { platform: "zomato", dish_name: "D", price: "249.5" },
  ] });
  assert.deepEqual(result.offers.map((offer) => offer.price), [null, null, null, 249.5]);
  assert.equal(result.cheapestPlatform, "zomato");
});

test("Docker runtime includes shared modules used by the server", () => {
  const dockerfile = fs.readFileSync(path.join(root, "Dockerfile"), "utf8");
  assert.match(dockerfile, /COPY --from=build \/app\/shared \.\/shared/);
});

test("BullMQ queue names do not contain reserved separators", () => {
  const queues = fs.readFileSync(path.join(root, "server", "automation", "queues.js"), "utf8");
  const matches = [...queues.matchAll(/\b(?:comparison|recipes|personalization|maintenance|health):\s*"([^"]+)"/g)].map((match) => match[1]);
  assert.equal(matches.length, 5);
  assert.equal(matches.some((name) => name.includes(":")), false);
});

test("client search reruns when user safety preferences change", () => {
  const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
  assert.match(app, /api\.search\(q, \{ pincode, dietary: preferences\.dietary, allergies: preferences\.allergies \}\)/);
  assert.match(app, /\}, \[searchQuery, preferenceVersion, pincode, regionDataVersion\]\);/);
});

test("recipes expose an explicit unverified-allergen state", () => {
  const recipes = fs.readFileSync(path.join(root, "server", "services", "recipes.js"), "utf8");
  const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
  assert.match(recipes, /allergenVerified: false/);
  assert.match(app, /Allergen safety not verified/);
  assert.match(app, /Potential ingredient match/);
});

test("Google sign-in requires an explicit verified email claim", () => {
  const auth = fs.readFileSync(path.join(root, "server", "auth.js"), "utf8");
  assert.match(auth, /payload\.email_verified !== true/);
});
