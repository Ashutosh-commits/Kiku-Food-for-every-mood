import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("regional discovery endpoint and client wiring are present", () => {
  const index = fs.readFileSync(path.join(root, "server/index.js"), "utf8");
  const api = fs.readFileSync(path.join(root, "src/services/api.ts"), "utf8");
  const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
  assert.match(index, /app\.post\("\/api\/region\/refresh"/);
  assert.match(index, /app\.get\("\/api\/region\/:pincode"/);
  assert.match(api, /regionRefresh:/);
  assert.match(api, /regionStatus:/);
  assert.match(app, /api\.regionRefresh\(normalized\)/);
  assert.match(app, /api\.regionStatus\(normalized\)/);
});

test("regional concurrency is explicitly bounded and configurable", () => {
  const service = fs.readFileSync(path.join(root, "server/services/region-discovery.js"), "utf8");
  const config = fs.readFileSync(path.join(root, "server/config.js"), "utf8");
  assert.match(service, /activeCount < config\.regionScrapeConcurrency/);
  assert.match(config, /regionScrapeConcurrency: Number\(process\.env\.REGION_SCRAPE_CONCURRENCY \|\| 10\)/);
});

test("regional scraper response is kept separate by pincode", () => {
  const service = fs.readFileSync(path.join(root, "server/services/region-discovery.js"), "utf8");
  const catalog = fs.readFileSync(path.join(root, "server/catalog.js"), "utf8");
  assert.match(service, /function regionKey\(pincode\)/);
  const utils = fs.readFileSync(path.join(root, "server/services/region-utils.js"), "utf8");
  assert.match(utils, /regionPincode: normalizedPincode/);
  assert.match(utils, /REGION_PIN_MISMATCH|Regional scraper returned data for a different pincode/);
  assert.match(catalog, /findOne\(\{ pincode: normalizedPincode \}\)/);
});

test("regional refresh and status polling use separate rate limits", () => {
  const index = fs.readFileSync(path.join(root, "server/index.js"), "utf8");
  assert.match(index, /regionRefreshLimiter/);
  assert.match(index, /regionStatusLimiter/);
  assert.match(index, /regionStatusStore/);
});

test("regional queue has a bounded size", () => {
  const service = fs.readFileSync(path.join(root, "server/services/region-discovery.js"), "utf8");
  const config = fs.readFileSync(path.join(root, "server/config.js"), "utf8");
  assert.match(service, /REGION_QUEUE_FULL/);
  assert.match(service, /config\.regionScrapeQueueMax/);
  assert.match(config, /regionScrapeQueueMax/);
});


test("regional scraper client sends the shared authentication header", () => {
  const service = fs.readFileSync(path.join(root, "server/services/region-discovery.js"), "utf8");
  assert.match(service, /X-Scraper-Api-Key/);
  const config = fs.readFileSync(path.join(root, "server/config.js"), "utf8");
  assert.match(config, /compareServiceApiKey/);
});

test("empty regional snapshots are not persisted as ready", () => {
  const service = fs.readFileSync(path.join(root, "server/services/region-discovery.js"), "utf8");
  const config = fs.readFileSync(path.join(root, "server/config.js"), "utf8");
  const index = fs.readFileSync(path.join(root, "server/index.js"), "utf8");
  const api = fs.readFileSync(path.join(root, "src/services/api.ts"), "utf8");
  assert.match(service, /const hasDishes = Array\.isArray\(snapshot\.dishes\)/);
  assert.match(service, /const status = hasDishes \|\| hasRestaurants \|\| hasOffers \? "ready" : "empty"/);
  assert.match(service, /regionEmptyTtlMs/);
  assert.match(config, /regionEmptyTtlMs/);
  assert.match(index, /result\.status === "empty"/);
  assert.match(api, /status: "ready" \| "empty" \| "scraping" \| "queued"/);
});

test("manual region refresh can force a fresh scrape", () => {
  const service = fs.readFileSync(path.join(root, "server/services/region-discovery.js"), "utf8");
  const validation = fs.readFileSync(path.join(root, "server/services/validation.js"), "utf8");
  assert.match(validation, /force: z\.boolean\(\)\.optional\(\)\.default\(false\)/);
  assert.match(service, /requestRegionRefresh\(pincode, \{ force = false \} = \{\}\)/);
  assert.match(service, /legacyEmptyReady/);
  assert.match(service, /const completeFresh = existingSnapshot\?\.status === "ready"/);
  assert.match(service, /if \(!force && completeFresh\)/);
  assert.match(service, /if \(!force && status\.status === "empty" && !legacyEmptyReady\)/);
});

test("regional scraper warnings survive normalization and status responses", () => {
  const utils = fs.readFileSync(path.join(root, "server/services/region-utils.js"), "utf8");
  const index = fs.readFileSync(path.join(root, "server/index.js"), "utf8");
  assert.match(utils, /const warnings = Array\.isArray\(root\?\.warnings\)/);
  assert.match(utils, /warnings,/);
  assert.match(index, /warnings: snapshot\?\.warnings \|\| \[\]/);
});


test("regional cache requires successful menu enrichment before using the 24-hour fresh window", () => {
  const service = fs.readFileSync(path.join(root, "server/services/region-discovery.js"), "utf8");
  assert.match(service, /function menuEnrichmentStatus\(snapshot\)/);
  assert.match(service, /function menuEnrichmentComplete\(snapshot\)/);
  assert.match(service, /menuEnrichmentLastAttemptAt/);
  assert.match(service, /retryDeferred/);
  assert.match(service, /completeFresh/);
  assert.match(service, /menuStatus === "succeeded"/);
  assert.match(service, /config\.regionFreshTtlMs/);
});

test("regional warm-up reattempts incomplete menu snapshots but does not hot-loop failed menu runs", () => {
  const service = fs.readFileSync(path.join(root, "server/services/region-discovery.js"), "utf8");
  assert.match(service, /status\.status === "ready" && status\.dishesCount === 0 && status\.restaurantsCount > 0/);
  assert.match(service, /status\.menuEnrichmentStatus !== "failed"/);
  assert.match(service, /retryAt > Date\.now\(\)/);
});
