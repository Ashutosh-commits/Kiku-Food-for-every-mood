import { collection } from "../db.js";
import { normalizeRegionPincode, normalizeRegionSnapshot } from "./region-utils.js";
import { config } from "../config.js";
import { fetchJsonLimited } from "../lib/http.js";
import { acquireLock, getJson, releaseLock, setJson } from "../redis.js";

const active = new Map();
const pending = new Set();
const requested = new Set();
const queue = [];
let activeCount = 0;

function regionKey(pincode) { return `region:${pincode}`; }
function regionStateKey(pincode) { return `region:state:${pincode}`; }
const normalizePincode = normalizeRegionPincode;

function hasRegionData(snapshot) {
  return Boolean(
    (Array.isArray(snapshot?.dishes) && snapshot.dishes.length) ||
    (Array.isArray(snapshot?.restaurants) && snapshot.restaurants.length) ||
    (Array.isArray(snapshot?.offers) && snapshot.offers.length)
  );
}

function hasRestaurants(snapshot) {
  return Array.isArray(snapshot?.restaurants) && snapshot.restaurants.length > 0;
}

function hasDishes(snapshot) {
  return Array.isArray(snapshot?.dishes) && snapshot.dishes.length > 0;
}

function menuEnrichmentStatus(snapshot) {
  if (hasDishes(snapshot)) return "succeeded";
  const warnings = Array.isArray(snapshot?.warnings) ? snapshot.warnings : [];
  if (warnings.some((warning) => /menu enrichment failed/i.test(String(warning)))) return "failed";
  if (hasRestaurants(snapshot)) return "empty";
  return "not_attempted";
}

function menuEnrichmentComplete(snapshot) {
  return hasDishes(snapshot) && (snapshot?.menuEnrichmentStatus || menuEnrichmentStatus(snapshot)) === "succeeded";
}

function menuRetryAt(snapshot) {
  const lastAttempt = snapshot?.menuEnrichmentLastAttemptAt ? new Date(snapshot.menuEnrichmentLastAttemptAt).getTime() : 0;
  if (!Number.isFinite(lastAttempt) || !lastAttempt) return 0;
  const status = snapshot?.menuEnrichmentStatus || menuEnrichmentStatus(snapshot);
  const ttl = status === "failed" ? config.regionErrorTtlMs : config.regionEmptyTtlMs;
  return lastAttempt + ttl;
}

async function persistSnapshot(snapshot) {
  const hasDishes = Array.isArray(snapshot.dishes) && snapshot.dishes.length > 0;
  const hasRestaurants = Array.isArray(snapshot.restaurants) && snapshot.restaurants.length > 0;
  const hasOffers = Array.isArray(snapshot.offers) && snapshot.offers.length > 0;
  const status = hasDishes || hasRestaurants || hasOffers ? "ready" : "empty";
  const now = new Date();
  const menuStatus = menuEnrichmentStatus(snapshot);
  const freshTtl = status === "empty"
    ? config.regionEmptyTtlMs
    : menuStatus === "succeeded"
      ? config.regionFreshTtlMs
      : config.regionEmptyTtlMs;
  const freshUntil = new Date(Date.now() + freshTtl);
  const expiresAt = new Date(Date.now() + config.regionRetentionTtlMs);
  const record = {
    ...snapshot,
    status,
    freshUntil,
    expiresAt,
    updatedAt: now,
    error: null,
    menuEnrichmentStatus: menuStatus,
    menuEnrichmentLastAttemptAt: now,
  };
  const regions = collection("regionalCatalog");
  if (regions) {
    await regions.updateOne({ pincode: snapshot.pincode }, { $set: record }, { upsert: true });
  }
  await setJson(regionKey(snapshot.pincode), record, config.regionRetentionTtlMs);
  await setJson(regionStateKey(snapshot.pincode), {
    pincode: snapshot.pincode,
    status,
    updatedAt: record.updatedAt,
    checkedAt: record.checkedAt,
    warning: status === "empty"
      ? (record.warnings?.[0] || "No verified regional provider data was found.")
      : (menuStatus === "succeeded" ? null : (record.warnings?.find((warning) => /menu enrichment failed|no usable menu items/i.test(String(warning))) || null)),
    menuEnrichmentStatus: menuStatus,
    menuEnrichmentLastAttemptAt: record.menuEnrichmentLastAttemptAt,
  }, config.regionRetentionTtlMs);
  return record;
}

