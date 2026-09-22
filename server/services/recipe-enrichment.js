import { cloudflareAiConfigured, cloudflareChat } from "./cloudflare-ai.js";

const ALLOWED_DIFFICULTY = new Set(["easy", "medium", "hard"]);
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_EQUIPMENT_ITEMS = 30;
const MAX_MINUTES = 24 * 60;

function isMissing(value) {
  return value == null || (typeof value === "string" && !value.trim()) || (Array.isArray(value) && value.length === 0);
}

function isGenericDescription(value) {
  return !value || /^(?:[A-Za-z][A-Za-z -]+\s+)?(?:recipe|dessert|main dish|side dish|starter|snack|drink) recipe\.?$/i.test(String(value).trim());
}

function cleanMinutes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_MINUTES) return null;
  return Math.round(n);
}

function cleanServings(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 100) return null;
  return Math.round(n * 10) / 10;
}

function cleanDifficulty(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ALLOWED_DIFFICULTY.has(normalized) ? normalized : null;
}

function cleanText(value, max = 320) {
  const text = String(value || "").trim();
  return text ? text.slice(0, max) : "";
}

function cleanEquipment(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanText(item, 80)).filter(Boolean))].slice(0, MAX_EQUIPMENT_ITEMS);
}

function cleanStepGuidance(value, stepCount) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => ({
      index: Number.isInteger(Number(entry?.index)) ? Number(entry.index) : -1,
      duration: cleanMinutes(entry?.duration),
      heat: cleanText(entry?.heat, 80),
      cue: cleanText(entry?.cue, 180),
      tip: cleanText(entry?.tip, 180),
      equipment: cleanEquipment(entry?.equipment),
    }))
    .filter((entry) => entry.index >= 0 && entry.index < stepCount)
    .slice(0, stepCount);
}

function missingFields(recipe) {
  const missing = [];
  if (recipe?.prepTimeMinutes == null) missing.push("prepTimeMinutes");
  if (recipe?.cookTimeMinutes == null) missing.push("cookTimeMinutes");
  if (recipe?.totalTimeMinutes == null) missing.push("totalTimeMinutes");
  if (recipe?.servingsCount == null) missing.push("servingsCount");
  if (!recipe?.difficulty) missing.push("difficulty");
  if (!(recipe?.equipment || []).length) missing.push("equipment");
  if (isGenericDescription(recipe?.description)) missing.push("description");
  if ((recipe?.steps || []).some((step) => !step?.duration || !step?.heat || !step?.cue)) missing.push("stepGuidance");
  return [...new Set(missing)];
}

function parseModelJson(content) {
  if (content && typeof content === "object") return content;
  const text = String(content || "").trim();
  if (!text) return null;
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(unfenced); } catch { return null; }
}

