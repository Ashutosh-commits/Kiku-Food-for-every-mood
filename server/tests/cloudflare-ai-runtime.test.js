import test from "node:test";
import assert from "node:assert/strict";

process.env.AI_PROVIDER = "cloudflare";
process.env.CLOUDFLARE_ACCOUNT_ID = "test-account";
process.env.CLOUDFLARE_API_TOKEN = "test-token";
process.env.CLOUDFLARE_AI_MODEL = "@cf/zai-org/glm-4.7-flash";

const { cloudflareChat, cloudflareAiConfigured } = await import("../services/cloudflare-ai.js");

test("Cloudflare AI client builds the documented REST request", async () => {
  const originalFetch = globalThis.fetch;
  let captured = null;
  globalThis.fetch = async (url, options) => {
    captured = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "hello" } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    assert.equal(cloudflareAiConfigured(), true);
    const result = await cloudflareChat({
      messages: [{ role: "user", content: "hello" }],
      tools: [{ type: "function", function: { name: "searchFood", parameters: { type: "object" } } }],
      user: "user-1",
    });
    assert.equal(result?.choices?.[0]?.message?.content, "hello");
    assert.equal(captured.url, "https://api.cloudflare.com/client/v4/accounts/test-account/ai/v1/chat/completions");
    assert.equal(captured.options.headers.Authorization, "Bearer test-token");
    assert.equal(captured.body.model, "@cf/zai-org/glm-4.7-flash");
    assert.equal(captured.body.tool_choice, "auto");
    assert.equal(captured.body.parallel_tool_calls, true);
    assert.equal(captured.body.user, "user-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
