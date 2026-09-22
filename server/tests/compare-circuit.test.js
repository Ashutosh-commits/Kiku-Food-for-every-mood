import test from "node:test";
import assert from "node:assert/strict";

process.env.COMPARE_SERVICE_URL = "https://swiggy.com";
process.env.COMPARE_TIMEOUT_MS = "1000";

const { compareViaScraper, getComparisonProviderHealth } = await import("../providers/compare.js");

test("client-side comparison rejection does not open the upstream circuit", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "bad request" }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
  try {
    await assert.rejects(
      compareViaScraper({ location: "Agra", pincode: "282001", restaurant: "Test", dish: "Dish" }),
      (error) => error?.code === "COMPARE_REQUEST_REJECTED" && error?.status === 400,
    );
    assert.equal(getComparisonProviderHealth().state, "closed");
    assert.equal(getComparisonProviderHealth().consecutiveFailures, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
