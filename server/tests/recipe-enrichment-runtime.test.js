import test from "node:test";
import assert from "node:assert/strict";

process.env.AI_PROVIDER = "cloudflare";
process.env.CLOUDFLARE_ACCOUNT_ID = "test-account";
process.env.CLOUDFLARE_API_TOKEN = "test-token";
process.env.CLOUDFLARE_AI_MODEL = "@cf/zai-org/glm-4.7-flash";
process.env.RECIPE_ENRICHMENT_ENABLED = "true";

const { enrichRecipeWithWeb } = await import("../services/recipe-enrichment.js");

test("recipe enrichment fills only missing metadata and preserves provider facts", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.response_format?.type, "json_object");
    return new Response(JSON.stringify({
      choices: [{
        message: {
          role: "assistant",
          content: JSON.stringify({
            prepTimeMinutes: 15,
            cookTimeMinutes: 45,
            totalTimeMinutes: 60,
            servingsCount: 8,
            difficulty: "medium",
            equipment: ["20 cm cake tin"],
            description: "A moist Brazilian carrot cake with a chocolate topping.",
            stepGuidance: [
              { index: 0, duration: 10, heat: "180C", cue: "Oven fully heated", tip: "Line the tin well.", equipment: ["20 cm cake tin"] },
            ],
            allergens: ["dairy"],
            allergenVerified: true,
            nutrition: { calories: 999 },
          }),
        },
      }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const recipe = {
    id: "r1",
    title: "Brazilian carrot cake",
    cuisine: "Brazil",
    description: "Brazil dessert recipe.",
    prepTimeMinutes: null,
    cookTimeMinutes: 45,
    totalTimeMinutes: null,
    servingsCount: null,
    difficulty: null,
    equipment: [],
    ingredients: [["Milk", "250ml"]],
    steps: [{ name: "Step 1", instruction: "Mix the batter.", duration: 0, heat: null, cue: null, tip: "", equipment: [] }],
    allergens: [],
    allergenVerified: false,
    allergenFreeVerified: false,
    nutrition: null,
    provenance: { enrichment: "provider", generatedFields: [] },
  };

  try {
    const result = await enrichRecipeWithWeb(recipe);
    assert.equal(result.enriched, true);
    assert.equal(result.recipe.cookTimeMinutes, 45);
    assert.equal(result.recipe.prepTimeMinutes, 15);
    assert.equal(result.recipe.totalTimeMinutes, 60);
    assert.equal(result.recipe.servingsCount, 8);
    assert.equal(result.recipe.difficulty, "medium");
    assert.equal(result.recipe.ingredients[0][0], "Milk");
    assert.equal(result.recipe.steps[0].instruction, "Mix the batter.");
    assert.equal(result.recipe.steps[0].heat, "180C");
    assert.equal(result.recipe.allergenVerified, false);
    assert.deepEqual(result.recipe.nutrition, null);
    assert.equal(result.recipe.provenance.enrichment, "ai-inferred");
    assert.ok(result.recipe.provenance.generatedFields.includes("prepTimeMinutes"));
    assert.match(result.recipe.enrichmentNotice, /not provider-verified/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("recipe enrichment leaves the recipe unchanged when Cloudflare AI is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("", { status: 503 });
  const recipe = {
    id: "r2",
    title: "Test",
    description: "Generic recipe.",
    prepTimeMinutes: null,
    ingredients: [["Flour", "100g"]],
    steps: [{ instruction: "Mix.", duration: 0, heat: null, cue: null }],
  };
  try {
    const result = await enrichRecipeWithWeb(recipe);
    assert.equal(result.enriched, false);
    assert.equal(result.recipe, recipe);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
