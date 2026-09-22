<<<<<<< HEAD
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
=======
import type { DishLike, RecipeDetails, RecipeFeedItem } from "../types";

export const recipeApiUrl = import.meta.env.VITE_RECIPES_API_URL || "/api/recipes";

// Temporary local feed used only when the live recipe API is unavailable or
// returns no usable recipes. The same normalized shape is used by the API
// feed, so this fallback can be removed later without changing the UI.
export const fallbackRecipes: RecipeFeedItem[] = [
  {
    id: "fallback-paneer-tikka",
    title: "Paneer Tikka",
    description: "Smoky paneer cubes marinated in warming spices and charred until tender.",
    cuisine: "North Indian",
    time: "30 min",
    image: "",
    tags: ["Vegetarian", "Spicy"],
    url: "/recipes/paneer-tikka",
  },
  {
    id: "fallback-butter-chicken",
    title: "Butter Chicken",
    description: "Tender chicken simmered in a rich, creamy tomato gravy with gentle warming spices.",
    cuisine: "North Indian",
    time: "40 min",
    image: "",
    tags: ["Comfort", "Rich"],
    url: "/recipes/butter-chicken",
  },
  {
    id: "fallback-miso-ramen",
    title: "Miso Ramen",
    description: "Warm miso broth with noodles and comforting toppings for an easy, satisfying bowl.",
    cuisine: "Japanese",
    time: "25 min",
    image: "",
    tags: ["Comfort", "Quick"],
    url: "/recipes/miso-ramen",
  },
  {
    id: "fallback-margherita-pizza",
    title: "Margherita Pizza",
    description: "A simple, classic pizza with tomato, mozzarella, basil, and a crisp golden crust.",
    cuisine: "Italian",
    time: "35 min",
    image: "",
    tags: ["Italian", "Quick"],
    url: "/recipes/margherita-pizza",
  },
  {
    id: "fallback-chocolate-cake",
    title: "Chocolate Cake",
    description: "Soft, rich chocolate cake for the moments when a little sweetness is exactly right.",
    cuisine: "Dessert",
    time: "45 min",
    image: "",
    tags: ["Sweet", "Treat"],
    url: "/recipes/chocolate-cake",
  },
  {
    id: "fallback-chicken-biryani",
    title: "Chicken Biryani",
    description: "Fragrant rice layered with spiced chicken for a comforting, aromatic one-pot classic.",
    cuisine: "North Indian",
    time: "50 min",
    image: "",
    tags: ["Bestseller", "Comfort"],
    url: "/recipes/chicken-biryani",
  },
];

export const normalizeRecipe = (item: RecipeFeedItem, index: number): RecipeFeedItem => ({
>>>>>>> ed1a51580aecb4ac5c7cc1166ba8a01e928604dc
  id: item?.id ?? item?.slug ?? item?.url ?? `recipe-${index}`,
  title: item?.title ?? item?.name ?? "Untitled recipe",
  description: item?.description ?? item?.summary ?? "",
  cuisine: item?.cuisine ?? item?.category ?? "",
  time: item?.time ?? item?.totalTime ?? item?.cookTime ?? "",
  image: item?.image ?? item?.imageUrl ?? item?.thumbnail ?? "",
  tags: Array.isArray(item?.tags) ? item.tags : [],
<<<<<<< HEAD
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
=======
  url: item?.url ?? item?.link ?? (item?.slug ? `/recipes/${encodeURIComponent(item.slug)}` : "#"),
});

