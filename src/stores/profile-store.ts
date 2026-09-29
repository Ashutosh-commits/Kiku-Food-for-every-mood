import type { KikuPreferences, KikuProfile, KikuSavedItems, SavedDish, SavedRecipe } from "../types";
import { api, KikuApiError, type ApiUser } from "../services/api";
import { matchesDietaryFilter } from "../../shared/dietary.js";

let profile: KikuProfile = { name: "Kiku member", avatar: null };
let preferences: KikuPreferences = { dietary: [], allergies: [], cuisines: [], spiceLevel: null, budgetMin: null, budgetMax: null, pincode: null };
let saved: KikuSavedItems = { dishes: [], recipes: [], restaurants: [] };
let authenticated = false;

function dispatch(name: string, detail: any) { window.dispatchEvent(new CustomEvent(name, { detail })); }

function applyUser(user: ApiUser | null) {
  if (!user) {
    profile = { name: "Kiku member", avatar: null };
    authenticated = false;
    saved = { dishes: [], recipes: [], restaurants: [] };
    preferences = { dietary: [], allergies: [], cuisines: [], spiceLevel: null, budgetMin: null, budgetMax: null, pincode: null };
    return;
  }
  authenticated = true;
  profile = { name: user.name || "Kiku member", email: user.email, avatar: user.avatar || null, provider: user.provider };
}

export async function hydrateKikuUserState(): Promise<boolean> {
  try {
    const result = await api.me();
    applyUser(result.user);
    if (!result.user) {
      dispatch("kiku-auth-change", { authenticated: false });
      return false;
    }
    const [prefResult, savedResult] = await Promise.all([api.getPreferences(), api.getSaved()]);
    preferences = { ...preferences, ...prefResult.preferences };
    const next = { dishes: [], recipes: [], restaurants: [] } as KikuSavedItems;
    for (const item of savedResult.items || []) {
      if (item.entityType === "dish") next.dishes.push(item.entity || { name: item.entityKey });
      else if (item.entityType === "recipe") next.recipes.push(item.entity || { name: item.entityKey });
      else if (item.entityType === "restaurant") next.restaurants.push(item.entity || { name: item.entityKey });
    }
    saved = next;
    dispatch("kiku-profile-change", { ...profile });
    dispatch("kiku-preferences-change", { ...preferences });
    dispatch("kiku-saved-change", { ...saved });
    dispatch("kiku-auth-change", { authenticated: true });
    return true;
  } catch (error) {
    if (error instanceof KikuApiError && error.status === 401) {
      applyUser(null);
      dispatch("kiku-auth-change", { authenticated: false });
      return false;
    }
    return authenticated;
  }
}

export function isKikuAuthenticated() { return authenticated; }
export const getKikuProfile = (): KikuProfile => ({ ...profile });

export const saveKikuProfile = (nextProfile: Partial<KikuProfile>): KikuProfile => {
  profile = { ...profile, ...nextProfile, name: String(nextProfile?.name ?? profile.name ?? "Kiku member").trim() || "Kiku member" };
  dispatch("kiku-profile-change", { ...profile });
  if (authenticated) void api.updateProfile({ name: profile.name, avatar: profile.avatar || null }).catch(() => void hydrateKikuUserState());
  return { ...profile };
};

export const getKikuPreferences = (): KikuPreferences => ({ ...preferences, dietary: [...preferences.dietary], allergies: [...preferences.allergies], cuisines: [...(preferences.cuisines || [])] });

export const saveKikuPreferences = (nextPreferences: Partial<KikuPreferences>): KikuPreferences => {
  preferences = {
    ...preferences,
    ...nextPreferences,
    dietary: Array.from(new Set(nextPreferences?.dietary ?? preferences.dietary ?? [])),
    allergies: Array.from(new Set(nextPreferences?.allergies ?? preferences.allergies ?? [])),
    cuisines: Array.from(new Set(nextPreferences?.cuisines ?? preferences.cuisines ?? [])),
  };
  dispatch("kiku-preferences-change", { ...preferences });
  if (authenticated) void api.updatePreferences(preferences).catch(() => void hydrateKikuUserState());
  return getKikuPreferences();
};

export const getKikuSavedItems = (): KikuSavedItems => ({
  dishes: [...saved.dishes], recipes: [...saved.recipes], restaurants: [...saved.restaurants],
});

function findSaved<T extends { name?: string }>(items: T[], name: string) { return items.some((item) => item.name === name); }

export const toggleKikuSavedDish = (dish: SavedDish): KikuSavedItems => {
  const exists = findSaved(saved.dishes, dish.name);
  saved = { ...saved, dishes: exists ? saved.dishes.filter((item) => item.name !== dish.name) : [...saved.dishes, dish] };
  dispatch("kiku-saved-change", getKikuSavedItems());
  if (authenticated) void api.toggleSaved({ entityType: "dish", entityKey: dish.name, entity: dish }).catch(() => hydrateKikuUserState());
  return getKikuSavedItems();
};

