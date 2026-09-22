import test from "node:test";
import assert from "node:assert/strict";
import { getComparisonCache, setComparisonCache } from "../services/comparison-cache.js";

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
