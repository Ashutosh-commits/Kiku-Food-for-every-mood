import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { config, assertProductionConfig } from "./config.js";
import { connectDb, closeDb, isMongo, pingDb, collection, memoryStore } from "./db.js";
import { authMiddleware, cleanUser, clearSession, createUser, issueVerificationEmail, loginWithGoogle, loginWithPassword, requireAuth, resetPassword, updateUser, verifyEmail, requestPasswordReset } from "./auth.js";
import { listDishes, getDish, listRestaurants, getRestaurant } from "./catalog.js";
import { regionSchema, compareSchema, parseBody, registerSchema, loginSchema, googleSchema, profileSchema, preferencesSchema, savedSchema, activitySchema, recommendationSchema, assistantSchema, recipeSubstitutionSchema, recipeResearchSchema, dishDescriptionSchema, emailTokenSchema, forgotPasswordSchema, resetPasswordSchema } from "./services/validation.js";
import { getPreferences, updatePreferences } from "./services/preferences.js";
import { listSaved, toggleSaved, removeSaved } from "./services/saved.js";
import { buildRecommendations } from "./services/recommendations.js";
import { recordActivity, listActivity, buildInsights } from "./services/activity.js";
import { getRecipes, getRecipeById } from "./services/recipes.js";
import { getComparisonCache, getStaleComparisonCache, setComparisonCache } from "./services/comparison-cache.js";
import { compareViaScraper, normalizeComparison, filterComparison, getComparisonProviderHealth } from "./providers/compare.js";
import { sendAssistantMessage, listConversations, getConversationMessages } from "./services/assistant.js";
import { cloudflareAiConfigured } from "./services/cloudflare-ai.js";
import { describeDish } from "./services/dish-description.js";
import { createRecipeVariant } from "./services/recipe-substitutions.js";
import { connectRedis, closeRedis, isRedisReady, pingRedis, redisClient, redisHealth, acquireLock, releaseLock, waitForCache, deleteKey, getJson } from "./redis.js";
import { queueComparisonRefresh } from "./automation/jobs.js";
import { closeQueues } from "./automation/queues.js";
import { getRegionStatus, requestRegionRefresh, getRegionSnapshot, getRegionConcurrency } from "./services/region-discovery.js";

assertProductionConfig();
await connectDb();
await connectRedis();

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, "..", "dist");
const boundedInt = (value, fallback, min, max) => { const parsed = Number(value); return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback; };

if (config.nodeEnv === "production") app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  crossOriginResourcePolicy: { policy: "same-site" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      scriptSrc: ["'self'", "https://accounts.google.com", "https://cdn.jsdelivr.net"],
      connectSrc: ["'self'", "https://accounts.google.com", "https://cdn.jsdelivr.net", "https://storage.googleapis.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      mediaSrc: ["'self'", "blob:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      workerSrc: ["'self'", "blob:"],
      frameSrc: ["'self'", "https://accounts.google.com", "https://*.google.com"],
    },
  },
}));
app.use((_req, res, next) => {
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  next();
});
app.use(express.json({ limit: "128kb", strict: true }));

