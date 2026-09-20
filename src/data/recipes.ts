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
  id: item?.id ?? item?.slug ?? item?.url ?? `recipe-${index}`,
  title: item?.title ?? item?.name ?? "Untitled recipe",
  description: item?.description ?? item?.summary ?? "",
  cuisine: item?.cuisine ?? item?.category ?? "",
  time: item?.time ?? item?.totalTime ?? item?.cookTime ?? "",
  image: item?.image ?? item?.imageUrl ?? item?.thumbnail ?? "",
  tags: Array.isArray(item?.tags) ? item.tags : [],
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
  };
}
