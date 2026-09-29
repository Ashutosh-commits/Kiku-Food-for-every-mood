import { Worker } from "bullmq";
import { connectDb, closeDb, collection, memoryStore } from "../db.js";
import { connectRedis, closeRedis, setJson, deleteKey } from "../redis.js";
import { config } from "../config.js";
import { buildInsights, listActivity } from "../services/activity.js";
import { buildRecommendations } from "../services/recommendations.js";
import { getPreferences } from "../services/preferences.js";
import { listSaved } from "../services/saved.js";
import { getRecipes } from "../services/recipes.js";
import { compareViaScraper, normalizeComparison } from "../providers/compare.js";
import { getComparisonCache, setComparisonCache } from "../services/comparison-cache.js";
import { acquireLock, releaseLock, getJson } from "../redis.js";
import { bullConnectionOptions } from "./connection.js";
import { QUEUE_NAMES, getQueue, closeQueues } from "./queues.js";
import { queueComparisonRefresh } from "./jobs.js";
import { fetchJsonLimited } from "../lib/http.js";
import { ensureSchedulers } from "./schedulers.js";

const connection = bullConnectionOptions();
const heartbeatKey = `${config.redisPrefix}:automation:heartbeat`;
const workers = [];

async function activeUserIds(days = config.automationActiveUserDays) {
  const events = collection("activityEvents");
  const since = new Date(Date.now() - days * 86400000);
  if (events) return events.distinct("userId", { createdAt: { $gte: since } });
  const ids = new Set(memoryStore("activityEvents").filter((item) => new Date(item.createdAt).getTime() >= since.getTime()).map((item) => String(item.userId)));
  return [...ids];
}

function recommendationContext(preferences, savedItems, recentInteractions) {
  return {
    ...preferences,
    savedItems,
    recentInteractions,
  };
}

async function refreshInsights(userId) {
  const result = await buildInsights(userId);
  await setJson(`insights:${String(userId)}`, result, 30 * 60 * 1000);
  return result;
}

async function refreshRecommendations(userId) {
  const [preferences, savedItems, recentInteractions] = await Promise.all([
    getPreferences(userId),
    listSaved(userId),
    listActivity(userId, 50),
  ]);
  const recommendations = await buildRecommendations(recommendationContext(preferences, savedItems, recentInteractions));
  await setJson(`recommendations:baseline:${String(userId)}`, recommendations, config.recommendationCacheTtlMs);
  return recommendations;
}

async function warmRecipes(queries) {
  const normalized = [...new Set((queries || []).map((value) => String(value).trim()).filter(Boolean))].slice(0, 12);
  let warmed = 0;
  for (const query of normalized) {
    await getRecipes(query);
    warmed += 1;
  }
  return { warmed };
}

async function refreshComparison(body) {
  const key = JSON.stringify([body.location || "", body.pincode || "", String(body.restaurant || "").toLowerCase(), body.dish || ""]);
  const fresh = await getComparisonCache(key);
  if (fresh) return { skipped: true, reason: "cache-still-fresh" };
  const requests = collection("comparisonRequests");
  const current = requests ? await requests.findOne({ key }, { projection: { lastSeenAt: 1 } }) : null;
  if (!current) return { skipped: true, reason: "no-observed-demand" };
  if (new Date(current.lastSeenAt).getTime() < Date.now() - config.comparisonDemandWindowMs) return { skipped: true, reason: "demand-window-expired" };
  const lockToken = await acquireLock(`compare:${key}`, Math.max(30_000, config.compareTimeoutMs + 10_000));
  if (!lockToken) return { skipped: true, reason: "locked" };
  try {
    const result = normalizeComparison(await compareViaScraper(body));
    await setComparisonCache(key, result, config.comparisonCacheTtlMs, config.comparisonCacheRetentionTtlMs);
    return result;
  } finally {
    await releaseLock(`compare:${key}`, lockToken);
  }
}

async function cleanup() {
  const cutoff = new Date(Date.now() - config.comparisonRequestRetentionDays * 86400000);
  const requests = collection("comparisonRequests");
  if (requests) await requests.deleteMany({ lastSeenAt: { $lt: cutoff } });
  await setJson(heartbeatKey, { status: "ready", workerPid: process.pid, updatedAt: new Date().toISOString() }, config.automationHeartbeatTtlMs);
  return { cleaned: true };
}

async function providerHealth() {
  const url = `${config.compareServiceUrl.replace(/\/$/, "")}/healthz`;
  const { response, data: payload } = await fetchJsonLimited(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(Math.min(5000, config.compareTimeoutMs)) }, 64 * 1024);
  const healthy = response.ok;
  const result = { healthy, status: response.status, payload, checkedAt: new Date().toISOString() };
  await setJson("provider-health:comparison", result, config.providerHealthTtlMs);
  if (!healthy) {
    const error = new Error(`Comparison service health check returned ${response.status}.`);
    error.code = "PROVIDER_HEALTH_FAILED";
    throw error;
  }
  return result;
}