async function persistError(pincode, error) {
  const existing = await loadSnapshot(pincode);
  const hasData = hasRegionData(existing);
  const now = new Date();
  const retentionExpiresAt = existing?.expiresAt && new Date(existing.expiresAt).getTime() > now.getTime()
    ? new Date(existing.expiresAt)
    : new Date(Date.now() + config.regionRetentionTtlMs);
  const record = {
    ...(existing || { pincode, dishes: [], restaurants: [], offers: [], warnings: [] }),
    pincode,
    status: hasData ? "stale" : "error",
    error: error?.message || "Regional discovery failed.",
    updatedAt: existing?.updatedAt || now,
    checkedAt: existing?.checkedAt || null,
    freshUntil: existing?.freshUntil || new Date(0),
    expiresAt: retentionExpiresAt,
    lastRefreshErrorAt: now,
  };
  const regions = collection("regionalCatalog");
  if (regions) await regions.updateOne({ pincode }, { $set: record }, { upsert: true });
  await setJson(regionKey(pincode), record, Math.max(1000, retentionExpiresAt.getTime() - Date.now()));
  await setJson(regionStateKey(pincode), {
    pincode,
    status: record.status,
    updatedAt: record.updatedAt,
    checkedAt: record.checkedAt,
    error: record.error,
    warning: hasData ? "Showing the latest cached regional snapshot while a fresh provider refresh is unavailable." : null,
  }, Math.max(1000, retentionExpiresAt.getTime() - Date.now()));
  return record;
}

async function loadSnapshot(pincode) {
  const cached = await getJson(regionKey(pincode));
  if (cached) return cached;
  const regions = collection("regionalCatalog");
  if (!regions) return null;
  const record = await regions.findOne({ pincode });
  if (record) await setJson(regionKey(pincode), record, Math.max(1000, new Date(record.expiresAt || Date.now()).getTime() - Date.now()));
  return record || null;
}

async function scrapeRegion(pincode) {
  const base = config.compareServiceUrl.replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.regionScrapeTimeoutMs);
  try {
    const { response, data } = await fetchJsonLimited(`${base}/api/v1/region`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(config.compareServiceApiKey ? { "X-Scraper-Api-Key": config.compareServiceApiKey } : {}) },
      body: JSON.stringify({ pincode }),
      signal: controller.signal,
    }, config.regionResponseMaxBytes);
    if (!response.ok) {
      const error = new Error(`Regional scraper returned ${response.status}.`);
      error.code = response.status >= 500 ? "REGION_UPSTREAM" : "REGION_REQUEST_REJECTED";
      error.status = response.status >= 500 ? 502 : response.status;
      throw error;
    }
    return normalizeRegionSnapshot(data, pincode);
  } finally {
    clearTimeout(timer);
  }
}

async function runRefresh(pincode) {
  const lockKey = `region:lock:${pincode}`;
  const lockTtl = Math.max(config.regionScrapeTimeoutMs + 15_000, 30_000);
  const lockToken = await acquireLock(lockKey, lockTtl);
  if (!lockToken) return loadSnapshot(pincode);
  try {
    const existing = await loadSnapshot(pincode);
    const freshUntil = new Date(existing?.freshUntil || 0).getTime();
    const complete = existing?.status === "ready" && freshUntil > Date.now() && menuEnrichmentComplete(existing);
    const retryAt = menuRetryAt(existing);
    const retryDeferred = existing?.status === "ready" && hasRestaurants(existing) && !menuEnrichmentComplete(existing) && retryAt > Date.now();
    if (complete || retryDeferred) return existing;
    const snapshot = await scrapeRegion(pincode);
    return persistSnapshot(snapshot);
  } catch (error) {
    await persistError(pincode, error);
    return null;
  } finally {
    await releaseLock(lockKey, lockToken);
  }
}

