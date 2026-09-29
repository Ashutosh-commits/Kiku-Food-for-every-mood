import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("assistant renders recipe and dish result cards with safe original-link handling", () => {
  const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
  assert.match(app, /message\.data\?\.type === "recipe_options"/);
  assert.match(app, /message\.data\?\.type === "recipes"/);
  assert.match(app, /getAssistantExternalUrl/);
  assert.match(app, /getAssistantRecipeUrl/);
  assert.match(app, /target=\"_blank\" rel=\"noopener noreferrer\"/);
});

test("assistant recipe result data keeps the provider URL available", () => {
  const recipes = fs.readFileSync(path.join(root, "server", "services", "recipes.js"), "utf8");
  assert.match(recipes, /url: details\.sourceUrl/);
  assert.match(recipes, /sourceUrl: safeSourceUrl/);
});


test("assistant dish cards use restaurant/menu listing URLs, not fabricated item URLs", () => {
  const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
  assert.match(app, /item\?\.restaurantUrl, item\?\.restaurant_url/);
  assert.match(app, /View restaurant menu/);
});
