import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

test("Cloudflare AI is optional and deterministic fallback remains wired", () => {
  const config = fs.readFileSync(path.join(root, "server", "config.js"), "utf8");
  const assistant = fs.readFileSync(path.join(root, "server", "services", "assistant.js"), "utf8");
  const ai = fs.readFileSync(path.join(root, "server", "services", "cloudflare-ai.js"), "utf8");
  assert.match(config, /cloudflareAiModel/);
  assert.match(config, /AI_PROVIDER/);
  assert.match(ai, /api\.cloudflare\.com\/client\/v4\/accounts/);
  assert.match(assistant, /deterministicAnswer/);
  assert.match(assistant, /cloudflareAnswer/);
  assert.match(assistant, /usedModel: Boolean\(ai\)/);
});

test("Paid-provider configuration is removed from the active server path", () => {
  const files = [
    "server/config.js",
    "server/services/assistant.js",
    "server/services/recipe-substitutions.js",
    "server/services/recipe-enrichment.js",
    "server/.env.example",
  ].map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
  assert.doesNotMatch(files, /OPENAI_API_KEY|OPENAI_MODEL|api\.openai\.com/);
});
