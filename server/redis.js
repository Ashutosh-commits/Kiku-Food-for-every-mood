import { createClient } from "redis";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";

let client = null;
let ready = false;
let lastError = null;

function prefixKey(key) {
  return `${config.redisPrefix}:${key}`;
}

export async function connectRedis() {
  if (!config.redisUrl) {
    if (config.requireRedis) throw new Error("REDIS_URL is required.");
    return null;
  }
  if (client?.isReady) return client;

  client = createClient({
    url: config.redisUrl,
    socket: {
      connectTimeout: config.redisConnectTimeoutMs,
      reconnectStrategy(retries) {
        return Math.min(1000 + retries * 250, 5000);
      },
    },
  });
  client.on("error", (error) => {
    lastError = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ level: "error", subsystem: "redis", message: lastError }));
  });
  try {
    await client.connect();
    ready = true;
    lastError = null;
    return client;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    client.destroy();
    client = null;
    ready = false;
    if (config.requireRedis) throw error;
    console.warn(JSON.stringify({ level: "warn", subsystem: "redis", message: "Redis is unavailable; falling back to Mongo/in-process cache in non-production mode." }));
    return null;
  }
}

export function redisClient() {
  return client?.isReady ? client : null;
}

export function isRedisReady() {
  return Boolean(client?.isReady && ready);
}

export function redisHealth() {
  return { state: isRedisReady() ? "ready" : (config.redisUrl ? "unavailable" : "disabled"), lastError };
}

export async function pingRedis() {
  const current = redisClient();
  if (!current) return false;
  return (await current.ping()) === "PONG";
}

export async function closeRedis() {
  if (client?.isOpen) await client.close();
  client = null;
  ready = false;
}

export async function getJson(key) {
  const current = redisClient();
  if (!current) return null;
  try {
    const value = await current.get(prefixKey(key));
    return value ? JSON.parse(value) : null;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    return null;
  }
}

export async function setJson(key, value, ttlMs) {
  const current = redisClient();
  if (!current) return false;
  try {
    await current.set(prefixKey(key), JSON.stringify(value), { PX: Math.max(1000, Math.floor(ttlMs)) });
    return true;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    return false;
  }
}

export async function deleteKey(key) {
  const current = redisClient();
  if (!current) return false;
  try {
    await current.del(prefixKey(key));
    return true;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    return false;
  }
}

export async function acquireLock(key, ttlMs = 15000) {
  const current = redisClient();
  if (!current) return null;
  const token = randomUUID();
  try {
    const result = await current.set(prefixKey(`lock:${key}`), token, { NX: true, PX: Math.max(1000, Math.floor(ttlMs)) });
    return result === "OK" ? token : null;
  } catch {
    return null;
  }
}

export async function releaseLock(key, token) {
  const current = redisClient();
  if (!current || !token) return false;
  try {
    const lockKey = prefixKey(`lock:${key}`);
    const result = await current.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      { keys: [lockKey], arguments: [token] },
    );
    return Number(result) === 1;
  } catch {
    return false;
  }
}

export async function waitForCache(key, attempts = 20, delayMs = 150) {
  for (let index = 0; index < attempts; index += 1) {
    const hit = await getJson(key);
    if (hit !== null) return hit;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return null;
}

