import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Local/non-Docker dev (`npm run server`, `npm run worker`) has no process manager to inject
// environment variables, so without this the root `.env` file is silently ignored and every
// service (Mongo, Redis, and crucially the Mise scraper) falls back to config.js defaults.
// This loads `.env` into process.env, without overriding anything already set by the real
// shell/Docker/host environment, so Docker Compose's explicit `environment:` blocks still win.
function loadDotEnv() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.join(__dirname, "..", ".env");
  if (!existsSync(envPath)) return;
  let raw;
  try {
    raw = readFileSync(envPath, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || key in process.env) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnv();

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || "0.0.0.0",
  mongoUri: process.env.MONGODB_URI || "",
  mongoDbName: process.env.MONGODB_DB_NAME || "kiku",
  compareServiceUrl: process.env.COMPARE_SERVICE_URL || "http://127.0.0.1:8001",
  compareServiceApiKey: process.env.COMPARE_SERVICE_API_KEY || "",
  compareTimeoutMs: Number(process.env.COMPARE_TIMEOUT_MS || 20000),
  recipeProviderUrl: process.env.RECIPE_PROVIDER_URL || "https://www.themealdb.com/api/json/v1/1",
  sessionSecret: process.env.SESSION_SECRET || "",
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS || 30),
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  aiProvider: String(process.env.AI_PROVIDER || "cloudflare").trim().toLowerCase(),
  cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID || "",
  cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN || "",
  cloudflareAiModel: process.env.CLOUDFLARE_AI_MODEL || "@cf/zai-org/glm-4.7-flash",
  cloudflareAiTimeoutMs: Number(process.env.CLOUDFLARE_AI_TIMEOUT_MS || 20000),
  cloudflareAiMaxTokens: Number(process.env.CLOUDFLARE_AI_MAX_TOKENS || 700),
  recipeEnrichmentEnabled: String(process.env.RECIPE_ENRICHMENT_ENABLED || "true").toLowerCase() === "true",
  emailWebhookUrl: process.env.EMAIL_WEBHOOK_URL || "",
  publicAppUrl: process.env.PUBLIC_APP_URL || "http://localhost:5173",
  requireEmailVerification: String(process.env.REQUIRE_EMAIL_VERIFICATION || "false").toLowerCase() === "true",
  allowInMemory: String(process.env.ALLOW_IN_MEMORY || "false").toLowerCase() === "true",
  redisUrl: process.env.REDIS_URL || "",
  redisPrefix: process.env.REDIS_PREFIX || "kiku",
  redisConnectTimeoutMs: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 5000),
  requireRedis: String(process.env.REQUIRE_REDIS || (process.env.NODE_ENV === "production" ? "true" : "false")).toLowerCase() === "true",
  automationEnabled: String(process.env.AUTOMATION_ENABLED || (process.env.NODE_ENV === "production" ? "true" : "false")).toLowerCase() === "true",
  requireAutomation: String(process.env.REQUIRE_AUTOMATION || (process.env.NODE_ENV === "production" ? "true" : "false")).toLowerCase() === "true",
  automationHeartbeatTtlMs: Number(process.env.AUTOMATION_HEARTBEAT_TTL_MS || 90000),
  automationLockDurationMs: Number(process.env.AUTOMATION_LOCK_DURATION_MS || 60000),
  automationActiveUserDays: Number(process.env.AUTOMATION_ACTIVE_USER_DAYS || 30),
  automationUserBatchSize: Number(process.env.AUTOMATION_USER_BATCH_SIZE || 500),
  comparisonCacheTtlMs: Number(process.env.COMPARISON_CACHE_TTL_MS || 24 * 60 * 60 * 1000),
  comparisonCacheRetentionTtlMs: Number(process.env.COMPARISON_CACHE_RETENTION_TTL_MS || 7 * 24 * 60 * 60 * 1000),
  comparisonRefreshLeadMs: Number(process.env.COMPARISON_REFRESH_LEAD_MS || 10000),
  comparisonDemandWindowMs: Number(process.env.COMPARISON_DEMAND_WINDOW_MS || 30 * 60 * 1000),
  comparisonRequestRetentionDays: Number(process.env.COMPARISON_REQUEST_RETENTION_DAYS || 7),
  regionFreshTtlMs: Number(process.env.REGION_FRESH_TTL_MS || 24 * 60 * 60 * 1000),
  regionRetentionTtlMs: Number(process.env.REGION_RETENTION_TTL_MS || 7 * 24 * 60 * 60 * 1000),
  regionErrorTtlMs: Number(process.env.REGION_ERROR_TTL_MS || 60 * 1000),
  regionEmptyTtlMs: Number(process.env.REGION_EMPTY_TTL_MS || 30 * 1000),
  regionScrapeTimeoutMs: Number(process.env.REGION_SCRAPE_TIMEOUT_MS || 45 * 1000),
  regionResponseMaxBytes: Number(process.env.REGION_RESPONSE_MAX_BYTES || 8 * 1024 * 1024),
  regionScrapeConcurrency: Number(process.env.REGION_SCRAPE_CONCURRENCY || 10),
  regionScrapeQueueMax: Number(process.env.REGION_SCRAPE_QUEUE_MAX || 50),
  providerHealthEveryMs: Number(process.env.PROVIDER_HEALTH_EVERY_MS || 3 * 60 * 60 * 1000),
  providerHealthTtlMs: Number(process.env.PROVIDER_HEALTH_TTL_MS || 4 * 60 * 60 * 1000),
  recipeSyncEveryMs: Number(process.env.RECIPE_SYNC_EVERY_MS || 12 * 60 * 60 * 1000),
  recipeSyncQueries: (process.env.RECIPE_SYNC_QUERIES || "").split(",").map((value) => value.trim()).filter(Boolean),
  insightsRollupEveryMs: Number(process.env.INSIGHTS_ROLLUP_EVERY_MS || 15 * 60 * 1000),
  recommendationRollupEveryMs: Number(process.env.RECOMMENDATION_ROLLUP_EVERY_MS || 30 * 60 * 1000),
  recommendationCacheTtlMs: Number(process.env.RECOMMENDATION_CACHE_TTL_MS || 15 * 60 * 1000),
  maintenanceEveryMs: Number(process.env.MAINTENANCE_EVERY_MS || 60 * 60 * 1000),
  trustedOrigins: (process.env.TRUSTED_ORIGINS || "http://localhost:5173,http://localhost:4000")
    .split(",").map((value) => value.trim()).filter(Boolean),
};