const sharedRedisClient = redisClient();
const createLimiterStore = (name) => sharedRedisClient?.isReady ? new RedisStore({
  sendCommand: (...args) => sharedRedisClient.sendCommand(args),
  prefix: `kiku:ratelimit:${name}:`,
}) : undefined;
const limiterDefaults = { standardHeaders: "draft-8", legacyHeaders: false, passOnStoreError: false };
const apiStore = createLimiterStore("api");
const authStore = createLimiterStore("auth");
const compareStore = createLimiterStore("compare");
const regionRefreshStore = createLimiterStore("region-refresh");
const regionStatusStore = createLimiterStore("region-status");
const assistantStore = createLimiterStore("assistant");
const recipeStore = createLimiterStore("recipe");
const apiLimiter = rateLimit({ ...limiterDefaults, ...(apiStore ? { store: apiStore } : {}), windowMs: 15 * 60 * 1000, limit: 180, handler: (_req, res) => res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many requests. Please try again shortly." } }) });
const authLimiter = rateLimit({ ...limiterDefaults, ...(authStore ? { store: authStore } : {}), windowMs: 15 * 60 * 1000, limit: 15, handler: (_req, res) => res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many authentication attempts. Please try again later." } }) });
const compareLimiter = rateLimit({ ...limiterDefaults, ...(compareStore ? { store: compareStore } : {}), windowMs: 60 * 1000, limit: 12 });
const regionRefreshLimiter = rateLimit({ ...limiterDefaults, ...(regionRefreshStore ? { store: regionRefreshStore } : {}), windowMs: 60 * 1000, limit: 10, handler: (_req, res) => res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many regional refresh requests. Please wait before trying again." } }) });
const regionStatusLimiter = rateLimit({ ...limiterDefaults, ...(regionStatusStore ? { store: regionStatusStore } : {}), windowMs: 60 * 1000, limit: 120, handler: (_req, res) => res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many regional status requests. Please slow down." } }) });
const assistantLimiter = rateLimit({ ...limiterDefaults, ...(assistantStore ? { store: assistantStore } : {}), windowMs: 60 * 1000, limit: 30 });
const recipeLimiter = rateLimit({ ...limiterDefaults, ...(recipeStore ? { store: recipeStore } : {}), windowMs: 60 * 1000, limit: 20 });
app.use("/api", apiLimiter);
app.use("/api", (req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });

app.use((req, res, next) => {
  const suppliedRequestId = req.headers["x-request-id"];
  req.requestId = typeof suppliedRequestId === "string" && /^[A-Za-z0-9._:-]{1,80}$/.test(suppliedRequestId) ? suppliedRequestId : randomUUID();
  res.setHeader("X-Request-ID", req.requestId);
  const origin = req.headers.origin;
  if (origin && !config.trustedOrigins.includes(origin)) {
    return res.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "Origin not allowed." } });
  }
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID");
    res.setHeader("Vary", "Origin");
  }
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && req.headers.origin && !config.trustedOrigins.includes(req.headers.origin)) {
    return res.status(403).json({ error: { code: "CSRF_ORIGIN_REJECTED", message: "Request origin not allowed." } });
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  const started = Date.now();
  res.on("finish", () => console.log(JSON.stringify({ level: "info", requestId: req.requestId, method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - started })));
  next();
});

app.use((req, res, next) => {
  if (!req.path.startsWith("/api/")) return next();
  authMiddleware(req, res, next);
});

app.get("/health/live", (_req, res) => res.json({ status: "ok" }));
app.get("/health/ready", async (_req, res) => {
  let databaseReady = false;
  try { databaseReady = isMongo() ? await pingDb() : (config.allowInMemory && config.nodeEnv !== "production"); } catch { databaseReady = false; }
  const comparison = getComparisonProviderHealth();
  const redisReady = config.requireRedis ? (isRedisReady() && await pingRedis().catch(() => false)) : true;
  const heartbeat = config.requireAutomation ? await getJson("automation:heartbeat") : null;
  const automationReady = !config.requireAutomation || Boolean(heartbeat && new Date(heartbeat.updatedAt || 0).getTime() > Date.now() - config.automationHeartbeatTtlMs);
  const ready = databaseReady && Boolean(config.compareServiceUrl) && redisReady && automationReady;
  const status = ready ? (comparison.state === "open" ? "degraded" : "ready") : "degraded";
  res.status(ready ? 200 : 503).json({ status, database: databaseReady ? "ok" : "unavailable", redis: redisReady ? "ok" : redisHealth(), automation: automationReady ? "ok" : "unavailable", comparison: comparison.state, regionalScraping: getRegionConcurrency(), recipeProvider: Boolean(config.recipeProviderUrl), assistant: cloudflareAiConfigured() ? "cloudflare" : "deterministic" });
});
app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

// Auth
app.post("/api/auth/register", authLimiter, async (req, res, next) => {
  try {
    const body = parseBody(registerSchema, req.body);
    const user = await createUser(body);
    if (config.requireEmailVerification || config.emailWebhookUrl) await issueVerificationEmail(user.id, user.email);
    if (!config.requireEmailVerification) await (await import("./auth.js")).createSession(user.id, res);
    res.status(201).json({ user, verificationRequired: config.requireEmailVerification });
  } catch (error) { next(error); }
});
app.post("/api/auth/login", authLimiter, async (req, res, next) => {
  try { const body = parseBody(loginSchema, req.body); const user = await loginWithPassword(body.email, body.password, res); res.json({ user }); } catch (error) { next(error); }
});
app.post("/api/auth/google", authLimiter, async (req, res, next) => {
  try { const body = parseBody(googleSchema, req.body); const user = await loginWithGoogle(body.credential, res); res.json({ user }); } catch (error) { next(error); }
});
app.post("/api/auth/logout", async (req, res, next) => { try { await clearSession(req, res); res.json({ ok: true }); } catch (error) { next(error); } });
app.get("/api/auth/me", (req, res) => res.json({ user: req.user ? cleanUser(req.user) : null }));
app.post("/api/auth/verify-email", async (req, res, next) => { try { const body = parseBody(emailTokenSchema, req.body); const user = await verifyEmail(body.token); res.json({ user }); } catch (error) { next(error); } });
app.post("/api/auth/forgot-password", authLimiter, async (req, res, next) => {
  try { const body = parseBody(forgotPasswordSchema, req.body); await requestPasswordReset(body.email); res.json({ ok: true }); } catch (error) { next(error); }
});
app.post("/api/auth/reset-password", authLimiter, async (req, res, next) => { try { const body = parseBody(resetPasswordSchema, req.body); const user = await resetPassword(body.token, body.password); res.json({ user }); } catch (error) { next(error); } });

// User/profile/preferences
app.get("/api/me", requireAuth, (req, res) => res.json({ user: cleanUser(req.user) }));
app.put("/api/me", requireAuth, async (req, res, next) => { try { const body = parseBody(profileSchema, req.body); const user = await updateUser(String(req.user._id), body); res.json({ user: cleanUser(user) }); } catch (error) { next(error); } });
app.get("/api/preferences", requireAuth, async (req, res, next) => { try { res.json({ preferences: await getPreferences(String(req.user._id)) }); } catch (error) { next(error); } });
app.put("/api/preferences", requireAuth, async (req, res, next) => { try { const body = parseBody(preferencesSchema, req.body); res.json({ preferences: await updatePreferences(String(req.user._id), body) }); } catch (error) { next(error); } });

// Saved items
app.get("/api/saved", requireAuth, async (req, res, next) => { try { res.json({ items: await listSaved(String(req.user._id)) }); } catch (error) { next(error); } });
app.post("/api/saved/toggle", requireAuth, async (req, res, next) => { try { const body = parseBody(savedSchema, req.body); const result = await toggleSaved(String(req.user._id), body); await recordActivity(String(req.user._id), { type: `${result.saved ? "save" : "unsave"}_${body.entityType}`, entityType: body.entityType, entityId: body.entityKey, metadata: body.entity || {} }); res.json(result); } catch (error) { next(error); } });
app.delete("/api/saved/:entityType/:entityKey", requireAuth, async (req, res, next) => { try { await removeSaved(String(req.user._id), req.params.entityType, req.params.entityKey); res.json({ ok: true }); } catch (error) { next(error); } });

// Activity / insights
app.post("/api/activity", requireAuth, async (req, res, next) => { try { const body = parseBody(activitySchema, req.body); const event = await recordActivity(String(req.user._id), body); res.status(201).json({ event }); } catch (error) { next(error); } });
app.get("/api/activity", requireAuth, async (req, res, next) => { try { const limit = boundedInt(req.query.limit, 100, 1, 200); const before = typeof req.query.before === "string" ? req.query.before : null; const events = await listActivity(String(req.user._id), limit, before); const nextBefore = events.length === limit ? new Date(events[events.length - 1].createdAt).toISOString() : null; res.json({ events, nextBefore }); } catch (error) { next(error); } });
app.get("/api/insights", requireAuth, async (req, res, next) => { try { res.json(await buildInsights(String(req.user._id))); } catch (error) { next(error); } });

// Discover/search
function queryList(value, max = 20) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean).slice(0, max);
}

app.post("/api/region/refresh", regionRefreshLimiter, async (req, res, next) => { try {
  const body = parseBody(regionSchema, req.body);
  const result = await requestRegionRefresh(body.pincode, { force: body.force });
  const statusCode = result.status === "ready" ? 200 : result.status === "queued" ? 202 : 202;
  res.status(statusCode).json(result);
} catch (error) { next(error); } });
app.get("/api/region/:pincode", regionStatusLimiter, async (req, res, next) => { try {
  const result = await getRegionStatus(req.params.pincode);
  if (result.status === "invalid") return res.status(400).json({ error: { code: "REGION_INVALID_PIN", message: "Enter a valid 6-digit PIN code." } });
  if (result.status === "ready" || result.status === "empty" || result.status === "stale") {
    const snapshot = await getRegionSnapshot(req.params.pincode);
    return res.json({ ...result, warnings: snapshot?.warnings || [], dishes: snapshot?.dishes || [], restaurants: snapshot?.restaurants || [] });
  }
  // This endpoint reports state; an upstream scraper failure is part of the state, not a broken Kiku HTTP request.
  // Returning JSON 200 for `status: error` lets the client stop polling immediately without red browser-network errors.
  res.status(200).json(result);
} catch (error) { next(error); } });
app.get("/api/discover", async (req, res, next) => { try {
  const q = typeof req.query.q === "string" ? req.query.q.slice(0, 160) : "";
  const restaurant = typeof req.query.restaurant === "string" ? req.query.restaurant.slice(0, 160) : "";
  const pincode = typeof req.query.pincode === "string" ? req.query.pincode.slice(0, 6) : "";
  const limit = boundedInt(req.query.limit, 50, 1, 100);
  const dietary = queryList(req.query.dietary);
  const allergies = queryList(req.query.allergies);
  const allergenFreeOnly = req.query.allergenFreeOnly === "true";
  res.json({ dishes: await listDishes({ q, restaurant, pincode, limit, dietary, allergies, allergenFreeOnly }), restaurants: await listRestaurants({ q: restaurant || q, pincode, limit: 30 }) });
} catch (error) { next(error); } });
app.get("/api/search", async (req, res, next) => { try {
  const q = typeof req.query.q === "string" ? req.query.q.slice(0, 160) : "";
  const pincode = typeof req.query.pincode === "string" ? req.query.pincode.slice(0, 6) : "";
  const dietary = queryList(req.query.dietary);
  const allergies = queryList(req.query.allergies);
  const allergenFreeOnly = req.query.allergenFreeOnly === "true";
  res.json({ dishes: await listDishes({ q, pincode, limit: 30, dietary, allergies, allergenFreeOnly }), restaurants: await listRestaurants({ q, pincode, limit: 20 }) });
} catch (error) { next(error); } });
app.get("/api/dishes/:id", async (req, res, next) => { try { const dish = await getDish(req.params.id); if (!dish) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Dish not found." } }); res.json({ dish }); } catch (error) { next(error); } });
app.get("/api/restaurants/:id", async (req, res, next) => { try { const restaurant = await getRestaurant(req.params.id); if (!restaurant) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Restaurant not found." } }); res.json({ restaurant }); } catch (error) { next(error); } });

async function getBaselineRecommendationCache(userId) {
  return getJson(`recommendations:baseline:${String(userId)}`);
}

// Recommendations
// Guests can request contextual recommendations using only the signals they submit
// in the current session. Authenticated users additionally receive their persisted
// Kiku preferences, saved items, and first-party activity context.
app.post("/api/recommendations", async (req, res, next) => {
  try {
    const body = parseBody(recommendationSchema, req.body);
    const isAuthenticated = Boolean(req.user);
    const hasRealtimeContext = Boolean(body.manualMood || body.expressionSignal || body.craving || body.budget || body.diet || body.dietary?.length || body.allergies?.length || body.cuisines?.length || body.spiceLevel);
    if (isAuthenticated && !hasRealtimeContext) {
      const cachedRecommendations = await getBaselineRecommendationCache(String(req.user._id));
      if (Array.isArray(cachedRecommendations)) {
        return res.json({ recommendations: cachedRecommendations, personalized: true, contextual: false, authenticated: true, source: "automation-cache" });
      }
    }
    let preferences = { dietary: [], allergies: [], cuisines: [], spiceLevel: null, budgetMin: null, budgetMax: null };
    let savedItems = [];
    let recentInteractions = [];

    if (isAuthenticated) {
      const userId = String(req.user._id);
      [preferences, savedItems, recentInteractions] = await Promise.all([
        getPreferences(userId),
        listSaved(userId),
        listActivity(userId, 50),
      ]);
    }

    const guestDietary = body.dietary || (body.diet ? [body.diet] : []);
    const context = {
      ...preferences,
      ...body,
      dietary: isAuthenticated ? (body.diet ? [body.diet] : preferences.dietary) : guestDietary,
      allergies: isAuthenticated ? preferences.allergies : (body.allergies || []),
      cuisines: isAuthenticated ? (body.cuisines?.length ? body.cuisines : preferences.cuisines) : (body.cuisines || []),
      spiceLevel: body.spiceLevel || preferences.spiceLevel,
      savedItems,
      recentInteractions,
      pincode: body.pincode || preferences.pincode || null,
    };

    const result = await buildRecommendations(context);
    const personalized = isAuthenticated && Boolean(
      preferences.dietary?.length ||
      preferences.cuisines?.length ||
      preferences.spiceLevel ||
      preferences.budgetMax ||
      savedItems.length ||
      recentInteractions.length
    );

    res.json({
      recommendations: result,
      personalized,
      contextual: Boolean(body.manualMood || body.expressionSignal || body.craving || body.budget),
      authenticated: isAuthenticated,
    });
  } catch (error) { next(error); }
});

// AI dish descriptions
app.post("/api/dish-description", assistantLimiter, async (req, res, next) => { try {
  const body = parseBody(dishDescriptionSchema, req.body);
  res.json(await describeDish(body));
} catch (error) { next(error); } });

// Recipes
app.get("/api/recipes", recipeLimiter, async (req, res, next) => { try { const q = typeof req.query.q === "string" ? req.query.q.slice(0, 120) : ""; res.json(await getRecipes(q)); } catch (error) { next(error); } });
app.get("/api/recipes/:id", recipeLimiter, async (req, res, next) => { try { const recipe = await getRecipeById(req.params.id); if (!recipe) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Recipe not found." } }); res.json({ recipe }); } catch (error) { next(error); } });
app.post("/api/recipes/substitute", assistantLimiter, async (req, res, next) => {
  try {
    const body = parseBody(recipeSubstitutionSchema, req.body);
    const result = await createRecipeVariant({ recipe: body.recipe, ingredient: body.ingredient, substitute: body.substitute });
    res.json(result.data);
  } catch (error) { next(error); }
});
app.post("/api/recipes/enrich", recipeLimiter, async (req, res, next) => {
  try {
    const body = parseBody(recipeResearchSchema, req.body);
    const { enrichRecipeWithWeb } = await import("./services/recipe-enrichment.js");
    if (!config.recipeEnrichmentEnabled) return res.status(503).json({ error: { code: "RECIPE_RESEARCH_UNAVAILABLE", message: "Recipe research is disabled on this deployment." } });
    const result = await enrichRecipeWithWeb(body.recipe);
    res.json({ recipe: result.recipe, enriched: Boolean(result.enriched), sources: result.sources || [], notes: result.notes || [] });
  } catch (error) { next(error); }
});

// Comparison: shared cache + in-flight request dedupe + bounded concurrency + circuit breaker upstream.
const comparisonInflight = new Map();
let activeComparisonRequests = 0;
const comparisonWaiters = [];
const MAX_COMPARISON_CONCURRENCY = 8;
function comparisonKey(body) { return JSON.stringify([body.location || "", body.pincode || "", body.restaurant.toLowerCase(), body.dish || ""]); }
async function withComparisonSlot(task) {
  if (activeComparisonRequests >= MAX_COMPARISON_CONCURRENCY) await new Promise((resolve) => comparisonWaiters.push(resolve));
  activeComparisonRequests += 1;
  try { return await task(); }
  finally {
    activeComparisonRequests -= 1;
    comparisonWaiters.shift()?.();
  }
}
app.post("/api/compare", compareLimiter, async (req, res, next) => {
  try {
    const body = parseBody(compareSchema, req.body);
    const sourceBody = { location: body.location || null, pincode: body.pincode || null, restaurant: body.restaurant, dish: body.dish || null };
    const key = comparisonKey(sourceBody);
    const cached = await getComparisonCache(key);
    if (cached) {
      res.setHeader("X-Kiku-Cache", "fresh");
      return res.json(filterComparison(cached, body));
    }
    const staleCached = await getStaleComparisonCache(key);
    if (comparisonInflight.has(key)) {
      try {
        const inflight = await comparisonInflight.get(key);
        res.setHeader("X-Kiku-Cache", "fresh");
        return res.json(filterComparison(inflight, body));
      } catch (error) {
        if (staleCached) {
          res.setHeader("X-Kiku-Cache", "stale");
          return res.json(filterComparison({ ...staleCached, warnings: [...new Set([...(staleCached.warnings || []), "Fresh provider data is temporarily unavailable. Showing the latest cached comparison."]) ] }, body));
        }
        throw error;
      }
    }

    const task = (async () => {
      const lockKey = `compare:${key}`;
      const lockTtlMs = Math.max(30_000, config.compareTimeoutMs * 2 + 5_000);
      let lockToken = await acquireLock(lockKey, lockTtlMs);
      if (!lockToken) {
        const waited = await waitForCache(`compare:${key}`, 20, 150);
        if (waited !== null) return waited;
        lockToken = await acquireLock(lockKey, lockTtlMs);
        if (!lockToken) {
          const error = new Error("Another comparison request is already in progress.");
          error.code = "COMPARE_BUSY";
          error.status = 503;
          throw error;
        }
      }
      try {
        const secondChance = await getComparisonCache(key);
        if (secondChance) return secondChance;
        return withComparisonSlot(async () => {
          const data = normalizeComparison(await compareViaScraper(sourceBody));
          await setComparisonCache(key, data, config.comparisonCacheTtlMs, config.comparisonCacheRetentionTtlMs);
          const requests = collection("comparisonRequests");
          if (requests) {
            await requests.updateOne(
              { key },
              { $set: { key, body, lastSeenAt: new Date(), updatedAt: new Date(), expiresAt: new Date(Date.now() + config.comparisonCacheRetentionTtlMs) } },
              { upsert: true },
            );
          }
          await queueComparisonRefresh(sourceBody).catch(() => undefined);
          return data;
        });
      } finally {
        if (lockToken) await releaseLock(lockKey, lockToken);
      }
    })();
    comparisonInflight.set(key, task);
    try {
      const data = await task;
      if (req.user) await recordActivity(String(req.user._id), { type: "compare", entityType: "dish", entityId: body.dish || body.restaurant, metadata: { restaurant: body.restaurant, pincode: body.pincode || null, offers: data.offers?.length || 0, dietary: body.dietary, allergies: body.allergies, allergenFreeOnly: body.allergenFreeOnly } });
      res.setHeader("X-Kiku-Cache", "fresh");
      res.json(filterComparison(data, body));
    } catch (error) {
      if (staleCached) {
        res.setHeader("X-Kiku-Cache", "stale");
        const fallback = { ...staleCached, warnings: [...new Set([...(staleCached.warnings || []), "Fresh provider data is temporarily unavailable. Showing the latest cached comparison."]) ] };
        return res.json(filterComparison(fallback, body));
      }
      throw error;
    } finally { comparisonInflight.delete(key); }
  } catch (error) { next(error); }
});

// Assistant
app.get("/api/assistant/conversations", requireAuth, async (req, res, next) => { try { const conversations = await listConversations(String(req.user._id)); res.json({ conversations: conversations.map((item) => ({ id: String(item._id || item.id), title: item.title, createdAt: item.createdAt, updatedAt: item.updatedAt })) }); } catch (error) { next(error); } });
app.get("/api/assistant/conversations/:id/messages", requireAuth, async (req, res, next) => { try { const messages = await getConversationMessages(String(req.user._id), req.params.id, 100); res.json({ messages: messages.map((item) => ({ role: item.role, content: item.content, data: item.toolData || null, createdAt: item.createdAt })) }); } catch (error) { next(error); } });
app.post("/api/assistant/message", assistantLimiter, requireAuth, async (req, res, next) => { try { const body = parseBody(assistantSchema, req.body); const result = await sendAssistantMessage(String(req.user._id), body.message, body.conversationId, body.recipeContext || null); res.json(result); } catch (error) { next(error); } });

// Account deletion (user data, sessions, preferences, saved items, activity, assistant history).
app.delete("/api/account", requireAuth, async (req, res, next) => {
  try {
    const userId = String(req.user._id);
    const users = collection("users");
    const names = ["sessions", "preferences", "savedItems", "activityEvents", "assistantConversations", "assistantMessages", "emailTokens"];
    if (users) {
      await Promise.all(names.map((name) => collection(name)?.deleteMany({ userId })));
      await users.deleteOne({ _id: req.user._id });
    } else {
      memoryStore("users").delete(userId);
      for (const [key, session] of memoryStore("sessions")) if (session.userId === userId) memoryStore("sessions").delete(key);
      memoryStore("preferences").delete(userId);
      for (const [key, token] of memoryStore("emailTokens")) if (token.userId === userId) memoryStore("emailTokens").delete(key);
      memoryStore("savedItems").forEach((item, key) => { if (item.userId === userId) memoryStore("savedItems").delete(key); });
      memoryStore("activityEvents").splice(0, memoryStore("activityEvents").length, ...memoryStore("activityEvents").filter((item) => item.userId !== userId));
      memoryStore("conversations").forEach((item, key) => { if (item.userId === userId) memoryStore("conversations").delete(key); });
      memoryStore("messages").splice(0, memoryStore("messages").length, ...memoryStore("messages").filter((item) => item.userId !== userId));
    }
    await Promise.all([deleteKey(`insights:${userId}`), deleteKey(`recommendations:baseline:${userId}`)]);
    await clearSession(req, res);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

// JSON 404s for unknown API endpoints. Keep SPA fallback exclusively for browser page routes.
app.use("/api", (req, res) => {
  res.status(404).json({ error: { code: "ROUTE_NOT_FOUND", message: "API route not found.", requestId: req.requestId } });
});

app.use(express.static(distPath, { maxAge: config.nodeEnv === "production" ? "1d" : 0, index: false }));
app.use((req, res, next) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/health/")) return next();
  if (!["GET", "HEAD"].includes(req.method)) return next();
  res.sendFile(path.join(distPath, "index.html"), (error) => { if (error) next(error); });
});

app.use((error, req, res, _next) => {
  const status = Number(error?.status) || (error?.code === "INVALID_CREDENTIALS" ? 401 : error?.code === "EMAIL_EXISTS" ? 409 : error?.code === "EMAIL_NOT_VERIFIED" ? 403 : error?.code === "GOOGLE_NOT_CONFIGURED" ? 503 : error?.code === "COMPARE_CIRCUIT_OPEN" ? 503 : error?.code === "COMPARE_UPSTREAM" ? 502 : 500);
  const code = error?.code || "INTERNAL_ERROR";
  console.error(JSON.stringify({ level: "error", requestId: req.requestId, code, message: error?.message, status }));
  res.status(status).json({ error: { code, message: status >= 500 ? "Something went wrong on Kiku's server." : error.message, requestId: req.requestId } });
});

const server = app.listen(config.port, config.host, () => console.log(`Kiku API listening on http://${config.host}:${config.port}`));

async function shutdown(signal) {
  console.log(JSON.stringify({ level: "info", message: `Received ${signal}; shutting down.` }));
  server.close(async () => { await closeQueues().catch(() => undefined); await closeRedis(); await closeDb(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
