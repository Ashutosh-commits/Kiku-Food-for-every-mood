import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = async (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

 test("guest mood recommendations remain public while authenticated requests keep persisted context", async () => {
  const server = await read("index.js");
  assert.match(server, /app\.post\("\/api\/recommendations", async \(req, res, next\)/);
  assert.doesNotMatch(server, /app\.post\("\/api\/recommendations", requireAuth/);
  assert.match(server, /const isAuthenticated = Boolean\(req\.user\)/);
  assert.match(server, /savedItems,\s*recentInteractions/);
});

test("guest recommendation validation accepts contextual preference signals", async () => {
  const validation = await read("services/validation.js");
  assert.match(validation, /dietary: z\.array/);
  assert.match(validation, /allergies: z\.array/);
  assert.match(validation, /cuisines: z\.array/);
  assert.match(validation, /spiceLevel: z\.string/);
});

test("price comparison disclaimer is present in both markup and dark-mode styling", async () => {
  const app = await readFile(new URL("../../src/App.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../../src/index.css", import.meta.url), "utf8");
  assert.match(app, /Prices shown do not include tax, service\/platform fees, or delivery charges/);
  assert.match(css, /\.dish-modal-comparison-alert/);
  assert.match(css, /\.landing-page\.dark-mode \.dish-modal-comparison-alert/);
});
