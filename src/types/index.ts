export type MoodName = "Happy" | "Calm" | "Stressed" | "Tired" | "Excited" | "Cozy";

<<<<<<< HEAD
=======
export interface DishComparison {
  item: string;
  delivery: string;
  platform: string;
  total: string;
  eta: string;
}
>>>>>>> ed1a51580aecb4ac5c7cc1166ba8a01e928604dc

export interface Dish {
  name: string;
  restaurant: string;
  restaurantMeta: string;
  descriptor: string;
  price: string;
  time: string;
  rating: string;
  tags: string[];
  art: string;
  artClass: string;
<<<<<<< HEAD
  dietaryTags?: string[];
  allergens?: string[];
  dietaryVerified?: boolean;
  allergenVerified?: boolean;
  allergenFreeVerified?: boolean;
  allergenFreeFor?: string[];
  vegetarianVerified?: boolean;
  veganVerified?: boolean;
  orderOnlineAvailable?: boolean;
  cookAtHomeAvailable?: boolean;
  recipeAvailable?: boolean;
}

=======
  comparison: { swiggy: DishComparison; zomato: DishComparison };
  dietaryTags?: string[];
}

export type DishLike = Pick<Dish, "name" | "restaurant" | "descriptor" | "rating" | "time">;

>>>>>>> ed1a51580aecb4ac5c7cc1166ba8a01e928604dc
export interface RecipeStep {
  name: string;
  instruction: string;
  duration: number;
  displayTime?: string;
  tip: string;
  ingredients: string[];
<<<<<<< HEAD
  heat?: string | null;
  cue?: string | null;
  equipment?: string[];
}

export interface RecipeNutrition {
  perServing?: boolean | null;
  calories?: string | null;
  protein?: string | null;
  carbs?: string | null;
  fat?: string | null;
  fiber?: string | null;
}

export interface RecipeSubstitution {
  ingredient: string;
  substitute: string;
  note?: string | null;
}

export interface RecipeProvenance {
  provider?: string | null;
  providerRecipeId?: string | null;
  enrichment?: string | null;
  generatedFields?: string[];
  sources?: string[];
  updatedAt?: string | null;
}

export interface RecipeDetails {
  id?: string;
  source?: string | null;
  title?: string;
  cuisine?: string;
  rating: string;
  time: string;
  prepTime?: string | null;
  cookTime?: string | null;
  difficulty?: string | null;
=======
}

export interface RecipeDetails {
  cuisine?: string;
  rating: string;
  time: string;
>>>>>>> ed1a51580aecb4ac5c7cc1166ba8a01e928604dc
  servings: string;
  description: string;
  ingredients: [string, string][];
  steps: RecipeStep[];
<<<<<<< HEAD
  equipment?: string[];
  substitutions?: RecipeSubstitution[];
  allergens?: string[];
  allergenVerified?: boolean;
  allergenFreeVerified?: boolean;
  nutrition?: RecipeNutrition | null;
  image?: string | null;
  emoji?: string | null;
  accentClass?: string | null;
  sourceUrl?: string | null;
  prepTimeMinutes?: number | null;
  cookTimeMinutes?: number | null;
  totalTimeMinutes?: number | null;
  servingsCount?: number | null;
  provenance?: RecipeProvenance | null;
=======
>>>>>>> ed1a51580aecb4ac5c7cc1166ba8a01e928604dc
}

export interface RecipeFeedItem {
  id?: string | number;
  slug?: string;
  title?: string;
  name?: string;
  description?: string;
  summary?: string;
  cuisine?: string;
  category?: string;
  time?: string;
  totalTime?: string;
  cookTime?: string;
  image?: string;
  imageUrl?: string;
  thumbnail?: string;
  tags?: string[];
  url?: string;
  link?: string;
<<<<<<< HEAD
  source?: string;
  details?: RecipeDetails | null;
  hasDetails?: boolean;
  dataQuality?: { requiredComplete: boolean; missingRequired: string[]; missingRecommended: string[] };
=======
>>>>>>> ed1a51580aecb4ac5c7cc1166ba8a01e928604dc
}

export interface KikuProfile {
  name: string;
  email?: string;
  avatar?: string | null;
  provider?: string;
}

export interface KikuPreferences {
  dietary: string[];
  allergies: string[];
<<<<<<< HEAD
  cuisines?: string[];
  spiceLevel?: "mild" | "medium" | "spicy" | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  pincode?: string | null;
=======
>>>>>>> ed1a51580aecb4ac5c7cc1166ba8a01e928604dc
}

export interface SavedDish {
  name: string;
  restaurant: string;
  descriptor: string;
  art?: string;
  rating?: string;
  time?: string;
}

export interface SavedRecipe {
  name: string;
  description?: string;
  time?: string;
  cuisine?: string;
  rating?: string;
}

<<<<<<< HEAD
export interface SavedRestaurant { name: string; cuisine?: string; }

export interface KikuSavedItems {
  dishes: SavedDish[];
  recipes: SavedRecipe[];
  restaurants: SavedRestaurant[];
=======
export interface KikuSavedItems {
  dishes: SavedDish[];
  recipes: SavedRecipe[];
>>>>>>> ed1a51580aecb4ac5c7cc1166ba8a01e928604dc
}
