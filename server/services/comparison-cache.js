import { collection } from "../db.js";
import { deleteKey, getJson, setJson } from "../redis.js";

const memoryTtl = new Map();

function memoryGet(key, allowStale = false) {
  const entry = memoryTtl.get(key);
  if (!entry) return null;
  const now = Date.now();
  if (entry.expiresAt <= now) { memoryTtl.delete(key); return null; }
  if (!allowStale && entry.freshUntil <= now) return null;
  return entry.data;
}

export async function getComparisonCache(key) {
  const redisHit = await getJson(`compare:${key}`);
  if (redisHit !== null) return redisHit;

  const caches = collection("comparisonCache");
  if (caches) {
    const entry = await caches.findOne({ key });
    if (entry && new Date(entry.freshUntil || entry.expiresAt).getTime() > Date.now() && new Date(entry.expiresAt).getTime() > Date.now()) {
      const ttl = Math.max(1000, new Date(entry.freshUntil || entry.expiresAt).getTime() - Date.now());
      await setJson(`compare:${key}`, entry.data || null, ttl);
      return entry.data || null;
    }
  }
  return memoryGet(key);
}

export async function getStaleComparisonCache(key) {
  const caches = collection("comparisonCache");
  if (caches) {
    const entry = await caches.findOne({ key });
    const now = Date.now();
    if (entry && new Date(entry.expiresAt).getTime() > now) return entry.data || null;
  }
  return memoryGet(key, true);
}

export async function setComparisonCache(key, data, freshTtlMs, retentionTtlMs = freshTtlMs) {
  const freshUntil = new Date(Date.now() + freshTtlMs);
  const expiresAt = new Date(Date.now() + Math.max(freshTtlMs, retentionTtlMs));
  await setJson(`compare:${key}`, data, Math.max(1000, freshTtlMs));
  const caches = collection("comparisonCache");
  if (caches) {
    await caches.updateOne(
      { key },
      { $set: { key, data, createdAt: new Date(), freshUntil, expiresAt } },
      { upsert: true },
    );
    return;
  }
  memoryTtl.set(key, { data, freshUntil: freshUntil.getTime(), expiresAt: expiresAt.getTime() });
  while (memoryTtl.size > 500) memoryTtl.delete(memoryTtl.keys().next().value);
}

export async function invalidateComparisonCache(key) {
  await deleteKey(`compare:${key}`);
  const caches = collection("comparisonCache");
  if (caches) await caches.deleteOne({ key });
  memoryTtl.delete(key);
}
