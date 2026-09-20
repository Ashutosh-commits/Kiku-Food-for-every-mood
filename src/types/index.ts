export type MoodName = "Happy" | "Calm" | "Stressed" | "Tired" | "Excited" | "Cozy";

export interface DishComparison {
  item: string;
  delivery: string;
  platform: string;
  total: string;
  eta: string;
}

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
  comparison: { swiggy: DishComparison; zomato: DishComparison };
  dietaryTags?: string[];
}

export type DishLike = Pick<Dish, "name" | "restaurant" | "descriptor" | "rating" | "time">;

export interface RecipeStep {
  name: string;
  instruction: string;
  duration: number;
  displayTime?: string;
  tip: string;
  ingredients: string[];
}

export interface RecipeDetails {
  cuisine?: string;
  rating: string;
  time: string;
  servings: string;
  description: string;
  ingredients: [string, string][];
  steps: RecipeStep[];
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

export interface KikuSavedItems {
  dishes: SavedDish[];
  recipes: SavedRecipe[];
}