async function drain() {
  while (activeCount < config.regionScrapeConcurrency && queue.length) {
    const next = queue.shift();
    if (!next) break;
    pending.delete(next.pincode);
    activeCount += 1;
    const promise = runRefresh(next.pincode)
      .catch(() => null)
      .finally(() => {
        active.delete(next.pincode);
        activeCount -= 1;
        void drain();
      });
    active.set(next.pincode, promise);
    next.resolve(promise);
  }
}

export async function getRegionStatus(pincode) {
  const normalized = normalizePincode(pincode);
  if (!normalized) return { pincode: String(pincode || ""), status: "invalid" };
  const state = await getJson(regionStateKey(normalized));
  const snapshot = await loadSnapshot(normalized);
  const stateStartedAt = state?.startedAt || state?.queuedAt ? new Date(state.startedAt || state.queuedAt).getTime() : 0;
  const stateExpired = stateStartedAt > 0 && (Date.now() - stateStartedAt) > (config.regionScrapeTimeoutMs + 30_000);
  if ((state?.status === "scraping" || state?.status === "queued") && !active.has(normalized) && !pending.has(normalized) && stateExpired) {
    const staleMessage = "The previous regional refresh expired before completing. Retry to start a new PIN-specific refresh.";
    await setJson(regionStateKey(normalized), { pincode: normalized, status: "error", error: staleMessage, warning: staleMessage }, Math.max(1000, config.regionErrorTtlMs));
    return { pincode: normalized, status: "error", error: staleMessage, warning: staleMessage, dishesCount: Array.isArray(snapshot?.dishes) ? snapshot.dishes.length : 0, restaurantsCount: Array.isArray(snapshot?.restaurants) ? snapshot.restaurants.length : 0 };
  }
  if (state?.status === "scraping" || state?.status === "queued" || active.has(normalized) || pending.has(normalized)) {
    return {
      pincode: normalized,
      status: state?.status === "queued" || queue.some((item) => item.pincode === normalized) || pending.has(normalized) && !active.has(normalized) ? "queued" : "scraping",
      checkedAt: snapshot?.checkedAt || null,
      updatedAt: snapshot?.updatedAt || null,
      dishesCount: Array.isArray(snapshot?.dishes) ? snapshot.dishes.length : 0,
      restaurantsCount: Array.isArray(snapshot?.restaurants) ? snapshot.restaurants.length : 0,
      menuEnrichmentStatus: snapshot?.menuEnrichmentStatus || menuEnrichmentStatus(snapshot),
      menuEnrichmentLastAttemptAt: snapshot?.menuEnrichmentLastAttemptAt || null,
    };
  }
  if (!snapshot) return { pincode: normalized, status: state?.status === "error" ? "error" : state?.status === "queued" ? "queued" : "idle", error: state?.error || null, warning: state?.warning || null, dishesCount: 0, restaurantsCount: 0, menuEnrichmentStatus: "not_attempted", menuEnrichmentLastAttemptAt: null };
  const hasData = hasRegionData(snapshot);
  const effectiveStatus = snapshot.status === "ready" && !hasData ? "empty" : snapshot.status;
  const fresh = new Date(snapshot.freshUntil || 0).getTime() > Date.now();
  return {
    pincode: normalized,
    status: fresh ? effectiveStatus : effectiveStatus === "ready" || effectiveStatus === "empty" ? "stale" : effectiveStatus,
    checkedAt: snapshot.checkedAt || null,
    updatedAt: snapshot.updatedAt || null,
    error: snapshot.error || null,
    warning: snapshot.warnings?.[0] || null,
    dishesCount: Array.isArray(snapshot.dishes) ? snapshot.dishes.length : 0,
    restaurantsCount: Array.isArray(snapshot.restaurants) ? snapshot.restaurants.length : 0,
    menuEnrichmentStatus: snapshot.menuEnrichmentStatus || menuEnrichmentStatus(snapshot),
    menuEnrichmentLastAttemptAt: snapshot.menuEnrichmentLastAttemptAt || null,
  };
}

