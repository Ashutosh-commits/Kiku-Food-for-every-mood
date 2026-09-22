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

async function persistSnapshot(snapshot) {
  const freshUntil = new Date(Date.now() + config.regionFreshTtlMs);
  const expiresAt = new Date(Date.now() + config.regionRetentionTtlMs);
  const record = { ...snapshot, status: "ready", freshUntil, expiresAt, updatedAt: new Date() };
  const regions = collection("regionalCatalog");
  if (regions) {
    await regions.updateOne({ pincode: snapshot.pincode }, { $set: record }, { upsert: true });
  }
  await setJson(regionKey(snapshot.pincode), record, config.regionRetentionTtlMs);
  await setJson(regionStateKey(snapshot.pincode), { pincode: snapshot.pincode, status: "ready", updatedAt: record.updatedAt, checkedAt: record.checkedAt }, config.regionRetentionTtlMs);
  return record;
}

async function persistError(pincode, error) {
  const record = {
    pincode,
    status: "error",
    error: error?.message || "Regional discovery failed.",
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + config.regionErrorTtlMs),
  };
  const regions = collection("regionalCatalog");
  if (regions) await regions.updateOne({ pincode }, { $set: record }, { upsert: true });
  await setJson(regionKey(pincode), record, config.regionErrorTtlMs);
  await setJson(regionStateKey(pincode), { pincode, status: "error", updatedAt: record.updatedAt, error: record.error }, config.regionErrorTtlMs);
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
      headers: { "Content-Type": "application/json", Accept: "application/json" },
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
  const lockKey = `region:${pincode}`;
  const lockTtl = Math.max(config.regionScrapeTimeoutMs + 15_000, 30_000);
  const lockToken = await acquireLock(lockKey, lockTtl);
  if (!lockToken) return loadSnapshot(pincode);
  try {
    const existing = await loadSnapshot(pincode);
    const freshUntil = new Date(existing?.freshUntil || 0).getTime();
    if (existing?.status === "ready" && freshUntil > Date.now()) return existing;
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
  if (state?.status === "scraping" || state?.status === "queued" || active.has(normalized) || pending.has(normalized)) {
    return {
      pincode: normalized,
      status: state?.status === "queued" || queue.some((item) => item.pincode === normalized) || pending.has(normalized) && !active.has(normalized) ? "queued" : "scraping",
      checkedAt: snapshot?.checkedAt || null,
      updatedAt: snapshot?.updatedAt || null,
      dishesCount: Array.isArray(snapshot?.dishes) ? snapshot.dishes.length : 0,
      restaurantsCount: Array.isArray(snapshot?.restaurants) ? snapshot.restaurants.length : 0,
    };
  }
  if (!snapshot) return { pincode: normalized, status: state?.status === "error" ? "error" : state?.status === "queued" ? "queued" : "idle", error: state?.error || null, dishesCount: 0, restaurantsCount: 0 };
  const fresh = snapshot.status === "ready" && new Date(snapshot.freshUntil || 0).getTime() > Date.now();
  return {
    pincode: normalized,
    status: fresh ? "ready" : snapshot.status === "ready" ? "stale" : snapshot.status,
    checkedAt: snapshot.checkedAt || null,
    updatedAt: snapshot.updatedAt || null,
    error: snapshot.error || null,
    dishesCount: Array.isArray(snapshot.dishes) ? snapshot.dishes.length : 0,
    restaurantsCount: Array.isArray(snapshot.restaurants) ? snapshot.restaurants.length : 0,
  };
}

export async function getRegionSnapshot(pincode) {
  const normalized = normalizePincode(pincode);
  if (!normalized) return null;
  const snapshot = await loadSnapshot(normalized);
  if (!snapshot || snapshot.status !== "ready") return null;
  return snapshot;
}

export async function requestRegionRefresh(pincode) {
  const normalized = normalizePincode(pincode);
  if (!normalized) throw Object.assign(new Error("Enter a valid 6-digit PIN code."), { code: "REGION_INVALID_PIN", status: 400 });
  if (requested.has(normalized) || active.has(normalized) || pending.has(normalized)) {
    const status = await getRegionStatus(normalized);
    return { ...status, status: status.status === "queued" || pending.has(normalized) ? "queued" : "scraping" };
  }
  requested.add(normalized);
  try {
    const status = await getRegionStatus(normalized);
    if (status.status === "ready") { requested.delete(normalized); return status; }
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
    if (status.status === "idle" || status.status === "stale" || status.status === "error") await requestRegionRefresh(pincode);
  } catch { /* background warm only */ }
}

export function getRegionConcurrency() {
  return { active: activeCount, queued: queue.length, limit: config.regionScrapeConcurrency };
}
