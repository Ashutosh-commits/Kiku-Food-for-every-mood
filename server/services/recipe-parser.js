function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singularizeWord(value) {
  const word = normalizeText(value);
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("ves") && word.length > 4) return `${word.slice(0, -3)}f`;
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) return word.slice(0, -1);
  return word;
}

function ingredientPhrases(name) {
  const normalized = normalizeText(name);
  if (!normalized) return [];
  return [...new Set([normalized, singularizeWord(normalized)])];
}

function exactIngredientMention(name, instruction) {
  const normalizedInstruction = ` ${normalizeText(instruction)} `;
  return ingredientPhrases(name).some((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(normalizedInstruction);
  });
}

function deriveStepIngredients(ingredients, instruction) {
  if (!instruction || !Array.isArray(ingredients)) return [];
  const entries = ingredients.map(([name]) => ({ name, normalized: normalizeText(name) }));
  const lastWordCounts = new Map();
  entries.forEach(({ normalized }) => {
    const last = normalized.split(" ").at(-1) || "";
    if (last.length >= 3) lastWordCounts.set(last, (lastWordCounts.get(last) || 0) + 1);
    const singular = singularizeWord(last);
    if (singular && singular !== last) lastWordCounts.set(singular, (lastWordCounts.get(singular) || 0) + 1);
  });
  const normalizedInstruction = ` ${normalizeText(instruction)} `;
  return entries.filter(({ name, normalized }) => {
    if (exactIngredientMention(name, instruction)) return true;
    const last = singularizeWord(normalized.split(" ").at(-1) || "");
    if (!last || last.length < 3 || (lastWordCounts.get(last) || 0) !== 1) return false;
    const escaped = last.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(normalizedInstruction);
  }).map(({ name }) => name);
}

function stepTitle(instruction, index) {
  const clean = String(instruction || "").replace(/^\s*step\s*\d+\s*[:.)-]?\s*/i, "").trim();
  if (!clean) return `Step ${index + 1}`;
  const firstSentence = clean.split(/(?<=[.!?])\s+/)[0].trim();
  const candidate = firstSentence || clean;
  return candidate.length <= 58 ? candidate : `${candidate.slice(0, 55).trimEnd()}…`;
}

function splitExplicitSteps(raw) {
  const text = String(raw || "").replace(/\r/g, "").replace(/\s+/g, " ").trim();
  if (!text) return [];
  const markers = [...text.matchAll(/\bstep\s*(\d+)\s*[:.)-]?\s*/gi)];
  if (markers.length >= 2) {
    return markers.map((match, index) => {
      const start = match.index + match[0].length;
      const end = index + 1 < markers.length ? markers[index + 1].index : text.length;
      return text.slice(start, end).trim();
    }).filter(Boolean);
  }
  const numberedLines = String(raw || "")
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:\d+|[-*•])(?:[.)\-:]|\s+)\s*/, "").trim())
    .filter(Boolean);
  return numberedLines.length > 1 ? numberedLines : [text];
}

export function parseInstructions(raw, ingredients = []) {
  return splitExplicitSteps(raw)
    .map((instruction) => instruction.replace(/^\s*step\s*\d+\s*[:.)-]?\s*/i, "").trim())
    .filter((instruction) => instruction.length > 5)
    .map((instruction, index) => ({
      name: stepTitle(instruction, index),
      instruction,
      duration: 0,
      tip: "",
      ingredients: deriveStepIngredients(ingredients, instruction),
      heat: null,
      cue: null,
      equipment: [],
    }));
}

export function buildRecipeSummary(meal) {
  const provided = String(meal?.strDescription || meal?.strSummary || "").trim();
  if (provided) return provided.slice(0, 420);
  const area = String(meal?.strArea || "").trim();
  const category = String(meal?.strCategory || "").trim().toLowerCase();
  if (area && category) return `${area} ${category} recipe.`;
  if (category) return `${category.charAt(0).toUpperCase()}${category.slice(1)} recipe.`;
  if (area) return `${area} recipe.`;
  return "Recipe provided by TheMealDB.";
}
