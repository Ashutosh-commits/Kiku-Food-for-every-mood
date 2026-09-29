import { config } from "../config.js";
import { fetchJsonLimited } from "../lib/http.js";
import { filterComparisonOffers, normalizeDietaryEvidence } from "../../shared/dietary.js";

let consecutiveFailures = 0;
let circuitOpenedAt = 0;
const CIRCUIT_FAILURE_LIMIT = 3;
const CIRCUIT_RESET_MS = 30_000;


function safeProviderUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase();
    const approved = url.protocol === "https:" && (host === "swiggy.com" || host.endsWith(".swiggy.com") || host === "zomato.com" || host.endsWith(".zomato.com"));
    return approved ? url.toString() : null;
  } catch { return null; }
}

function circuitOpen() {
  if (!circuitOpenedAt) return false;
  if (Date.now() - circuitOpenedAt > CIRCUIT_RESET_MS) {
    circuitOpenedAt = 0;
    consecutiveFailures = 0;
    return false;
  }
  return true;
}

export function getComparisonProviderHealth() {
  return { state: circuitOpen() ? "open" : "closed", consecutiveFailures };
}

async function requestOnce(payload) {
  const base = config.compareServiceUrl.replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.compareTimeoutMs);
  try {
    const { response, data } = await fetchJsonLimited(`${base}/api/v1/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(config.compareServiceApiKey ? { "X-Scraper-Api-Key": config.compareServiceApiKey } : {}) },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }, 2 * 1024 * 1024);
    if (!response.ok) {
      const error = new Error(`Comparison service returned ${response.status}.`);
      error.code = response.status >= 500 ? "COMPARE_UPSTREAM" : "COMPARE_REQUEST_REJECTED";
      error.status = response.status >= 500 ? 502 : response.status;
      error.retryable = response.status >= 500;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function compareViaScraper(payload) {
  if (circuitOpen()) {
    const error = new Error("The comparison service is temporarily unavailable.");
    error.code = "COMPARE_CIRCUIT_OPEN";
    error.status = 503;
    throw error;
  }

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await requestOnce(payload);
      consecutiveFailures = 0;
      circuitOpenedAt = 0;
      return result;
    } catch (error) {
      lastError = error;
      if (error?.code === "COMPARE_REQUEST_REJECTED") throw error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  consecutiveFailures += 1;
  if (consecutiveFailures >= CIRCUIT_FAILURE_LIMIT) circuitOpenedAt = Date.now();
  throw lastError;
}

// Upstream scraper safety contract: dietary/allergen filters are fail-closed. The scraper must
// return explicit dietaryTags/tags (exact veg/vegan labels), isVegetarian/isVegan flags, and/or
// allergens plus allergenVerified/allergenFree. Kiku never infers safety from dish names/descriptions.

export function filterComparison(data, filters = {}) {
  const offers = filterComparisonOffers(data?.offers, filters);
  const priced = offers.filter((offer) => offer.price != null);
  return {
    ...data,
    offers,
    cheapestPlatform: priced.length
      ? priced.reduce((best, offer) => (offer.price < best.price ? offer : best)).platform
      : null,
    warnings: [...new Set([...(data?.warnings || []), ...(filters.dietary?.length || filters.allergies?.length || filters.allergenFreeOnly) && offers.length === 0 ? ["No provider listing met Kiku's verified dietary/allergen requirements. Kiku does not infer safety from dish names or descriptions."] : []])],
  };
}

export function normalizeComparison(data) {
  const rawOffers = Array.isArray(data?.offers) ? data.offers : [];
  const offers = rawOffers
    .filter((offer) => offer?.platform === "swiggy" || offer?.platform === "zomato")
    .map((offer) => {
      const rawPrice = offer.price;
      const priceText = typeof rawPrice === "string" ? rawPrice.trim() : rawPrice;
      const parsedPrice = priceText === "" || priceText == null ? null : Number(priceText);
      const price = Number.isFinite(parsedPrice) && parsedPrice >= 0 ? parsedPrice : null;
      return {
        platform: offer.platform,
        restaurantName: offer.restaurant_name || null,
        restaurantUrl: safeProviderUrl(offer.restaurant_url),
        dishName: offer.dish_name || null,
        price,
        listed: price != null || Boolean(offer.dish_name),
        matchConfidence: Number.isFinite(Number(offer.match_confidence)) ? Math.max(0, Math.min(1, Number(offer.match_confidence))) : 0,
        checkedAt: offer.checked_at || data?.checked_at || new Date().toISOString(),
        ...normalizeDietaryEvidence(offer),
      };
    });

  const priced = offers.filter((offer) => offer.price != null);
  const cheapestPlatform = priced.length
    ? priced.reduce((best, offer) => (offer.price < best.price ? offer : best)).platform
    : null;

  return {
    restaurantQuery: data?.restaurant_query || null,
    canonicalRestaurant: data?.canonical_restaurant || null,
    restaurantMatchConfidence: Number(data?.restaurant_match_confidence || 0),
    dishQuery: data?.dish_query || null,
    offers,
    cheapestPlatform,
    warnings: Array.isArray(data?.warnings) ? data.warnings : [],
    checkedAt: data?.checked_at || new Date().toISOString(),
  };
}
