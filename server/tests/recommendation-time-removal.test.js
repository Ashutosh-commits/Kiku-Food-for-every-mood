import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const files = [
  "src/App.tsx",
  "src/types/index.ts",
  "src/data/filters.ts",
  "src/stores/profile-store.ts",
  "server/index.js",
  "server/services/recommendations.js",
  "server/services/assistant.js",
  "server/services/validation.js",
].map((relative) => ({ relative, content: fs.readFileSync(path.join(root, relative), "utf8") }));

test("recommendation flow no longer includes a time-available signal", () => {
  for (const { relative, content } of files) {
    assert.doesNotMatch(content, /timeAvailable|prepTimeOptions|How much time do you have/, `legacy time signal remains in ${relative}`);
  }
});
