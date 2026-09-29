import test from "node:test";
import assert from "node:assert/strict";
import { getComparisonCache, getStaleComparisonCache, setComparisonCache } from "../services/comparison-cache.js";

test("comparison cache stores and returns shared data in development fallback", async () => {
  const key = `test-${Date.now()}`;
  const value = { offers: [{ platform: "swiggy", price: 249 }] };
  await setComparisonCache(key, value, 5000);
  assert.deepEqual(await getComparisonCache(key), value);
});

test("comparison cache expires entries", async () => {
  const key = `test-expiring-${Date.now()}`;
  await setComparisonCache(key, { ok: true }, 1);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(await getComparisonCache(key), null);
});


test("comparison cache supports stale fallback beyond the fresh window", async () => {
  const key = `test-stale-${Date.now()}`;
  const value = { offers: [{ platform: "zomato", price: 199 }] };
  await setComparisonCache(key, value, 10, 5000);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(await getComparisonCache(key), null);
  const stale = await getStaleComparisonCache(key);
  assert.deepEqual(stale, value);
  await new Promise((resolve) => setTimeout(resolve, 5100));
  assert.equal(await getStaleComparisonCache(key), null);
});
