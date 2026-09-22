import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, "../..");
const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
const recipes = fs.readFileSync(path.join(root, "src/data/recipes.ts"), "utf8");
const css = fs.readFileSync(path.join(root, "src/index.css"), "utf8");

test("recipe UX supports serving scaling and step-aware cooking", () => {
  assert.match(recipes, /scaleIngredientAmount/);
  assert.match(app, /Ingredients update automatically/);
  assert.match(app, /getCookingIngredientState\(\)/);
  assert.match(app, /Look for/);
  assert.match(app, /Ask Kiku about this step/);
});

test("recipe UX no longer reuses Butter Chicken imagery for unrelated recipes", () => {
  const badUniversalFallback = /activeRecipe\.dish\.name === "Butter Chicken"\s*\?\s*"\/butter-chicken-hero\.jpg"\s*:\s*"\/butter-chicken-hero\.jpg"/.test(app);
  assert.equal(badUniversalFallback, false);
  assert.match(app, /recipe\.image/);
  assert.match(app, /recipe-hero-fallback/);
});

test("cooking mode has user-controlled timer completion and responsive recipe styling", () => {
  assert.match(app, /Keep this step/);
  assert.match(app, /Continue to next step/);
  assert.match(app, /WakeLock|wakeLock/);
  assert.match(css, /recipe-step-row-rich/);
  assert.match(css, /cooking-timer-card/);
  assert.match(css, /@media \(max-width: 640px\)/);
});


test("recipe runtime contains no hard-coded sample recipe fallbacks", () => {
  const recipesData = fs.readFileSync(path.join(root, "src/data/recipes.ts"), "utf8");
  const service = fs.readFileSync(path.join(root, "server/services/recipes.js"), "utf8");
  assert.doesNotMatch(recipesData, /fallbackRecipes|recipeTemplates/);
  assert.doesNotMatch(service, /const\s+curated\s*=|kiku-(?:butter|paneer|miso|margherita|chocolate|chicken)/i);
});


test("recipe research and substitution APIs are wired", () => {
  const server = fs.readFileSync(path.join(root, "server", "index.js"), "utf8");
  const assistant = fs.readFileSync(path.join(root, "server", "services", "assistant.js"), "utf8");
  assert.match(server, /\/api\/recipes\/enrich/);
  assert.match(server, /\/api\/recipes\/substitute/);
  assert.match(assistant, /researchRecipeDetails/);
  assert.match(assistant, /substituteRecipeIngredient/);
});


test("guest assistant has a deterministic response path instead of stopping after the user message", () => {
  const source = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
  assert.match(source, /if \(!isLoggedIn\) \{[\s\S]*setAssistantMessages\(\(current\) => \[\.\.\.current, \{ role: "assistant"/);
  assert.match(source, /assistantMatches\.slice\(0, 3\)/);
});


test("food insights have a real profile UI path and consume the insights API", () => {
  const profile = fs.readFileSync(path.join(root, "src/pages/profile/Profile.tsx"), "utf8");
  const insights = fs.readFileSync(path.join(root, "src/pages/profile/ProfileInsights.tsx"), "utf8");
  assert.match(profile, /ProfileInsightsPage/);
  assert.match(profile, /go\("insights"\)/);
  assert.match(insights, /api\.insights\(\)/);
});


test("profile preferences expose every recommendation preference field supported by the API", () => {
  const page = fs.readFileSync(path.join(root, "src/pages/profile/ProfilePreferences.tsx"), "utf8");
  assert.match(page, /cuisineOptions/);
  assert.match(page, /spiceOptions/);
  assert.match(page, /budgetMin/);
  assert.match(page, /budgetMax/);
  assert.match(page, /allergyOptions/);
});


test("saved recipes do not fabricate a fallback cooking time", () => {
  const saved = fs.readFileSync(path.join(root, "src/pages/profile/ProfileSaved.tsx"), "utf8");
  assert.doesNotMatch(saved, /recipe\.time \|\| ["']30 min["']/);
  assert.match(saved, /Not provided by source/);
});


test("recipe detail enrichment is triggered for generic descriptions and missing step guidance", () => {
  const service = fs.readFileSync(path.join(root, "server/services/recipes.js"), "utf8");
  assert.match(service, /isGenericRecipeDescription\(recipe\.description\)/);
  assert.match(service, /!step\.tip/);
  assert.match(service, /!\(step\.equipment \|\| \[\]\)\.length/);
});
