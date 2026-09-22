import { cloudflareAiConfigured, cloudflareChat } from "./cloudflare-ai.js";

function clampRecipe(recipe) {
  return {
    id: recipe?.id || null,
    title: recipe?.title || "Recipe",
    cuisine: recipe?.cuisine || "",
    description: String(recipe?.description || "").slice(0, 1500),
    servings: recipe?.servings || "",
    ingredients: Array.isArray(recipe?.ingredients) ? recipe.ingredients.slice(0, 40).map(([name, amount]) => [String(name), String(amount)]) : [],
    steps: Array.isArray(recipe?.steps) ? recipe.steps.slice(0, 24).map((step, index) => ({
      name: step?.name || `Step ${index + 1}`,
      instruction: String(step?.instruction || "").slice(0, 1200),
      duration: Number.isFinite(step?.duration) ? step.duration : 0,
      tip: String(step?.tip || "").slice(0, 600),
      ingredients: Array.isArray(step?.ingredients) ? step.ingredients.slice(0, 20).map((value) => String(value)) : [],
      heat: step?.heat || null,
      cue: step?.cue || null,
    })) : [],
    equipment: Array.isArray(recipe?.equipment) ? recipe.equipment.slice(0, 20) : [],
  };
}

function fallbackReplace(recipe, ingredient, substitute) {
  const target = ingredient.trim().toLowerCase();
  const next = structuredClone(clampRecipe(recipe));
  let changed = false;
  next.ingredients = next.ingredients.map(([name, amount]) => {
    if (String(name).trim().toLowerCase() !== target) return [name, amount];
    changed = true;
    return [substitute.trim(), amount];
  });
  next.steps = next.steps.map((step) => ({
    ...step,
    ingredients: step.ingredients.map((name) => String(name).trim().toLowerCase() === target ? substitute.trim() : name),
    instruction: step.instruction.replace(new RegExp(ingredient.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), () => substitute.trim()),
  }));
  return changed ? next : null;
}

function normalizeAiSteps(steps, fallbackSteps) {
  if (!Array.isArray(steps) || !steps.length) return null;
  const normalized = steps.slice(0, 24).map((step, index) => ({
    name: String(step?.name || fallbackSteps[index]?.name || `Step ${index + 1}`).slice(0, 120),
    instruction: String(step?.instruction || fallbackSteps[index]?.instruction || "").slice(0, 1200),
    duration: Number.isFinite(Number(step?.duration)) ? Math.max(0, Math.min(7200, Number(step.duration))) : Number(fallbackSteps[index]?.duration || 0),
    tip: String(step?.tip || fallbackSteps[index]?.tip || "").slice(0, 600),
    ingredients: Array.isArray(step?.ingredients) ? step.ingredients.slice(0, 20).map((value) => String(value)) : Array.isArray(fallbackSteps[index]?.ingredients) ? fallbackSteps[index].ingredients : [],
    heat: step?.heat == null ? fallbackSteps[index]?.heat || null : String(step.heat).slice(0, 100),
    cue: step?.cue == null ? fallbackSteps[index]?.cue || null : String(step.cue).slice(0, 600),
    equipment: Array.isArray(step?.equipment) ? step.equipment.slice(0, 10).map((value) => String(value)) : Array.isArray(fallbackSteps[index]?.equipment) ? fallbackSteps[index].equipment : [],
  }));
  return normalized.every((step) => step.instruction.trim()) ? normalized : null;
}

function normalizeAiIngredients(ingredients, fallbackIngredients) {
  if (!Array.isArray(ingredients) || !ingredients.length) return null;
  const normalized = ingredients.slice(0, 40).map((item, index) => [
    String(item?.name || fallbackIngredients[index]?.[0] || "").slice(0, 160),
    String(item?.amount ?? fallbackIngredients[index]?.[1] ?? "").slice(0, 80),
  ]);
  return normalized.every(([name]) => name.trim()) ? normalized : null;
}

function fallbackVariantResponse(recipe, target, replacement, fallback, warning) {
  return {
    recipe: {
      ...recipe,
      ingredients: fallback.ingredients,
      steps: fallback.steps,
      nutrition: null,
      substitutions: [{ ingredient: target, substitute: replacement, note: "Applied as a text-level substitution. Review texture, timing, and food-safety requirements before cooking." }],
      provenance: { ...(recipe.provenance || {}), enrichment: "user-substitution", generatedFields: [...new Set([...(recipe.provenance?.generatedFields || []), "substitution"])], updatedAt: new Date().toISOString() },
    },
    data: { type: "recipe_substitution", safe: null, summary: `Replaced ${target} with ${replacement}. Review the updated method before cooking.`, warning, source: "text-only" },
  };
}