export async function getRegionSnapshot(pincode) {
  const normalized = normalizePincode(pincode);
  if (!normalized) return null;
  const snapshot = await loadSnapshot(normalized);
  if (!snapshot || !["ready", "empty", "stale"].includes(snapshot.status)) return null;
  return snapshot;
}

export async function requestRegionRefresh(pincode, { force = false } = {}) {
  const normalized = normalizePincode(pincode);
  if (!normalized) throw Object.assign(new Error("Enter a valid 6-digit PIN code."), { code: "REGION_INVALID_PIN", status: 400 });
  if (requested.has(normalized) || active.has(normalized) || pending.has(normalized)) {
    const status = await getRegionStatus(normalized);
    return { ...status, status: status.status === "queued" || pending.has(normalized) ? "queued" : "scraping" };
  }
  requested.add(normalized);
  try {
    const status = await getRegionStatus(normalized);
    const existingSnapshot = await loadSnapshot(normalized);
    const legacyEmptyReady = existingSnapshot?.status === "ready" && !hasRegionData(existingSnapshot);
    const completeFresh = existingSnapshot?.status === "ready"
      && new Date(existingSnapshot.freshUntil || 0).getTime() > Date.now()
      && menuEnrichmentComplete(existingSnapshot);
    const retryAt = menuRetryAt(existingSnapshot);
    const retryDeferred = existingSnapshot?.status === "ready" && hasRestaurants(existingSnapshot) && !menuEnrichmentComplete(existingSnapshot) && retryAt > Date.now();
    if (!force && completeFresh) { requested.delete(normalized); return status; }
    if (!force && retryDeferred) { requested.delete(normalized); return status; }
    if (!force && status.status === "empty" && !legacyEmptyReady) { requested.delete(normalized); return status; }
    if (status.status === "scraping" || status.status === "queued" || active.has(normalized) || pending.has(normalized)) {
      requested.delete(normalized);
      return { ...status, status: status.status === "queued" || pending.has(normalized) ? "queued" : "scraping" };
    }
    if (!pending.has(normalized) && activeCount >= config.regionScrapeConcurrency && queue.length >= config.regionScrapeQueueMax) {
      requested.delete(normalized);
      const error = Object.assign(new Error("Regional scrape queue is temporarily full. Please try again shortly."), { code: "REGION_QUEUE_FULL", status: 503 });
      throw error;
    }
    let resolveQueued;
    const promise = new Promise((resolve) => { resolveQueued = resolve; });
    pending.add(normalized);
    await setJson(regionStateKey(normalized), { pincode: normalized, status: activeCount < config.regionScrapeConcurrency ? "scraping" : "queued", startedAt: activeCount < config.regionScrapeConcurrency ? new Date() : undefined, queuedAt: activeCount < config.regionScrapeConcurrency ? undefined : new Date() }, Math.max(config.regionScrapeTimeoutMs + 30_000, 120_000));
    queue.push({ pincode: normalized, resolve: resolveQueued });
    requested.delete(normalized);
    void drain();
    const statusValue = activeCount < config.regionScrapeConcurrency ? "scraping" : "queued";
    return { pincode: normalized, status: statusValue, started: statusValue === "scraping", position: statusValue === "queued" ? queue.findIndex((item) => item.pincode === normalized) + 1 : undefined };
  } catch (error) {
    requested.delete(normalized);
    throw error;
  }
}

export async function warmRegionIfNeeded(pincode) {
  try {
    const status = await getRegionStatus(pincode);
    if (status.status === "idle" || status.status === "stale" || status.status === "error" || (status.status === "ready" && status.dishesCount === 0 && status.restaurantsCount > 0 && status.menuEnrichmentStatus !== "failed")) {
      await requestRegionRefresh(pincode);
    }
  } catch { /* background warm only */ }
}

export function getRegionConcurrency() {
  return { active: activeCount, queued: queue.length, limit: config.regionScrapeConcurrency };
}

