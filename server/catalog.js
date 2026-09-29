import { collection } from "./db.js";
import { getJson, setJson } from "./redis.js";
import { matchesDietaryFilter } from "../shared/dietary.js";

const ENTITY_CACHE_TTL_MS = 10 * 60 * 1000;

const safeLimit = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(100, Math.max(1, parsed)) : fallback;
};

export async function listDishes({ q = "", restaurant = "", limit = 50, dietary = [], allergies = [], allergenFreeOnly = false, pincode = null } = {}) {
  const normalizedQuery = String(q).trim().toLowerCase();
  const normalizedRestaurant = String(restaurant).trim().toLowerCase();
  const normalizedPincode = /^[1-9]\d{5}$/.test(String(pincode || "")) ? String(pincode) : "";
  const normalizedDietary = [...new Set((Array.isArray(dietary) ? dietary : [dietary]).map((value) => String(value || "").trim().toLowerCase()).filter(Boolean))];
  const normalizedAllergies = [...new Set((Array.isArray(allergies) ? allergies : [allergies]).map((value) => String(value || "").trim().toLowerCase()).filter(Boolean))];
  const boundedLimit = safeLimit(limit, 50);
  const safetyFilter = { dietary: normalizedDietary, allergies: normalizedAllergies, allergenFreeOnly: Boolean(allergenFreeOnly) };
  const hasSafetyFilter = normalizedDietary.length > 0 || normalizedAllergies.length > 0 || Boolean(allergenFreeOnly);
  const cacheKey = `catalog:dishes:${JSON.stringify([normalizedQuery, normalizedRestaurant, boundedLimit, safetyFilter, normalizedPincode])}`;
  const cached = await getJson(cacheKey);
  if (Array.isArray(cached)) return cached;

  if (normalizedPincode) {
    const regional = collection("regionalCatalog");
    const snapshot = regional ? await regional.findOne({ pincode: normalizedPincode }) : null;
    if (snapshot && ["ready", "stale"].includes(snapshot.status)) {
      const source = Array.isArray(snapshot.dishes) ? snapshot.dishes : [];
      const filtered = source.filter((dish) => {
        if (restaurant && !String(dish.restaurant || "").toLowerCase().includes(normalizedRestaurant)) return false;
        if (q) {
          const haystack = [dish.name, dish.restaurant, dish.descriptor, ...(Array.isArray(dish.tags) ? dish.tags : [])].join(" ").toLowerCase();
          if (!haystack.includes(normalizedQuery)) return false;
        }
        return !hasSafetyFilter || matchesDietaryFilter(dish, safetyFilter);
      }).slice(0, boundedLimit);
      await setJson(cacheKey, filtered, 60_000);
      return filtered;
    }
    return [];
  }

  const dishes = collection("dishes");
  if (!dishes) return [];

  const filter = {};
  if (restaurant) filter.restaurant = { $regex: escapeRegex(restaurant), $options: "i" };
  if (q) filter.$text = { $search: q };
  const rawResult = await dishes.find(filter).limit(hasSafetyFilter ? Math.min(1000, Math.max(boundedLimit * 10, 250)) : boundedLimit).toArray();
  const result = hasSafetyFilter
    ? rawResult.filter((dish) => matchesDietaryFilter(dish, safetyFilter)).slice(0, boundedLimit)
    : rawResult;
  await setJson(cacheKey, result, 60_000);
  return result;
}

export async function getDish(id) {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) return null;
  const cacheKey = `catalog:dish:${normalizedId}`;
  const cached = await getJson(cacheKey);
  if (cached !== null) return cached;
  const dishes = collection("dishes");
  if (!dishes) return null;
  const result = await dishes.findOne({ id: normalizedId });
  if (result) await setJson(cacheKey, result, ENTITY_CACHE_TTL_MS);
  return result;
}

export async function listRestaurants({ q = "", limit = 30, pincode = null } = {}) {
  const normalizedQuery = String(q).trim().toLowerCase();
  const boundedLimit = safeLimit(limit, 30);
  const normalizedPincode = /^[1-9]\d{5}$/.test(String(pincode || "")) ? String(pincode) : "";
  const cacheKey = `catalog:restaurants:${JSON.stringify([normalizedQuery, boundedLimit, normalizedPincode])}`;
  const cached = await getJson(cacheKey);
  if (Array.isArray(cached)) return cached;

  if (normalizedPincode) {
    const regional = collection("regionalCatalog");
    const snapshot = regional ? await regional.findOne({ pincode: normalizedPincode }) : null;
    if (snapshot && ["ready", "stale"].includes(snapshot.status)) {
      const source = Array.isArray(snapshot.restaurants) ? snapshot.restaurants : [];
      const result = source.filter((restaurant) => !q || [restaurant.name, restaurant.cuisine, ...(Array.isArray(restaurant.tags) ? restaurant.tags : [])].join(" ").toLowerCase().includes(normalizedQuery)).slice(0, boundedLimit);
      await setJson(cacheKey, result, 60_000);
      return result;
    }
    return [];
  }

  const restaurants = collection("restaurants");
  if (!restaurants) return [];

  const filter = q ? { $text: { $search: q } } : {};
  const result = await restaurants.find(filter).limit(boundedLimit).toArray();
  await setJson(cacheKey, result, 60_000);
  return result;
}

export async function getRestaurant(id) {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) return null;
  const cacheKey = `catalog:restaurant:${normalizedId}`;
  const cached = await getJson(cacheKey);
  if (cached !== null) return cached;
  const restaurants = collection("restaurants");
  if (!restaurants) return null;
  const result = await restaurants.findOne({ id: normalizedId });
  if (result) await setJson(cacheKey, result, ENTITY_CACHE_TTL_MS);
  return result;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