export function assertProductionConfig() {
  if (config.nodeEnv !== "production") return;
  const missing = [];
  if (!config.mongoUri) missing.push("MONGODB_URI");
  if (!config.sessionSecret || config.sessionSecret.length < 32) missing.push("SESSION_SECRET (32+ chars)");
  if (!config.trustedOrigins.length) missing.push("TRUSTED_ORIGINS");
  if (!config.compareServiceUrl) missing.push("COMPARE_SERVICE_URL");
  if (!config.compareServiceApiKey || config.compareServiceApiKey.length < 24) missing.push("COMPARE_SERVICE_API_KEY (24+ chars)");
  if (config.requireRedis && !config.redisUrl) missing.push("REDIS_URL");
  if (config.requireAutomation && !config.automationEnabled) missing.push("AUTOMATION_ENABLED=true");
  if (config.requireAutomation && !config.redisUrl) missing.push("REDIS_URL (automation workers)");
  if (!Number.isInteger(config.regionScrapeConcurrency) || config.regionScrapeConcurrency < 1 || config.regionScrapeConcurrency > 25) missing.push("REGION_SCRAPE_CONCURRENCY must be 1-25");
  if (!Number.isFinite(config.regionScrapeTimeoutMs) || config.regionScrapeTimeoutMs < 5000 || config.regionScrapeTimeoutMs > 120000) missing.push("REGION_SCRAPE_TIMEOUT_MS must be 5000-120000");
  if (!Number.isInteger(config.regionScrapeQueueMax) || config.regionScrapeQueueMax < 1 || config.regionScrapeQueueMax > 500) missing.push("REGION_SCRAPE_QUEUE_MAX must be 1-500");
  if (!config.publicAppUrl || !/^https:\/\//i.test(config.publicAppUrl)) missing.push("PUBLIC_APP_URL (https://...)" );
  for (const origin of config.trustedOrigins) {
    try {
      const parsed = new URL(origin);
      if (!parsed.protocol || parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error("invalid origin");
      if (parsed.protocol !== "https:") throw new Error("production origins must use https");
    } catch {
      missing.push(`TRUSTED_ORIGINS entry invalid: ${origin}`);
    }
  }
  if (config.aiProvider === "cloudflare" && Boolean(config.cloudflareAccountId) !== Boolean(config.cloudflareApiToken)) {
    missing.push("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be provided together");
  }
  if (config.aiProvider && !["cloudflare", "none"].includes(config.aiProvider)) missing.push("AI_PROVIDER must be cloudflare or none");

  const secureUrlChecks = [
    ["RECIPE_PROVIDER_URL", config.recipeProviderUrl],
    ["COMPARE_SERVICE_URL", config.compareServiceUrl],
  ];
  for (const [name, value] of secureUrlChecks) {
    try { if (new URL(value).protocol !== "https:") missing.push(`${name} must use https in production`); }
    catch { missing.push(`${name} must be a valid URL`); }
  }
  if (config.emailWebhookUrl) {
    try { if (new URL(config.emailWebhookUrl).protocol !== "https:") missing.push("EMAIL_WEBHOOK_URL must use https in production"); }
    catch { missing.push("EMAIL_WEBHOOK_URL must be a valid URL"); }
  }
  if (config.requireRedis) {
    if (!config.redisUrl) missing.push("REDIS_URL");
    else if (!/^rediss:\/\//i.test(config.redisUrl)) missing.push("REDIS_URL must use rediss:// in production");
  }
  if (missing.length) throw new Error(`Production configuration is incomplete: ${missing.join(", ")}`);
}
