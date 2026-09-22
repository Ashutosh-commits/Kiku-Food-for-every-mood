import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { matchesDietaryFilter, normalizeDietaryEvidence } from "../../shared/dietary.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("allergen free tags cannot override an explicit negative verification flag", () => {
  assert.equal(matchesDietaryFilter({ tags: ["dairy-free"], allergenVerified: false }, { allergies: ["lactose"] }), false);
  assert.equal(matchesDietaryFilter({ tags: ["peanut-free"], allergen_free: false }, { allergies: ["groundnut"] }), false);
});

test("dietary normalization is stable when applied more than once", () => {
  const once = normalizeDietaryEvidence({
    dietaryTags: ["vegan"],
    allergens: ["milk"],
    allergenVerified: true,
    tags: ["dairy-free"],
  });
  const twice = normalizeDietaryEvidence(once);
  assert.deepEqual(twice, once);
});

test("automation shutdown deletes the namespaced heartbeat key", () => {
  const worker = fs.readFileSync(path.join(root, "server/automation/worker.js"), "utf8");
  assert.match(worker, /const heartbeatKey = `\$\{config\.redisPrefix\}:automation:heartbeat`/);
  assert.match(worker, /deleteKey\(heartbeatKey\)/);
  assert.doesNotMatch(worker, /deleteKey\(["']automation:heartbeat["']\)/);
});

test("recipe banner is shown only while allergen verification is unavailable", () => {
  const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
  assert.match(app, /activeRecipe\.recipe\.allergenVerified !== true \?/);
  assert.match(app, /Allergen safety not verified/);
});

test("recipe detail normalization builds details from provider data instead of an empty placeholder", () => {
  const recipes = fs.readFileSync(path.join(root, "server/services/recipes.js"), "utf8");
  assert.match(recipes, /const base = buildDetails\(meals\[0\]\);/);
  assert.doesNotMatch(recipes, /const base = normalizeMeal\(meals\[0\], 0\)\.details;/);
});

test("client API requests have a bounded timeout", () => {
  const api = fs.readFileSync(path.join(root, "src/services/api.ts"), "utf8");
  assert.match(api, /DEFAULT_REQUEST_TIMEOUT_MS = 20_000/);
  assert.match(api, /AbortController/);
  assert.match(api, /controller\.abort\(\)/);
});

test("camera restart stops the prior stream before opening a new stream", () => {
  const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
  const marker = "const startMoodScan = async";
  const start = app.indexOf(marker);
  assert.ok(start >= 0);
  const block = app.slice(start, start + 2200);
  assert.match(block, /stopMoodStream\(\)/);
});

test("comparison lock lifetime covers its worst-case upstream retry window", () => {
  const index = fs.readFileSync(path.join(root, "server/index.js"), "utf8");
  assert.match(index, /const lockTtlMs = Math\.max\(30_000, config\.compareTimeoutMs \* 2 \+ 5_000\)/);
  assert.match(index, /code = "COMPARE_BUSY"/);
});

test("Docker production image contains shared runtime modules", () => {
  const dockerfile = fs.readFileSync(path.join(root, "Dockerfile"), "utf8");
  assert.match(dockerfile, /COPY --from=build \/app\/shared \.\/shared/);
});


test("regional status reports upstream errors as JSON state instead of a polling 502", () => {
  const index = fs.readFileSync(path.join(root, "server", "index.js"), "utf8");
  assert.match(index, /This endpoint reports state; an upstream scraper failure is part of the state/);
  assert.match(index, /res\.status\(200\)\.json\(result\)/);
  assert.doesNotMatch(index, /res\.status\(result\.status === "error" \? 502/);
});

test("assistant exposes a constraint-aware recipe option tool", () => {
  const assistant = fs.readFileSync(path.join(root, "server", "services", "assistant.js"), "utf8");
  assert.match(assistant, /name: "findRecipeOptions"/);
  assert.match(assistant, /Do not use this for generic requests with constraints/);
  assert.match(assistant, /case "findRecipeOptions"/);
  assert.match(assistant, /candidateFoods/);
  assert.match(assistant, /recipe provider does not supply verified dietary or allergen metadata/);
});

test("assistant budget parsing recognizes common natural-language budget forms", () => {
  const assistant = fs.readFileSync(path.join(root, "server", "services", "assistant.js"), "utf8");
  assert.match(assistant, /under\|below\|upto\|up to\|less than/);
  assert.match(assistant, /budgetMax = budgetMatch/);
  assert.match(assistant, /findRecipeOptions/);
});

test("recipe provider filter fallback exists for verified provider categories", () => {
  const recipes = fs.readFileSync(path.join(root, "server", "services", "recipes.js"), "utf8");
  const assistant = fs.readFileSync(path.join(root, "server", "services", "assistant.js"), "utf8");
  assert.match(recipes, /filter\.php/);
  assert.match(assistant, /category: "Vegetarian"/);
  assert.match(assistant, /category: "Vegan"/);
});
