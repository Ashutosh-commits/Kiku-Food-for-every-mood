import { createHash } from "node:crypto";
import { addJob, QUEUE_NAMES } from "./queues.js";
import { config } from "../config.js";

function stableHash(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 40);
}

export async function queueComparisonRefresh(body, delayMs = config.comparisonRefreshLeadMs) {
  const key = JSON.stringify([body.location || "", body.pincode || "", String(body.restaurant || "").toLowerCase(), body.dish || ""]);
  const safeDelay = Math.max(5_000, delayMs);
  const runBucket = Math.floor((Date.now() + safeDelay) / safeDelay);
  return addJob(QUEUE_NAMES.comparison, "comparison-refresh", { key, body }, {
    jobId: `comparison-${stableHash(key)}-${runBucket}`,
    delay: safeDelay,
    priority: 2,
  });
}

export async function queueInsightsRefresh(userId, delayMs = 60_000) {
  const safeDelay = Math.max(5_000, delayMs);
  const runBucket = Math.floor((Date.now() + safeDelay) / safeDelay);
  return addJob(QUEUE_NAMES.personalization, "insights-refresh", { userId: String(userId) }, {
    jobId: `insights-${stableHash(userId)}-${runBucket}`,
    delay: safeDelay,
    priority: 5,
  });
}

export async function queueRecommendationRefresh(userId, delayMs = 90_000) {
  const safeDelay = Math.max(5_000, delayMs);
  const runBucket = Math.floor((Date.now() + safeDelay) / safeDelay);
  return addJob(QUEUE_NAMES.personalization, "recommendation-refresh", { userId: String(userId) }, {
    jobId: `recommendations-${stableHash(userId)}-${runBucket}`,
    delay: safeDelay,
    priority: 5,
  });
}

export async function queueRecipeWarm(query) {
  const normalized = String(query || "").trim().slice(0, 120);
  if (!normalized) return null;
  return addJob(QUEUE_NAMES.recipes, "recipe-warm", { query: normalized }, {
    jobId: `recipe-warm-${stableHash(normalized.toLowerCase())}`,
    priority: 8,
  });
}

export async function queueProviderHealthCheck() {
  return addJob(QUEUE_NAMES.health, "provider-health", {}, { jobId: `provider-health-${Date.now()}` });
}

export async function queueMaintenance() {
  return addJob(QUEUE_NAMES.maintenance, "maintenance", {}, { jobId: `maintenance-${Date.now()}` });
}
