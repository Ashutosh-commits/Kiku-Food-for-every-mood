import { cloudflareAiConfigured, cloudflareChat } from "./cloudflare-ai.js";

const cache = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function clean(value, limit) {
  return String(value || "").trim().slice(0, limit);
}

function fallbackDescription(input) {
  const category = clean(input.category || input.cuisine, 80);
  const restaurant = clean(input.restaurant, 120);
  const location = clean(input.city, 80);
  const lead = category ? `A ${category.toLowerCase()} pick` : "A tempting food pick";
  const source = [restaurant, location].filter(Boolean).join(" · ");
  return `${lead}${source ? ` from ${source}` : ""}. Check the live listing for the latest availability and ordering options.`;
}

function cacheKey(input) {
  return JSON.stringify([clean(input.name, 160).toLowerCase(), clean(input.restaurant, 160).toLowerCase(), clean(input.provider, 40).toLowerCase(), clean(input.city, 120).toLowerCase()]);
}

export async function describeDish(input = {}) {
  const normalized = {
    name: clean(input.name, 160),
    restaurant: clean(input.restaurant, 160),
    category: clean(input.category, 100),
    cuisine: clean(input.cuisine, 120),
    provider: clean(input.provider, 40),
    sourceDescription: clean(input.sourceDescription, 1500),
    city: clean(input.city, 120),
    pincode: clean(input.pincode, 6),
  };
  const key = cacheKey(normalized);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (!cloudflareAiConfigured()) {
    const value = { description: fallbackDescription(normalized), generated: false, provider: "deterministic" };
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  }

  const response = await cloudflareChat({
    messages: [
      {
        role: "system",
        content: "You are Kiku's food description writer. Write exactly 2 concise, appetizing sentences for an Indian food discovery app. Use only the supplied facts. Do not invent ingredients, health claims, prices, discounts, ratings, availability, or preparation methods. Mention regional context only when it is supplied. Keep the tone warm and useful, not exaggerated.",
      },
      {
        role: "user",
        content: JSON.stringify(normalized),
      },
    ],
    maxCompletionTokens: 180,
    temperature: 0.35,
  });

  const text = String(response?.choices?.[0]?.message?.content || "").replace(/^['"]|['"]$/g, "").trim().slice(0, 500);
  const value = {
    description: text || fallbackDescription(normalized),
    generated: Boolean(text),
    provider: text ? "cloudflare" : "deterministic",
  };
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  while (cache.size > 500) cache.delete(cache.keys().next().value);
  return value;
}
