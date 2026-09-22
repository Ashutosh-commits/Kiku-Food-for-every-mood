import test from "node:test";
import assert from "node:assert/strict";
import { buildRecipeSummary, parseInstructions } from "../services/recipe-parser.js";

const ingredients = [
  ["Vegetable Oil", "250ml"],
  ["Plain Flour", "260g"],
  ["Caster Sugar", "400g"],
  ["Baking Powder", "1 tsp"],
  ["Carrots", "2 medium"],
  ["Eggs", "2"],
  ["Milk", "250ml"],
  ["Cocoa Powder", "30g"],
];

test("recipe parser turns explicit step markers into usable cooking steps", () => {
  const steps = parseInstructions(
    "step 1 Heat the oven to 180C. Oil and line the cake tin. Mix flour, sugar and baking powder together. step 2 Pour the batter into the cake tin. Bake for 45 mins.",
    ingredients,
  );
  assert.equal(steps.length, 2);
  assert.equal(steps[0].instruction.startsWith("Heat the oven"), true);
  assert.equal(/^step\\s*1$/i.test(steps[0].instruction), false);
  assert.equal(steps[0].ingredients.includes("Vegetable Oil"), true);
  assert.equal(steps[0].ingredients.includes("Plain Flour"), true);
  assert.equal(steps[0].ingredients.includes("Baking Powder"), true);
  assert.equal(steps[0].ingredients.includes("Cocoa Powder"), false);
  assert.equal(steps[1].ingredients.length, 0);
});

test("recipe summary never falls back to the first cooking instruction", () => {
  const summary = buildRecipeSummary({ strMeal: "Brazilian carrot cake", strArea: "Brazil", strCategory: "Dessert", strInstructions: "step 1 Heat the oven to 180C." });
  assert.equal(summary, "Brazil dessert recipe.");
  assert.doesNotMatch(summary, /step 1|heat the oven/i);
});
