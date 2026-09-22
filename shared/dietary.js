const CANONICAL = new Map([
  ["veg", "vegetarian"], ["vegetarian", "vegetarian"], ["veggie", "vegetarian"],
  ["vegan", "vegan"],
  ["no eggs", "eggs"], ["egg", "eggs"], ["eggs", "eggs"], ["egg-free", "eggs-free"], ["egg free", "eggs-free"],
  ["peanut", "peanuts"], ["peanuts", "peanuts"], ["groundnut", "peanuts"], ["groundnuts", "peanuts"], ["monkey nut", "peanuts"], ["monkey nuts", "peanuts"],
  ["nut", "nuts"], ["nuts", "nuts"], ["tree nut", "tree_nuts"], ["tree nuts", "tree_nuts"],
  ["almond", "tree_nuts"], ["almonds", "tree_nuts"], ["cashew", "tree_nuts"], ["cashews", "tree_nuts"],
  ["walnut", "tree_nuts"], ["walnuts", "tree_nuts"], ["pistachio", "tree_nuts"], ["pistachios", "tree_nuts"],
  ["hazelnut", "tree_nuts"], ["hazelnuts", "tree_nuts"], ["pecan", "tree_nuts"], ["pecans", "tree_nuts"],
  ["dairy", "dairy"], ["milk", "dairy"], ["butter", "dairy"], ["cream", "dairy"], ["cheese", "dairy"], ["lactose", "dairy"], ["casein", "dairy"], ["whey", "dairy"],
  ["gluten", "gluten"], ["wheat", "gluten"], ["barley", "gluten"], ["rye", "gluten"],
  ["soy", "soy"], ["soya", "soy"], ["soybean", "soy"], ["soybeans", "soy"],
  ["shellfish", "shellfish"], ["shrimp", "shellfish"], ["prawn", "shellfish"], ["prawns", "shellfish"], ["crab", "shellfish"], ["lobster", "shellfish"],
  ["fish", "fish"], ["sesame", "sesame"], ["mustard", "mustard"],
]);

const FREE_TAGS = new Map([
  ["egg-free", "eggs"], ["eggs-free", "eggs"],
  ["peanut-free", "peanuts"], ["groundnut-free", "peanuts"],
  ["nut-free", "nuts"], ["tree-nut-free", "tree_nuts"], ["tree-nuts-free", "tree_nuts"],
  ["dairy-free", "dairy"], ["lactose-free", "dairy"],
  ["gluten-free", "gluten"],
  ["soy-free", "soy"],
  ["shellfish-free", "shellfish"], ["fish-free", "fish"],
  ["sesame-free", "sesame"], ["mustard-free", "mustard"],
]);

const list = (value) => Array.isArray(value) ? value : value == null || value === "" ? [] : [value];
const text = (value) => String(value ?? "").trim().toLowerCase();
const canonical = (value) => CANONICAL.get(text(value)) || text(value).replace(/\s+/g, "_");
const unique = (values) => [...new Set(values.map(canonical).filter(Boolean))];
const hasExact = (values, wanted) => values.some((value) => canonical(value) === wanted);
const hasExplicitFalse = (...values) => values.some((value) => value === false);
const ALLERGEN_TERMS = {
  eggs: ["egg", "eggs"],
  peanuts: ["peanut", "peanuts", "groundnut", "groundnuts", "monkey nut", "monkey nuts"],
  nuts: ["nut", "nuts"],
  tree_nuts: ["tree nut", "tree nuts", "almond", "almonds", "cashew", "cashews", "walnut", "walnuts", "pistachio", "pistachios", "hazelnut", "hazelnuts", "pecan", "pecans"],
  dairy: ["milk", "butter", "cream", "cheese", "dairy", "lactose", "casein", "whey"],
  gluten: ["gluten", "wheat", "barley", "rye"],
  soy: ["soy", "soya", "soybean", "soybeans"],
  shellfish: ["shellfish", "shrimp", "prawn", "prawns", "crab", "lobster"],
  fish: ["fish"],
  sesame: ["sesame"],
  mustard: ["mustard"],
};

function allergenOverlaps(left, right) {
  const a = canonical(left);
  const b = canonical(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a === "nuts" && ["peanuts", "tree_nuts"].includes(b)) return true;
  if (b === "nuts" && ["peanuts", "tree_nuts"].includes(a)) return true;
  return false;
}

function parseFreeTags(source) {
  const candidates = [
    ...list(source.tags),
    ...list(source.dietaryTags ?? source.dietary_tags),
    ...list(source.dietary),
  ].map(text).filter(Boolean);
  return [...new Set(candidates.flatMap((tag) => {
    const normalized = tag.replace(/[_\s]+/g, "-");
    const allergen = FREE_TAGS.get(normalized);
    return allergen ? [allergen] : [];
  }))];
}

