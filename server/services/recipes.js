import { getJson, setJson } from "../redis.js";
import { config } from "../config.js";
import { fetchJsonLimited } from "../lib/http.js";
import { enrichRecipeWithWeb } from "./recipe-enrichment.js";

const recipeCache = new Map();
const RECIPE_SEARCH_TTL_MS = 15 * 60 * 1000;
const RECIPE_DETAIL_TTL_MS = 24 * 60 * 60 * 1000;

function safeSourceUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString() : null;
  } catch { return null; }
}

function minuteLabel(value) {
  if (!Number.isFinite(value) || value <= 0) return "";
  return `${Math.round(value)} min`;
}

import { buildRecipeSummary, parseInstructions } from "./recipe-parser.js";

function buildDetails(meal) {
  const ingredients = [];
  for (let index = 1; index <= 20; index += 1) {
    const name = String(meal?.[`strIngredient${index}`] || "").trim();
    const measure = String(meal?.[`strMeasure${index}`] || "").trim();
    if (name) ingredients.push([name, measure || "As needed"]);
  }

  return {
    id: String(meal?.idMeal || ""),
    title: meal?.strMeal || "",
    source: "recipe-provider",
    cuisine: meal?.strArea || meal?.strCategory || "",
    rating: "Not provided by source",
    time: "",
    prepTime: null,
    cookTime: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    totalTimeMinutes: null,
    servingsCount: null,
    servings: "Not provided by source",
    difficulty: null,
    description: buildRecipeSummary(meal),
    ingredients,
    steps: parseInstructions(meal?.strInstructions, ingredients),
    equipment: [],
    substitutions: [],
    nutrition: null,
    image: meal?.strMealThumb || null,
    emoji: "🍽️",
    accentClass: "recipe-accent-rose",
    sourceUrl: safeSourceUrl(meal?.strSource) || safeSourceUrl(meal?.strYoutube),
    allergens: [],
    allergenVerified: false,
    allergenFreeVerified: false,
    provenance: {
      provider: "TheMealDB",
      providerRecipeId: String(meal?.idMeal || "") || null,
      enrichment: "provider",
      generatedFields: [],
      sources: [safeSourceUrl(meal?.strSource), safeSourceUrl(meal?.strYoutube)].filter(Boolean),
      updatedAt: new Date().toISOString(),
    },
  };
}

function normalizeMeal(meal, index) {
  const details = buildDetails(meal);
  return {
    id: String(meal?.idMeal || `provider-${index}`),
    title: meal?.strMeal || "Untitled recipe",
    description: buildRecipeSummary(meal),
    cuisine: meal?.strArea || meal?.strCategory || "",
    time: "",
    image: meal?.strMealThumb || "",
    tags: [meal?.strCategory, meal?.strArea, ...(String(meal?.strTags || "").split(",").map((value) => value.trim()).filter(Boolean))].filter(Boolean),
    url: details.sourceUrl,
    source: "recipe-provider",
    details: null,
    hasDetails: false,
    providerRecipeId: details.id,
  };
}

async function cacheGet(key) {
  const redisHit = await getJson(`recipe:${key}`);
  if (redisHit !== null) return redisHit;
  const entry = recipeCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) { recipeCache.delete(key); return null; }
  return entry.value;
}

async function cacheSet(key, value, ttlMs) {
  await setJson(`recipe:${key}`, value, ttlMs);
  recipeCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  while (recipeCache.size > 250) recipeCache.delete(recipeCache.keys().next().value);
  return value;
}

async function fetchMeals(path) {
  const base = config.recipeProviderUrl;
  const url = `${base.replace(/\/$/, "")}/${path}`;
  const { response, data } = await fetchJsonLimited(url, { signal: AbortSignal.timeout(7000), headers: { Accept: "application/json" } }, 2 * 1024 * 1024);
  if (!response.ok) throw new Error(`Recipe provider returned ${response.status}.`);
  return Array.isArray(data?.meals) ? data.meals : [];
}

async function randomMeals(count = 6) {
  const settled = await Promise.allSettled(Array.from({ length: Math.max(1, Math.min(count, 8)) }, () => fetchMeals("random.php")));
  const seen = new Set();
  const result = [];
  for (const entry of settled) {
    if (entry.status !== "fulfilled") continue;
    const meal = entry.value[0];
    if (!meal?.idMeal || seen.has(meal.idMeal)) continue;
    seen.add(meal.idMeal);
    result.push(meal);
  }
  return result;
}


function recipeDataQuality(recipe) {
  const missingRequired = [];
  const missingRecommended = [];
  if (!Array.isArray(recipe?.ingredients) || recipe.ingredients.length === 0) missingRequired.push("ingredients");
  if (!Array.isArray(recipe?.steps) || recipe.steps.length === 0) missingRequired.push("steps");
  if (recipe?.prepTimeMinutes == null) missingRecommended.push("prepTime");
  if (recipe?.cookTimeMinutes == null) missingRecommended.push("cookTime");
  if (recipe?.totalTimeMinutes == null) missingRecommended.push("totalTime");
  if (recipe?.servingsCount == null) missingRecommended.push("servings");
  if (!recipe?.difficulty) missingRecommended.push("difficulty");
  if (!(recipe?.equipment || []).length) missingRecommended.push("equipment");
  const steps = Array.isArray(recipe?.steps) ? recipe.steps : [];
  if (steps.some((step) => !step.duration || !step.heat || !step.cue)) missingRecommended.push("stepGuidance");
  return {
    requiredComplete: missingRequired.length === 0,
    missingRequired,
    missingRecommended: [...new Set(missingRecommended)],
  };
}

