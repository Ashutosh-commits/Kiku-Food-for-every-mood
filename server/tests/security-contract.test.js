import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("production security contracts remain enabled", async () => {
  const config = await read("config.js");
  const index = await read("index.js");
  const validation = await read("services/validation.js");
  assert.match(config, /requireRedis/);
  assert.match(index, /RedisStore/);
  assert.match(index, /CSRF_ORIGIN_REJECTED/);
  assert.match(validation, /Saved item data is too large/);
  assert.match(validation, /Activity metadata is too large/);
});

test("MediaPipe external model hosts are present in the API CSP", async () => {
  const index = await read("index.js");
  assert.match(index, /cdn\.jsdelivr\.net/);
  assert.match(index, /storage\.googleapis\.com/);
});