export function normalizeDietaryEvidence(source = {}) {
  const dietaryVerifiedExplicit = source.dietaryVerified ?? source.dietary_verified;
  const allergenVerifiedExplicit = source.allergenVerified ?? source.allergen_verified;
  const allergenFreeExplicit = source.allergenFree ?? source.allergen_free;

  const explicitTags = list(source.tags).map(text).filter((tag) => ["veg", "vegetarian", "veggie", "vegan"].includes(tag));
  const rawDietaryTags = [
    ...list(source.dietaryTags ?? source.dietary_tags),
    ...list(source.dietary),
    ...explicitTags,
  ];
  const dietaryTags = unique(rawDietaryTags);

  const rawAllergens = source.allergens ?? source.declaredAllergens ?? source.declared_allergens ?? source.containsAllergens ?? source.contains_allergens;
  const allergensProvided = rawAllergens !== undefined && rawAllergens !== null;
  const allergens = unique(list(rawAllergens));
  const freeFor = unique([ ...parseFreeTags(source), ...list(source.allergenFreeFor ?? source.allergen_free_for) ]);

  const explicitVegetarian = source.isVegetarian ?? source.is_vegetarian ?? source.vegetarian;
  const explicitVegan = source.isVegan ?? source.is_vegan ?? source.vegan;
  if (explicitVegetarian === true) dietaryTags.push("vegetarian");
  if (explicitVegan === true) dietaryTags.push("vegan");

  const vegetarianEvidence = explicitVegetarian === true || (explicitVegetarian == null && (dietaryTags.includes("vegetarian") || dietaryTags.includes("vegan")));
  const veganEvidence = explicitVegan === true || (explicitVegan == null && dietaryTags.includes("vegan"));
  const dietaryEvidenceExists = vegetarianEvidence || veganEvidence;
  const dietaryVerified = !hasExplicitFalse(dietaryVerifiedExplicit) && (dietaryVerifiedExplicit === true || dietaryEvidenceExists);

  const contradictoryAllergenState = allergenFreeExplicit === true && allergens.length > 0;
  const allergenVerificationExplicitlyFalse = allergenVerifiedExplicit === false || allergenFreeExplicit === false;
  const safeFreeFor = allergenVerificationExplicitlyFalse ? [] : freeFor;
  const allergenVerified = !hasExplicitFalse(allergenVerifiedExplicit) && !contradictoryAllergenState && (
    allergensProvided || safeFreeFor.length > 0 || allergenFreeExplicit === true
  );
  const allergenFreeVerified = !hasExplicitFalse(allergenVerifiedExplicit, allergenFreeExplicit)
    && !contradictoryAllergenState
    && (allergenFreeExplicit === true || (allergensProvided && allergens.length === 0));

  const normalizedDietaryTags = [...new Set(dietaryTags.map(canonical).filter(Boolean))];

  return {
    dietaryTags: normalizedDietaryTags,
    allergens,
    allergenFreeFor: safeFreeFor,
    dietaryVerified,
    allergenVerified,
    allergenFreeVerified,
    vegetarianVerified: dietaryVerified && vegetarianEvidence,
    veganVerified: dietaryVerified && veganEvidence,
  };
}

export function detectPotentialAllergensFromIngredients(ingredients = [], requestedAllergies = []) {
  const wanted = unique(list(requestedAllergies));
  if (!wanted.length) return [];
  const matches = new Set();
  for (const entry of Array.isArray(ingredients) ? ingredients : []) {
    const name = text(Array.isArray(entry) ? entry[0] : entry);
    if (!name) continue;
    for (const allergen of wanted) {
      const canonicalWanted = canonical(allergen);
      const terms = ALLERGEN_TERMS[canonicalWanted] || [canonicalWanted.replace(/_/g, " ")];
      const found = terms.some((term) => {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`(?:^|\\b)${escaped}(?:$|\\b)`, "i").test(name);
      });
      if (found) matches.add(canonicalWanted);
    }
  }
  return [...matches];
}

export function matchesDietaryFilter(item, { dietary = [], allergies = [], allergenFreeOnly = false } = {}) {
  const evidence = normalizeDietaryEvidence(item);
  const dietaryPreferences = unique(list(dietary));
  const requestedAllergens = unique([...list(allergies), ...(dietaryPreferences.includes("eggs") ? ["eggs"] : [])]);

  if (dietaryPreferences.includes("vegetarian") && !evidence.vegetarianVerified) return false;
  if (dietaryPreferences.includes("vegan") && !evidence.veganVerified) return false;
  if (dietaryPreferences.includes("eggs") && evidence.allergens.some((allergen) => allergenOverlaps(allergen, "eggs"))) return false;

  if (allergenFreeOnly && !evidence.allergenFreeVerified) return false;
  if (requestedAllergens.length) {
    if (requestedAllergens.some((wanted) => evidence.allergens.some((found) => allergenOverlaps(found, wanted)))) return false;
    const fullyCoveredByFreeTags = requestedAllergens.every((wanted) => evidence.allergenFreeFor.some((freeFor) => allergenOverlaps(freeFor, wanted)));
    const freeTagsTrusted = evidence.allergenVerified || fullyCoveredByFreeTags;
    if (!freeTagsTrusted) return false;
  }

  return true;
}

export function filterComparisonOffers(offers, filters = {}) {
  const normalized = Array.isArray(offers) ? offers : [];
  const hasSafetyFilter = Boolean(
    list(filters.dietary).length || list(filters.allergies).length || filters.allergenFreeOnly,
  );
  if (!hasSafetyFilter) return normalized;
  return normalized.filter((offer) => matchesDietaryFilter(offer, filters));
}
