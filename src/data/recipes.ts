import type { RecipeDetails, RecipeFeedItem, RecipeStep } from "../types";


function cleanStepText(value: unknown): string {
  return String(value ?? "")
    .replace(/^\s*step\s*\d+\s*[:.)-]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedIngredientPhrases(name: string): string[] {
  const normalized = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return [];
  const terms = new Set<string>([normalized]);
  if (normalized.endsWith("ies") && normalized.length > 4) terms.add(`${normalized.slice(0, -3)}y`);
  else if (normalized.endsWith("ves") && normalized.length > 4) terms.add(`${normalized.slice(0, -3)}f`);
  else if (normalized.endsWith("s") && !normalized.endsWith("ss") && normalized.length > 3) terms.add(normalized.slice(0, -1));
  return [...terms];
}

export function inferStepIngredients(instruction: string, ingredients: [string, string][]): string[] {
  const text = ` ${String(instruction || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim()} `;
  if (!text.trim()) return [];
  const entries = (Array.isArray(ingredients) ? ingredients : []).map(([name]) => ({ name, normalized: String(name || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim() }));
  const lastWordCounts = new Map<string, number>();
  entries.forEach(({ normalized }) => {
    const last = normalized.split(" ").slice(-1)[0] || "";
    if (last.length >= 3) lastWordCounts.set(last, (lastWordCounts.get(last) || 0) + 1);
    const singular = last.endsWith("ies") && last.length > 4 ? `${last.slice(0, -3)}y` : last.endsWith("ves") && last.length > 4 ? `${last.slice(0, -3)}f` : last.endsWith("s") && !last.endsWith("ss") && last.length > 3 ? last.slice(0, -1) : last;
    if (singular && singular !== last) lastWordCounts.set(singular, (lastWordCounts.get(singular) || 0) + 1);
  });
  return entries.filter(({ name, normalized }) => {
    const exact = normalizedIngredientPhrases(name).some((term) => {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`\\b${escaped}\\b`, "i").test(text);
    });
    if (exact) return true;
    const lastRaw = normalized.split(" ").slice(-1)[0] || "";
    const last = lastRaw.endsWith("ies") && lastRaw.length > 4 ? `${lastRaw.slice(0, -3)}y` : lastRaw.endsWith("ves") && lastRaw.length > 4 ? `${lastRaw.slice(0, -3)}f` : lastRaw.endsWith("s") && !lastRaw.endsWith("ss") && lastRaw.length > 3 ? lastRaw.slice(0, -1) : lastRaw;
    if (!last || last.length < 3 || (lastWordCounts.get(last) || 0) !== 1) return false;
    const escaped = last.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(text);
  }).map(({ name }) => name);
}

export const normalizeRecipe = (item: RecipeFeedItem, index: number): RecipeFeedItem => ({
  ...item,
  id: item?.id ?? item?.slug ?? item?.url ?? `recipe-${index}`,
  title: item?.title ?? item?.name ?? "Untitled recipe",
  description: item?.description ?? item?.summary ?? "",
  cuisine: item?.cuisine ?? item?.category ?? "",
  time: item?.time ?? item?.totalTime ?? item?.cookTime ?? "",
  image: item?.image ?? item?.imageUrl ?? item?.thumbnail ?? "",
  tags: Array.isArray(item?.tags) ? item.tags : [],
  url: item?.url ?? item?.link ?? null,
});

export function parseServingCount(servings: string | number | null | undefined, fallback = 2): number {
  const value = Number.parseFloat(String(servings || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function scaleIngredientAmount(amount: string, baseServings: number, targetServings: number): string {
  if (!amount || !Number.isFinite(baseServings) || baseServings <= 0 || !Number.isFinite(targetServings) || targetServings <= 0) return amount;
  const ratio = targetServings / baseServings;
  if (Math.abs(ratio - 1) < 0.0001) return amount;

  const parseLeadingNumber = (token: string) => {
    const mixed = token.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
    const fraction = token.match(/^(\d+)\/(\d+)$/);
    if (fraction) return Number(fraction[1]) / Number(fraction[2]);
    return Number.parseFloat(token);
  };

  const formatNumber = (value: number) => {
    const rounded = Math.round(value * 100) / 100;
    const common = [
      [0.25, "1/4"], [0.333, "1/3"], [0.5, "1/2"], [0.667, "2/3"], [0.75, "3/4"],
      [1.25, "1 1/4"], [1.333, "1 1/3"], [1.5, "1 1/2"], [1.667, "1 2/3"], [1.75, "1 3/4"],
      [2.5, "2 1/2"], [3.5, "3 1/2"], [4.5, "4 1/2"],
    ] as const;
    const match = common.find(([valueRef]) => Math.abs(rounded - valueRef) < 0.02);
    if (match) return match[1];
    if (Number.isInteger(rounded)) return String(rounded);
    return String(rounded).replace(/0+$/, "").replace(/\.$/, "");
  };

  const match = amount.match(/^\s*((?:\d+\s+)?\d+(?:\/\d+)?|\d*\.\d+)\s*(.*)$/);
  if (!match) return amount;
  const numeric = parseLeadingNumber(match[1]);
  if (!Number.isFinite(numeric)) return amount;
  return `${formatNumber(numeric * ratio)}${match[2] ? ` ${match[2].trim()}` : ""}`;
}

export function normalizeRecipeDetails(details: RecipeDetails, context: Partial<RecipeFeedItem> = {}): RecipeDetails {
  const baseIngredients = Array.isArray(details?.ingredients) ? details.ingredients : [];
  const steps: RecipeStep[] = Array.isArray(details?.steps)
    ? details.steps.map((step, index) => {
        const rawName = cleanStepText(step?.name);
        const instruction = cleanStepText(step?.instruction);
        const meaningful = instruction && !/^step\s*\d+$/i.test(instruction);
        if (!meaningful) return null;
        const fallbackName = instruction.split(/(?<=[.!?])\s+/)[0].slice(0, 58).trim() || `Step ${index + 1}`;
        const explicitIngredients = Array.isArray(step?.ingredients) ? step.ingredients.filter(Boolean) : [];
        return {
          ...step,
          name: rawName && !/^step\s*\d+$/i.test(rawName) ? rawName : fallbackName,
          instruction,
          duration: Number.isFinite(step?.duration) ? step.duration : 0,
          tip: step?.tip || "",
          ingredients: explicitIngredients.length ? explicitIngredients : inferStepIngredients(instruction, baseIngredients),
          heat: step?.heat ?? null,
          cue: step?.cue ?? null,
          equipment: Array.isArray(step?.equipment) ? step.equipment : [],
        };
      }).filter(Boolean) as RecipeStep[]
    : [];

  return {
    ...details,
    cuisine: details?.cuisine || context.cuisine || "",
    rating: details?.rating || "Not provided by source",
    time: details?.time || context.time || "",
    servings: details?.servings || "Not provided by source",
    description: details?.description || context.description || "",
    ingredients: Array.isArray(details?.ingredients) ? details.ingredients : [],
    steps,
    equipment: Array.isArray(details?.equipment) ? details.equipment : [],
    substitutions: Array.isArray(details?.substitutions) ? details.substitutions : [],
    allergens: Array.isArray(details?.allergens) ? details.allergens : [],
    allergenVerified: details?.allergenVerified === true,
    allergenFreeVerified: details?.allergenFreeVerified === true,
    nutrition: details?.nutrition ?? null,
    image: details?.image ?? context.image ?? null,
    sourceUrl: details?.sourceUrl ?? context.url ?? null,
  };
}