export const toggleKikuSavedRecipe = (recipe: SavedRecipe): KikuSavedItems => {
  const exists = findSaved(saved.recipes, recipe.name);
  saved = { ...saved, recipes: exists ? saved.recipes.filter((item) => item.name !== recipe.name) : [...saved.recipes, recipe] };
  dispatch("kiku-saved-change", getKikuSavedItems());
  if (authenticated) void api.toggleSaved({ entityType: "recipe", entityKey: recipe.name, entity: recipe }).catch(() => hydrateKikuUserState());
  return getKikuSavedItems();
};

export const toggleKikuSavedRestaurant = (restaurant: { name: string; cuisine?: string }): KikuSavedItems => {
  const exists = findSaved(saved.restaurants, restaurant.name);
  saved = { ...saved, restaurants: exists ? saved.restaurants.filter((item) => item.name !== restaurant.name) : [...saved.restaurants, restaurant] };
  dispatch("kiku-saved-change", getKikuSavedItems());
  if (authenticated) void api.toggleSaved({ entityType: "restaurant", entityKey: restaurant.name, entity: restaurant }).catch(() => hydrateKikuUserState());
  return getKikuSavedItems();
};

export const removeKikuSavedDish = (name: string): KikuSavedItems => { saved = { ...saved, dishes: saved.dishes.filter((item) => item.name !== name) }; dispatch("kiku-saved-change", getKikuSavedItems()); if (authenticated) void api.removeSaved("dish", name).catch(() => void hydrateKikuUserState()); return getKikuSavedItems(); };
export const removeKikuSavedRecipe = (name: string): KikuSavedItems => { saved = { ...saved, recipes: saved.recipes.filter((item) => item.name !== name) }; dispatch("kiku-saved-change", getKikuSavedItems()); if (authenticated) void api.removeSaved("recipe", name).catch(() => void hydrateKikuUserState()); return getKikuSavedItems(); };
export const removeKikuSavedRestaurant = (name: string): KikuSavedItems => { saved = { ...saved, restaurants: saved.restaurants.filter((item) => item.name !== name) }; dispatch("kiku-saved-change", getKikuSavedItems()); if (authenticated) void api.removeSaved("restaurant", name).catch(() => void hydrateKikuUserState()); return getKikuSavedItems(); };

export async function clearKikuUserData() {
  if (authenticated) await api.deleteAccount();
  applyUser(null);
  profile = { name: "Kiku member", avatar: null };
  preferences = { dietary: [], allergies: [], cuisines: [], spiceLevel: null, budgetMin: null, budgetMax: null, pincode: null };
  saved = { dishes: [], recipes: [], restaurants: [] };
  authenticated = false;
  dispatch("kiku-profile-change", { ...profile });
  dispatch("kiku-preferences-change", { ...preferences });
  dispatch("kiku-saved-change", getKikuSavedItems());
  dispatch("kiku-auth-change", { authenticated: false });
  try { window.sessionStorage.removeItem("kiku-auth-return"); } catch {}
  return true;
}


export function scoreKikuDish(dish: { name?: string; restaurant?: string; descriptor?: string; tags?: string[]; dietaryTags?: string[]; allergens?: string[]; dietaryVerified?: boolean; allergenVerified?: boolean; allergenFreeVerified?: boolean; vegetarianVerified?: boolean; veganVerified?: boolean }, current: KikuPreferences = getKikuPreferences()) {
  const dietary = (current.dietary || []).map((value) => value.toLowerCase());
  const haystack = [dish?.name, dish?.restaurant, dish?.descriptor, ...(dish?.tags || []), ...(dish?.dietaryTags || [])].filter(Boolean).join(" ").toLowerCase();
  if (!matchesDietaryFilter(dish, { dietary: current.dietary, allergies: current.allergies })) return { allowed: false, score: -1000, reasons: [] };
  let score = 0;
  dietary.forEach((preference) => {
    if (preference === "vegetarian" || preference === "veg") { if (/vegetarian|veg/.test(haystack)) score += 8; if (/chicken|mutton|egg|fish|prawn|meat|non-veg/.test(haystack)) score -= 8; }
    else if (preference === "no eggs" && /egg/.test(haystack)) score -= 12;
    else if (preference === "vegan" && /chicken|mutton|egg|dairy|paneer|butter|cream/.test(haystack)) score -= 9;
    else if (haystack.includes(preference)) score += 5;
  });
  return { allowed: score > -50, score };
}

export const resizeImageFileToDataUrl = (file: File | null | undefined, maxSize = 192): Promise<string> => new Promise((resolve, reject) => {
  if (!file || !file.type?.startsWith("image/")) { reject(new Error("Please choose an image file.")); return; }
  const reader = new FileReader();
  reader.onerror = () => reject(new Error("Unable to read the image."));
  reader.onload = () => { const image = new Image(); image.onload = () => { const scale = Math.min(1, maxSize / Math.max(image.width, image.height)); const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale)); const context = canvas.getContext("2d"); if (!context) { reject(new Error("Unable to process the image.")); return; } context.drawImage(image, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL("image/jpeg", 0.72)); }; image.onerror = () => reject(new Error("That image could not be opened.")); image.src = String(reader.result || ""); };
  reader.readAsDataURL(file);
});
