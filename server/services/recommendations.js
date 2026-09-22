import { listDishes } from "../catalog.js";
import { matchesDietaryFilter } from "../../shared/dietary.js";

function text(value) { return String(value || "").toLowerCase(); }

function scoreDish(dish, context) {
  const haystack = [dish.name, dish.restaurant, dish.descriptor, ...(dish.tags || []), ...(dish.dietaryTags || [])].join(" ").toLowerCase();
  const reasons = [];
  let score = 0;

  const dietary = [...(context.dietary || []), ...(context.diet ? [context.diet] : [])].map(text);
  if (!matchesDietaryFilter(dish, { dietary, allergies: context.allergies || [] })) return { allowed: false, score: -1000, reasons: [] };

  dietary.forEach((preference) => {
    if (preference === "vegetarian" || preference === "veg") {
      if (/vegetarian|veg/.test(haystack)) { score += 8; reasons.push("Matches your vegetarian preference"); }
      if (/chicken|mutton|egg|fish|prawn|meat|non-veg/.test(haystack)) score -= 8;
    } else if (preference === "vegan" && /chicken|mutton|egg|dairy|paneer|butter|cream/.test(haystack)) {
      score -= 12;
    } else if (preference === "no eggs" && /egg/.test(haystack)) {
      score -= 12;
    } else if (preference && haystack.includes(preference)) {
      score += 5; reasons.push(`Matches your ${preference} preference`);
    }
  });

  if (context.cuisines?.length) {
    const matchedCuisine = context.cuisines.find((item) => haystack.includes(text(item)));
    if (matchedCuisine) { score += 7; reasons.push(`Matches your ${matchedCuisine} cuisine preference`); }
  }

  if (context.craving && haystack.includes(text(context.craving))) {
    score += 8; reasons.push(`Matches your ${context.craving} craving`);
  }

  const numericPrice = Number(String(dish.price || "").replace(/[^0-9.]/g, ""));
  if (context.budget?.max != null && Number.isFinite(numericPrice)) {
    if (numericPrice <= context.budget.max) { score += 7; reasons.push(`Fits your ₹${context.budget.max} budget`); }
    else score -= 8;
  }
  if (context.budget?.min != null && Number.isFinite(numericPrice) && numericPrice >= context.budget.min) score += 2;


  const spice = text(context.spiceLevel);
  if (spice) {
    const spicy = /spicy|spiced|chili|chilli|hot|masala/.test(haystack);
    const mild = /mild|gentle|light/.test(haystack);
    if (spice === "spicy" && spicy) { score += 5; reasons.push("Matches your spicy preference"); }
    else if (spice === "mild" && mild) { score += 5; reasons.push("Matches your mild-spice preference"); }
    else if (spice === "medium" && !mild) score += 2;
  }

  const savedNames = new Set((context.savedItems || []).map((item) => text(item?.entity?.name || item?.entityKey)).filter(Boolean));
  if (savedNames.has(text(dish.name))) { score += 8; reasons.push("You saved this dish"); }

  const recent = context.recentInteractions || [];
  const recentRestaurant = recent.some((event) => text(event?.metadata?.restaurant) === text(dish.restaurant));
  if (recentRestaurant) { score += 3; reasons.push("Matches restaurants you've explored recently"); }

  const moodMap = {
    happy: ["sweet", "quick", "italian", "thai"],
    calm: ["comfort", "warm", "japanese"],
    stressed: ["comfort", "rich", "creamy"],
    tired: ["comfort", "quick", "warm"],
    excited: ["thai", "spicy", "italian"],
    cozy: ["comfort", "rich", "creamy"],
  };
  const mood = text(context.manualMood || context.expressionSignal?.label);
  const moodTerms = moodMap[mood] || [];
  if (moodTerms.some((term) => haystack.includes(term))) {
    score += 6;
    reasons.push(`Fits your ${context.manualMood || context.expressionSignal?.label} moment`);
  }

  return { allowed: score > -50, score, reasons: [...new Set(reasons)].slice(0, 3) };
}

export async function buildRecommendations(context = {}) {
  const dishes = await listDishes({ pincode: context.pincode || null, limit: 100, dietary: [...(context.dietary || []), ...(context.diet ? [context.diet] : [])], allergies: context.allergies || [] });
  const results = dishes
    .map((dish, index) => ({ dish, ...scoreDish(dish, context), index }))
    .filter((entry) => entry.allowed)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, context.limit || 6)
    .map(({ dish, score, reasons }) => ({ dish, score: Math.max(0, Math.min(1, 0.5 + score / 40)), reasons }));
  return results;
}
