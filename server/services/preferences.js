import { collection, memoryStore } from "../db.js";
import { queueRecommendationRefresh } from "../automation/jobs.js";

const defaults = { dietary: [], allergies: [], cuisines: [], spiceLevel: null, budgetMin: null, budgetMax: null, pincode: null };

function normalizePreferences(value = {}) {
  return {
    ...defaults,
    dietary: Array.isArray(value.dietary) ? value.dietary : [],
    allergies: Array.isArray(value.allergies) ? value.allergies : [],
    cuisines: Array.isArray(value.cuisines) ? value.cuisines : [],
    spiceLevel: value.spiceLevel ?? null,
    budgetMin: value.budgetMin ?? null,
    budgetMax: value.budgetMax ?? null,
    pincode: value.pincode ?? null,
  };
}

export async function getPreferences(userId) {
  const preferences = collection("preferences");
  if (!preferences) return normalizePreferences(memoryStore("preferences").get(String(userId)) || {});
  const found = await preferences.findOne({ userId: String(userId) });
  return normalizePreferences(found || {});
}

export async function updatePreferences(userId, patch) {
  const current = await getPreferences(userId);
  const next = normalizePreferences({ ...current, ...patch });
  next.userId = String(userId);
  next.updatedAt = new Date();
  const preferences = collection("preferences");
  const normalizedUserId = String(userId);
  if (!preferences) memoryStore("preferences").set(normalizedUserId, next);
  else await preferences.updateOne({ userId: normalizedUserId }, { $set: next, $unset: { timeAvailable: "", legacyRecommendationSignals: "", legacyPrepTime: "" } }, { upsert: true });
  await queueRecommendationRefresh(normalizedUserId).catch(() => undefined);
  return next;
}