export async function createRecipeVariant({ recipe, ingredient, substitute }) {
  const base = clampRecipe(recipe);
  const target = String(ingredient || "").trim();
  const replacement = String(substitute || "").trim();
  if (!target || !replacement) throw new Error("Ingredient and substitute are required.");
  const exists = base.ingredients.some(([name]) => String(name).trim().toLowerCase() === target.toLowerCase());
  if (!exists) {
    const error = new Error(`Ingredient "${target}" is not in this recipe.`);
    error.status = 400;
    error.code = "INGREDIENT_NOT_FOUND";
    throw error;
  }

  if (!cloudflareAiConfigured()) {
    const fallback = fallbackReplace(base, target, replacement);
    if (!fallback) throw new Error("Cloudflare AI is unavailable; Kiku can still perform a deterministic text-level substitution.");
    return fallbackVariantResponse(recipe, target, replacement, fallback, "Cloudflare AI was not configured, so Kiku only updated matching ingredient text and did not recalculate cooking behavior.");
  }

  const prompt = [
    "You are Kiku's recipe substitution engine.",
    "Modify one specific ingredient in the supplied recipe while preserving unrelated ingredients and steps.",
    "Assess whether the substitution is broadly reasonable for cooking, but do not claim it is safe for allergies or medical diets.",
    "Adjust quantities only when the substitute genuinely requires a different quantity; otherwise preserve the amount.",
    "Update any affected step instructions, step ingredient references, timing, heat, cues, and tips when necessary.",
    "Do not invent nutrition. Set the resulting nutrition aside; Kiku will remove nutrition when a recipe variant changes ingredients.",
    `Replace ingredient: ${target}`,
    `With: ${replacement}`,
    `Recipe JSON: ${JSON.stringify(base)}`,
  ].join("\n\n");

  const result = await cloudflareChat({
    messages: [
      { role: "system", content: "You are Kiku's recipe substitution engine. Return ONLY valid JSON matching the requested structure. Modify one ingredient while preserving unrelated recipe content. Assess cooking suitability but never claim allergy or medical safety." },
      { role: "user", content: prompt },
    ],
    maxCompletionTokens: 1800,
    temperature: 0.1,
  });
  if (!result) {
    const fallback = fallbackReplace(base, target, replacement);
    if (!fallback) throw new Error("The substitution service is unavailable and no deterministic replacement could be applied.");
    return fallbackVariantResponse(recipe, target, replacement, fallback, "Cloudflare AI was unavailable, so Kiku used a deterministic text-level substitution.");
  }
  const raw = String(result?.choices?.[0]?.message?.content || "").trim();
  if (!raw) {
    const fallback = fallbackReplace(base, target, replacement);
    if (!fallback) throw new Error("Recipe substitution returned no result.");
    return fallbackVariantResponse(recipe, target, replacement, fallback, "Cloudflare AI returned no usable result, so Kiku used a deterministic text-level substitution.");
  }
  let data;
  try { data = JSON.parse(raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "")); } catch { data = null; }
  const updatedIngredients = normalizeAiIngredients(data?.updatedIngredients, base.ingredients);
  const updatedSteps = normalizeAiSteps(data?.updatedSteps, base.steps);
  const replacementName = replacement.toLowerCase();
  const containsReplacement = Boolean(updatedIngredients?.some(([name]) => String(name).trim().toLowerCase() === replacementName));
  if (!updatedIngredients || !updatedSteps || !containsReplacement) {
    const fallback = fallbackReplace(base, target, replacement);
    if (!fallback) throw new Error("Recipe substitution returned invalid structured data.");
    return fallbackVariantResponse(recipe, target, replacement, fallback, "Cloudflare AI returned invalid structured data, so Kiku used a deterministic text-level substitution.");
  }

  const variant = {
    ...recipe,
    ingredients: updatedIngredients,
    steps: updatedSteps,
    nutrition: null,
    substitutions: [{ ingredient: target, substitute: replacement, note: String(data.summary || `Replaced ${target} with ${replacement}.`).slice(0, 500) }],
    provenance: {
      ...(recipe.provenance || {}),
      enrichment: "user-substitution",
      generatedFields: [...new Set([...(recipe.provenance?.generatedFields || []), "substitution", "recipeVariant"])],
      updatedAt: new Date().toISOString(),
    },
  };

  return {
    recipe: variant,
    data: {
      type: "recipe_substitution",
      safe: data.safe === true ? true : data.safe === false ? false : null,
      summary: String(data.summary || `Replaced ${target} with ${replacement}.`).slice(0, 800),
      warning: data.warning ? String(data.warning).slice(0, 800) : "Review this substitution before cooking. Kiku does not claim allergy or medical safety.",
      source: "ai",
      ingredient: target,
      substitute: replacement,
      recipeVariant: variant,
    },
  };
}
