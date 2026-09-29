import test from "node:test";
import assert from "node:assert/strict";

process.env.COMPARE_SERVICE_URL = "https://swiggy.com";
process.env.COMPARE_TIMEOUT_MS = "1000";
process.env.COMPARE_SERVICE_API_KEY = "local-kiku-scraper-secret";

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


test("scraper auth header is attached when configured", async () => {
  const originalFetch = globalThis.fetch;
  let capturedHeaders;
  globalThis.fetch = async (_url, options) => {
    capturedHeaders = options.headers;
    return new Response(JSON.stringify({ offers: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    await compareViaScraper({ location: "Agra", pincode: "282001", restaurant: "Test", dish: "Dish" });
    assert.equal(capturedHeaders["X-Scraper-Api-Key"], "local-kiku-scraper-secret");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