function applyMissingFields(recipe, raw) {
  const result = structuredClone(recipe);
  const generatedFields = [];

  const prep = cleanMinutes(raw?.prepTimeMinutes);
  if (result.prepTimeMinutes == null && prep != null) { result.prepTimeMinutes = prep; generatedFields.push("prepTimeMinutes"); }

  const cook = cleanMinutes(raw?.cookTimeMinutes);
  if (result.cookTimeMinutes == null && cook != null) { result.cookTimeMinutes = cook; generatedFields.push("cookTimeMinutes"); }

  const total = cleanMinutes(raw?.totalTimeMinutes);
  if (result.totalTimeMinutes == null && total != null) { result.totalTimeMinutes = total; generatedFields.push("totalTimeMinutes"); }
  else if (result.totalTimeMinutes == null && prep != null && cook != null) { result.totalTimeMinutes = prep + cook; generatedFields.push("totalTimeMinutes"); }

  const servings = cleanServings(raw?.servingsCount);
  if (result.servingsCount == null && servings != null) { result.servingsCount = servings; result.servings = `${servings} servings`; generatedFields.push("servingsCount"); }

  const difficulty = cleanDifficulty(raw?.difficulty);
  if (!result.difficulty && difficulty) { result.difficulty = difficulty; generatedFields.push("difficulty"); }

  const equipment = cleanEquipment(raw?.equipment);
  if (!(result.equipment || []).length && equipment.length) { result.equipment = equipment; generatedFields.push("equipment"); }

  const description = cleanText(raw?.description, MAX_DESCRIPTION_LENGTH);
  if (isGenericDescription(result.description) && description) { result.description = description; generatedFields.push("description"); }

  const guidance = cleanStepGuidance(raw?.stepGuidance, Array.isArray(result.steps) ? result.steps.length : 0);
  if (guidance.length && Array.isArray(result.steps)) {
    const nextSteps = result.steps.map((step, index) => {
      const incoming = guidance.find((entry) => entry.index === index);
      if (!incoming) return step;
      const updated = { ...step };
      let changed = false;
      if (!updated.duration && incoming.duration != null) { updated.duration = incoming.duration; changed = true; }
      if (!updated.heat && incoming.heat) { updated.heat = incoming.heat; changed = true; }
      if (!updated.cue && incoming.cue) { updated.cue = incoming.cue; changed = true; }
      if (!updated.tip && incoming.tip) { updated.tip = incoming.tip; changed = true; }
      if (!(updated.equipment || []).length && incoming.equipment.length) { updated.equipment = incoming.equipment; changed = true; }
      if (changed) return updated;
      return step;
    });
    if (JSON.stringify(nextSteps) !== JSON.stringify(result.steps)) {
      result.steps = nextSteps;
      generatedFields.push("stepGuidance");
    }
  }

  if (!generatedFields.length) return { recipe, generatedFields };

  result.provenance = {
    ...(result.provenance || {}),
    enrichment: "ai-inferred",
    generatedFields: [...new Set([...(result.provenance?.generatedFields || []), ...generatedFields])],
    enrichmentProvider: "cloudflare-workers-ai",
    updatedAt: new Date().toISOString(),
  };
  result.enrichmentNotice = "Some missing recipe details were inferred by Kiku from the provider recipe. They are not provider-verified facts.";
  return { recipe: result, generatedFields };
}

export async function enrichRecipeWithWeb(recipe) {
  const missing = missingFields(recipe);
  if (!recipe || !missing.length) {
    return { recipe, enriched: false, sources: [], generatedFields: [] };
  }

  if (!cloudflareAiConfigured()) {
    return {
      recipe,
      enriched: false,
      sources: [],
      generatedFields: [],
      notes: ["Cloudflare Workers AI is not configured; unavailable recipe details were left unchanged."],
    };
  }

  const sourceRecipe = {
    title: recipe.title,
    cuisine: recipe.cuisine,
    category: recipe.category,
    description: recipe.description,
    ingredients: recipe.ingredients,
    steps: (recipe.steps || []).map((step, index) => ({
      index,
      name: step?.name || `Step ${index + 1}`,
      instruction: step?.instruction || "",
      duration: step?.duration ?? null,
      heat: step?.heat ?? null,
      cue: step?.cue ?? null,
      tip: step?.tip ?? null,
      equipment: step?.equipment || [],
    })),
    missingFields: missing,
  };

  const messages = [
    {
      role: "system",
      content: [
        "You are Kiku's recipe-detail assistant.",
        "Fill only missing recipe metadata by reasoning from the provider recipe supplied below.",
        "Do not rewrite, replace, shorten, or reinterpret existing ingredients or cooking instructions.",
        "Never provide nutrition, allergen, allergy-safety, dietary-verification, or food-safety claims.",
        "Return null or [] when a missing field cannot be reasonably inferred.",
        "Times must be whole positive minutes. Difficulty must be easy, medium, or hard.",
        "Step guidance may only add missing duration, heat, cue, tip, or equipment to existing step indexes.",
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify(sourceRecipe),
    },
  ];

  const response = await cloudflareChat({
    messages,
    temperature: 0,
    maxCompletionTokens: 1200,
    responseFormat: { type: "json_object" },
    user: "kiku-recipe-enrichment",
  });

  const content = response?.choices?.[0]?.message?.content;
  const parsed = parseModelJson(content);
  if (!parsed) {
    return { recipe, enriched: false, sources: [], generatedFields: [], notes: ["AI enrichment returned no usable structured data."] };
  }

  const applied = applyMissingFields(recipe, parsed);
  return {
    recipe: applied.recipe,
    enriched: applied.generatedFields.length > 0,
    sources: [],
    generatedFields: applied.generatedFields,
    notes: applied.generatedFields.length
      ? ["AI-inferred recipe details are not provider-verified facts."]
      : ["No additional recipe details could be safely inferred."],
  };
}