// Step-by-step recipe content used by the Recipe Page and Cooking Mode cards.
// Keyed by dish/recipe title so both the "Cook" button on a dish card and the
// "View recipe" button on a live recipe card can open the same guided flow.
export const recipeTemplates: Record<string, RecipeDetails> = {
  "Butter Chicken": {
    rating: "4.9 (1.2k)",
    time: "40 minutes",
    servings: "4 servings",
    description: "A classic North Indian dish with tender chicken in a rich, creamy tomato gravy. Perfect with naan or rice.",
    ingredients: [
      ["Chicken (boneless)", "500 g"],
      ["Tomato puree", "1 cup"],
      ["Onion (finely chopped)", "1 cup"],
      ["Ginger garlic paste", "2 tbsp"],
      ["Fresh cream", "1/2 cup"],
    ],
    steps: [
      { name: "Prep", instruction: "Prepare the chicken, aromatics, and spices.", duration: 0, tip: "Have every ingredient measured before you begin.", ingredients: ["Chicken (boneless)", "Onion (finely chopped)", "Ginger garlic paste"] },
      { name: "Sauté", instruction: "Sauté the onion and ginger garlic paste until fragrant.", duration: 0, tip: "Keep the heat medium so the aromatics soften without burning.", ingredients: ["Onion (finely chopped)", "Ginger garlic paste"] },
      { name: "Simmer", instruction: "Add the tomato puree and simmer for 8–10 minutes.", duration: 480, displayTime: "08:00", tip: "Simmer on low heat to get a richer, creamier texture and deeper flavour.", ingredients: ["Tomato puree"] },
      { name: "Spices", instruction: "Stir in the spices and cook until aromatic.", duration: 0, tip: "Toast spices briefly to release their aroma.", ingredients: [] },
      { name: "Cook", instruction: "Add the chicken and cook until tender and fully cooked.", duration: 600, displayTime: "10:00", tip: "Keep the sauce gently bubbling while the chicken cooks through.", ingredients: ["Chicken (boneless)"] },
      { name: "Finish", instruction: "Fold in fresh cream and adjust seasoning.", duration: 0, tip: "Add the cream at the end for a smooth, glossy finish.", ingredients: ["Fresh cream"] },
      { name: "Plate", instruction: "Spoon the butter chicken into a warm serving bowl.", duration: 0, tip: "Warm the serving dish so the sauce stays silky at the table.", ingredients: [] },
      { name: "Enjoy", instruction: "Garnish and serve with naan or rice.", duration: 0, tip: "Finish with fresh coriander and a small swirl of cream.", ingredients: [] },
    ],
  },
  "Paneer Tikka": {
    rating: "4.5 (980)",
    time: "30 minutes",
    servings: "2 servings",
    description: "Smoky paneer cubes marinated with warming spices and charred until tender.",
    ingredients: [
      ["Paneer", "400 g"],
      ["Hung curd", "1 cup"],
      ["Ginger garlic paste", "1 tbsp"],
      ["Tandoori spice", "2 tbsp"],
      ["Bell pepper", "1 cup"],
    ],
    steps: [
      { name: "Prep", instruction: "Cut paneer and vegetables into even pieces.", duration: 0, tip: "Keep pieces similar in size for even cooking.", ingredients: ["Paneer", "Bell pepper"] },
      { name: "Marinate", instruction: "Coat paneer and vegetables in the spiced yogurt marinade.", duration: 0, tip: "Rest the marinade for at least 15 minutes.", ingredients: ["Paneer", "Hung curd", "Ginger garlic paste", "Tandoori spice"] },
      { name: "Rest", instruction: "Let the marinade settle into the paneer.", duration: 900, displayTime: "15:00", tip: "A short resting period helps the flavours reach the centre.", ingredients: [] },
      { name: "Skewer", instruction: "Thread paneer and vegetables onto skewers.", duration: 0, tip: "Leave small gaps so the edges char nicely.", ingredients: ["Paneer", "Bell pepper"] },
      { name: "Grill", instruction: "Grill until lightly charred on all sides.", duration: 420, displayTime: "07:00", tip: "Turn frequently for even browning.", ingredients: [] },
      { name: "Finish", instruction: "Brush with butter and squeeze over lemon.", duration: 0, tip: "Finish while hot for the best gloss and aroma.", ingredients: [] },
      { name: "Plate", instruction: "Serve with chutney and onion rings.", duration: 0, tip: "A warm plate keeps the paneer tender.", ingredients: [] },
      { name: "Enjoy", instruction: "Serve immediately.", duration: 0, tip: "Paneer tikka is best straight from the grill.", ingredients: [] },
    ],
  },
};

// Accepts either a discovery `dish` ({ name, rating, descriptor, restaurant })
// or a live recipe-feed item adapted to that same shape (see openRecipeFromFeed
// below) and returns full step-by-step recipe content for the Recipe Page.
export function getRecipeForDish(dish: DishLike): RecipeDetails {
  const exact = recipeTemplates[dish.name];
  if (exact) return exact;
  return {
    rating: `${dish.rating} (${dish.rating === "4.8" ? "900+" : "700+"})`,
    time: dish.time,
    servings: "2 servings",
    description: `${dish.descriptor}. A Kiku recipe designed around the flavours of ${dish.restaurant}.`,
    ingredients: [
      ["Main ingredient", "400 g"],
      ["Aromatics", "1 cup"],
      ["Sauce or base", "1 cup"],
      ["Spice blend", "2 tbsp"],
      ["Fresh garnish", "1/2 cup"],
    ] as [string, string][],
    steps: [
      { name: "Prep", instruction: "Prepare all ingredients and set up your cooking space.", duration: 0, tip: "Measure everything before you start.", ingredients: [] },
      { name: "Sauté", instruction: "Cook the aromatics until fragrant.", duration: 0, tip: "Use medium heat to build flavour gently.", ingredients: [] },
      { name: "Cook", instruction: "Add the main ingredients and cook until tender.", duration: 480, displayTime: "08:00", tip: "Keep the heat steady for even cooking.", ingredients: [] },
      { name: "Season", instruction: "Add the spice blend and adjust seasoning.", duration: 0, tip: "Taste before adding more salt.", ingredients: [] },
      { name: "Finish", instruction: "Finish with sauce or fresh garnish.", duration: 0, tip: "A final fresh element lifts the whole dish.", ingredients: [] },
      { name: "Plate", instruction: "Plate neatly and wipe the rim.", duration: 0, tip: "Warm plates make the dish feel more polished.", ingredients: [] },
      { name: "Garnish", instruction: "Add the final garnish.", duration: 0, tip: "Keep the garnish light and fresh.", ingredients: [] },
      { name: "Enjoy", instruction: "Serve immediately.", duration: 0, tip: "Serve while hot for the best texture.", ingredients: [] },
    ],
>>>>>>> ed1a51580aecb4ac5c7cc1166ba8a01e928604dc
  };
}
