import { collection } from "../db.js";
import { deleteKey, getJson, setJson } from "../redis.js";

const memoryTtl = new Map();

function memoryGet(key) {
  const entry = memoryTtl.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) { memoryTtl.delete(key); return null; }
  return entry.data;
}

export async function getComparisonCache(key) {
  const redisHit = await getJson(`compare:${key}`);
  if (redisHit !== null) return redisHit;

  const caches = collection("comparisonCache");
  if (caches) {
    const entry = await caches.findOne({ key });
    if (entry && new Date(entry.expiresAt).getTime() > Date.now()) {
      await setJson(`compare:${key}`, entry.data || null, Math.max(1000, new Date(entry.expiresAt).getTime() - Date.now()));
      return entry.data || null;
    }
  }
  return memoryGet(key);
}

export async function setComparisonCache(key, data, ttlMs) {
  await setJson(`compare:${key}`, data, ttlMs);
  const expiresAt = new Date(Date.now() + ttlMs);
  const caches = collection("comparisonCache");
  if (caches) {
    await caches.updateOne({ key }, { $set: { key, data, createdAt: new Date(), expiresAt } }, { upsert: true });
    return;
  }
  memoryTtl.set(key, { data, expiresAt: expiresAt.getTime() });
  while (memoryTtl.size > 500) memoryTtl.delete(memoryTtl.keys().next().value);
}

export async function invalidateComparisonCache(key) {
  await deleteKey(`compare:${key}`);
  const caches = collection("comparisonCache");
  if (caches) await caches.deleteOne({ key });
  memoryTtl.delete(key);
}
