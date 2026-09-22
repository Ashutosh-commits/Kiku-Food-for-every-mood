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
