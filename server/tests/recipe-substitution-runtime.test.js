import test from "node:test";
import assert from "node:assert/strict";

process.env.AI_PROVIDER = "cloudflare";
process.env.CLOUDFLARE_ACCOUNT_ID = "test-account";
process.env.CLOUDFLARE_API_TOKEN = "test-token";
process.env.CLOUDFLARE_AI_MODEL = "@cf/zai-org/glm-4.7-flash";

const { createRecipeVariant } = await import("../services/recipe-substitutions.js");

test("Cloudflare AI success path returns a valid recipe variant", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      updatedIngredients: [
        { name: "olive oil", amount: "1 tbsp" },
        { name: "salt", amount: "1 tsp" },
      ],
      updatedSteps: [
        { name: "Mix", instruction: "Mix olive oil with salt.", duration: 0, tip: "", ingredients: ["olive oil", "salt"], heat: null, cue: null, equipment: [] },
      ],
      safe: false,
      summary: "Olive oil replaces butter for a lighter preparation.",
      warning: "Review texture and cooking behavior before serving.",
    }) } }],
  }), { status: 200, headers: { "content-type": "application/json" } });

  try {
    const result = await createRecipeVariant({
      recipe: {
        id: "r1",
        title: "Test Recipe",
        ingredients: [["butter", "1 tbsp"], ["salt", "1 tsp"]],
        steps: [{ name: "Mix", instruction: "Mix butter with salt.", duration: 0, tip: "", ingredients: ["butter", "salt"], heat: null, cue: null, equipment: [] }],
      },
      ingredient: "butter",
      substitute: "olive oil",
    });
    assert.equal(result.data.source, "ai");
    assert.equal(result.recipe.ingredients[0][0], "olive oil");
    assert.equal(Array.isArray(result.recipe.steps), true);
    assert.equal(result.recipe.steps[0].instruction.includes("olive oil"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