async function recordHeartbeat(extra = {}) {
  await setJson(heartbeatKey, { status: "ready", workerPid: process.pid, updatedAt: new Date().toISOString(), ...extra }, config.automationHeartbeatTtlMs);
}

async function processJob(job) {
  switch (job.name) {
    case "comparison-refresh": {
      return refreshComparison(job.data.body);
    }
    case "insights-refresh":
      return refreshInsights(job.data.userId);
    case "recommendation-refresh":
      return refreshRecommendations(job.data.userId);
    case "insights-rollup": {
      const ids = await activeUserIds(job.data.days || config.automationActiveUserDays);
      for (const userId of ids.slice(0, config.automationUserBatchSize)) await refreshInsights(userId);
      return { processed: Math.min(ids.length, config.automationUserBatchSize) };
    }
    case "recommendation-rollup": {
      const ids = await activeUserIds(job.data.days || config.automationActiveUserDays);
      for (const userId of ids.slice(0, config.automationUserBatchSize)) await refreshRecommendations(userId);
      return { processed: Math.min(ids.length, config.automationUserBatchSize) };
    }
    case "recipe-warm":
      return getRecipes(job.data.query);
    case "recipe-sync":
      return warmRecipes(job.data.queries || config.recipeSyncQueries);
    case "provider-health":
      return providerHealth();
    case "maintenance":
      return cleanup();
    default:
      throw new Error(`Unknown automation job: ${job.name}`);
  }
}

async function startWorkers() {
  if (!config.automationEnabled) {
    console.log(JSON.stringify({ level: "info", subsystem: "automation", message: "Automation is disabled; no worker started." }));
    return false;
  }
  if (!config.redisUrl) throw new Error("REDIS_URL is required when automation is enabled.");
  await connectDb();
  await connectRedis();
  await ensureSchedulers();

  const definitions = [
    [QUEUE_NAMES.comparison, 2],
    [QUEUE_NAMES.recipes, 3],
    [QUEUE_NAMES.personalization, 6],
    [QUEUE_NAMES.maintenance, 1],
    [QUEUE_NAMES.health, 1],
  ];

  for (const [queueName, concurrency] of definitions) {
    const worker = new Worker(queueName, async (job) => {
      await recordHeartbeat({ queue: queueName, job: job.name });
      const started = Date.now();
      try {
        const result = await processJob(job);
        await recordHeartbeat({ queue: queueName, job: job.name, lastSuccessAt: new Date().toISOString() });
        console.log(JSON.stringify({ level: "info", subsystem: "automation", queue: queueName, job: job.name, jobId: job.id, durationMs: Date.now() - started }));
        return result;
      } catch (error) {
        console.error(JSON.stringify({ level: "error", subsystem: "automation", queue: queueName, job: job.name, jobId: job.id, durationMs: Date.now() - started, message: error?.message || String(error) }));
        throw error;
      }
    }, {
      connection,
      prefix: `${config.redisPrefix}:bull`,
      concurrency,
      lockDuration: Math.max(30_000, config.automationLockDurationMs),
    });
    worker.on("failed", (job, error) => {
      console.error(JSON.stringify({ level: "error", subsystem: "automation.failed", queue: queueName, job: job?.name, jobId: job?.id, message: error?.message || String(error) }));
    });
    workers.push(worker);
  }

  await recordHeartbeat({ status: "ready", workerPid: process.pid });
  console.log(JSON.stringify({ level: "info", subsystem: "automation", message: "Kiku automation workers started." }));
  return true;
}

async function shutdown(signal) {
  console.log(JSON.stringify({ level: "info", subsystem: "automation", message: `Received ${signal}; shutting down.` }));
  await Promise.all(workers.map((worker) => worker.close().catch(() => undefined)));
  await closeQueues();
  await deleteKey(heartbeatKey);
  await closeRedis();
  await closeDb();
  process.exit(0);
}

if (process.argv.includes("--once")) {
  try {
    const started = await startWorkers();
    if (!started) process.exit(0);
    await Promise.all([
      providerHealth().catch(() => undefined),
      cleanup(),
    ]);
    await shutdown("ONCE");
  } catch (error) {
    console.error(JSON.stringify({ level: "error", subsystem: "automation", message: error?.message || String(error) }));
    process.exit(1);
  }
} else {
  startWorkers().catch((error) => {
    console.error(JSON.stringify({ level: "error", subsystem: "automation", message: error?.message || String(error) }));
    process.exit(1);
  });
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