function isGenericRecipeDescription(value) {
  return !value || /^(?:[A-Za-z][A-Za-z -]+\s+)?(?:recipe|dessert|main dish|side dish|starter|snack|drink) recipe\.?$/i.test(String(value).trim());
}

async function enrichDetail(recipe) {
  if (!config.recipeEnrichmentEnabled) return recipe;
  const needsEnrichment = recipe && (
    !recipe.prepTimeMinutes || !recipe.cookTimeMinutes || !recipe.totalTimeMinutes ||
    !recipe.servingsCount || !recipe.difficulty || !(recipe.equipment || []).length ||
    isGenericRecipeDescription(recipe.description) ||
    (recipe.steps || []).some((step) => !step.duration || !step.heat || !step.cue || !step.tip || !(step.equipment || []).length)
  );
  if (!needsEnrichment) return recipe;
  try {
    const result = await enrichRecipeWithWeb(recipe);
    return result.recipe || recipe;
  } catch {
    return recipe;
  }
}

export async function getRecipeById(id) {
  const normalizedId = String(id || "").trim();
  if (!normalizedId || normalizedId.startsWith("kiku-")) return null;

  const cacheKey = `detail:${normalizedId}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;
  try {
    const meals = await fetchMeals(`lookup.php?i=${encodeURIComponent(normalizedId)}`);
    if (!meals[0]) return null;
    const base = buildDetails(meals[0]);
    const enriched = await enrichDetail(base);
    const result = { ...normalizeMeal(meals[0], 0), details: enriched, time: enriched.time || "", hasDetails: true, dataQuality: recipeDataQuality(enriched) };
    return cacheSet(cacheKey, result, RECIPE_DETAIL_TTL_MS);
  } catch {
    return null;
  }
}

export async function getRecipeByName(query) {
  const q = String(query || "").trim().slice(0, 120);
  if (!q) return null;
  const cacheKey = `name:${q.toLowerCase()}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;
  try {
    const meals = await fetchMeals(`search.php?s=${encodeURIComponent(q)}`);
    const exact = meals.find((meal) => String(meal?.strMeal || "").trim().toLowerCase() === q.toLowerCase()) || meals[0];
    if (!exact) return null;
    const result = await getRecipeById(String(exact.idMeal));
    if (result) await cacheSet(cacheKey, result, RECIPE_DETAIL_TTL_MS);
    return result;
  } catch {
    return null;
  }
}

export async function getRecipesByProviderFilter({ category = null, area = null, limit = 5 } = {}) {
  const safeLimit = Math.max(1, Math.min(8, Number(limit) || 5));
  const key = `filter:${String(category || "").toLowerCase()}:${String(area || "").toLowerCase()}:${safeLimit}`;
  const cached = await cacheGet(key);
  if (cached) return cached;
  try {
    let query = "";
    if (category) query = `c=${encodeURIComponent(String(category).slice(0, 80))}`;
    else if (area) query = `a=${encodeURIComponent(String(area).slice(0, 80))}`;
    if (!query) return { source: "recipe-provider", provider: "TheMealDB", attribution: "Recipe data provided by TheMealDB.", recipes: [] };
    const meals = await fetchMeals(`filter.php?${query}`);
    const candidates = meals.slice(0, safeLimit);
    const detailed = await Promise.allSettled(candidates.map((meal) => getRecipeById(String(meal.idMeal))));
    const recipes = detailed.filter((entry) => entry.status === "fulfilled" && entry.value).map((entry) => entry.value).slice(0, safeLimit);
    return cacheSet(key, { source: "recipe-provider", provider: "TheMealDB", attribution: "Recipe data provided by TheMealDB.", recipes }, RECIPE_SEARCH_TTL_MS);
  } catch {
    return cacheSet(key, { source: "unavailable", provider: "TheMealDB", attribution: "Recipe data provided by TheMealDB.", recipes: [], error: "RECIPE_PROVIDER_UNAVAILABLE" }, Math.min(RECIPE_SEARCH_TTL_MS, 60_000));
  }
}

export async function getRecipes(query = "") {
  const q = String(query).trim();
  const cacheKey = `search:${q.toLowerCase()}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;
  try {
    const meals = q ? await fetchMeals(`search.php?s=${encodeURIComponent(q)}`) : await randomMeals(6);
    const normalized = meals.map(normalizeMeal);
    return cacheSet(cacheKey, { source: "recipe-provider", provider: "TheMealDB", attribution: "Recipe data provided by TheMealDB.", recipes: normalized }, RECIPE_SEARCH_TTL_MS);
  } catch {
    return cacheSet(cacheKey, { source: "unavailable", provider: "TheMealDB", attribution: "Recipe data provided by TheMealDB.", recipes: [], error: "RECIPE_PROVIDER_UNAVAILABLE" }, Math.min(RECIPE_SEARCH_TTL_MS, 60_000));
  }
}
