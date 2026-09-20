import type { KikuPreferences, KikuProfile, KikuSavedItems, SavedDish, SavedRecipe } from "../types";

const KEYS = {
  profile: "kiku-profile",
  preferences: "kiku-preferences",
  saved: "kiku-saved-items",
};

const safeRead = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const safeWrite = <T>(key: string, value: T): void => {
  localStorage.setItem(key, JSON.stringify(value));
};

export const getKikuProfile = (): KikuProfile => safeRead<KikuProfile>(KEYS.profile, { name: "Kiku member", avatar: null });

export const saveKikuProfile = (profile: Partial<KikuProfile>): KikuProfile => {
  const next = {
    ...getKikuProfile(),
    ...profile,
    name: String(profile?.name ?? getKikuProfile().name ?? "Kiku member").trim() || "Kiku member",
  };
  safeWrite(KEYS.profile, next);
  window.dispatchEvent(new CustomEvent("kiku-profile-change", { detail: next }));
  return next;
};

export const getKikuPreferences = (): KikuPreferences => safeRead<KikuPreferences>(KEYS.preferences, {
  dietary: [],
  allergies: [],
});

export const saveKikuPreferences = (preferences: Partial<KikuPreferences>): KikuPreferences => {
  const next = {
    dietary: Array.from(new Set(preferences?.dietary || [])),
    allergies: Array.from(new Set(preferences?.allergies || [])),
  };
  safeWrite(KEYS.preferences, next);
  window.dispatchEvent(new CustomEvent("kiku-preferences-change", { detail: next }));
  return next;
};

export const getKikuSavedItems = (): KikuSavedItems => safeRead<KikuSavedItems>(KEYS.saved, { dishes: [], recipes: [] });

const saveItems = (next: KikuSavedItems): KikuSavedItems => {
  safeWrite(KEYS.saved, next);
  window.dispatchEvent(new CustomEvent("kiku-saved-change", { detail: next }));
  return next;
};

export const toggleKikuSavedDish = (dish: SavedDish): KikuSavedItems => {
  const current = getKikuSavedItems();
  const exists = current.dishes.some((item) => item.name === dish.name);
  const next = {
    ...current,
    dishes: exists ? current.dishes.filter((item) => item.name !== dish.name) : [...current.dishes, dish],
  };
  return saveItems(next);
};

export const toggleKikuSavedRecipe = (recipe: SavedRecipe): KikuSavedItems => {
  const current = getKikuSavedItems();
  const exists = current.recipes.some((item) => item.name === recipe.name);
  const next = {
    ...current,
    recipes: exists ? current.recipes.filter((item) => item.name !== recipe.name) : [...current.recipes, recipe],
  };
  return saveItems(next);
};

export const removeKikuSavedDish = (name: string): KikuSavedItems => {
  const current = getKikuSavedItems();
  return saveItems({ ...current, dishes: current.dishes.filter((item) => item.name !== name) });
};

export const removeKikuSavedRecipe = (name: string): KikuSavedItems => {
  const current = getKikuSavedItems();
  return saveItems({ ...current, recipes: current.recipes.filter((item) => item.name !== name) });
};

export const clearKikuUserData = () => {
  Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
  localStorage.removeItem("kiku-authenticated");
  localStorage.removeItem("kiku-pincode");
  localStorage.removeItem("kiku-pincode-prompt-dismissed");
  window.dispatchEvent(new CustomEvent("kiku-profile-change", { detail: null }));
  window.dispatchEvent(new CustomEvent("kiku-preferences-change", { detail: { dietary: [], allergies: [] } }));
  window.dispatchEvent(new CustomEvent("kiku-saved-change", { detail: { dishes: [], recipes: [] } }));
  window.dispatchEvent(new CustomEvent("kiku-auth-change", { detail: { authenticated: false } }));
};

export const buildPreferenceSignal = (): { dietary: Set<string>; allergies: Set<string> } => {
  const preferences = getKikuPreferences();
  return {
    dietary: new Set(preferences.dietary.map((value) => String(value).toLowerCase())),
    allergies: new Set(preferences.allergies.map((value) => String(value).toLowerCase())),
  };
};

export const scoreKikuDish = (dish: { name?: string; restaurant?: string; descriptor?: string; tags?: string[]; dietaryTags?: string[] }, preferences: KikuPreferences = getKikuPreferences()) => {
  const dietary = (preferences.dietary || []).map((value) => value.toLowerCase());
  const allergies = (preferences.allergies || []).map((value) => value.toLowerCase());
  const haystack = [
    dish?.name,
    dish?.restaurant,
    dish?.descriptor,
    ...(dish?.tags || []),
    ...(dish?.dietaryTags || []),
  ].filter(Boolean).join(" ").toLowerCase();

  const explicitAllergyHit = allergies.some((term) => haystack.includes(term));
  if (explicitAllergyHit) return { allowed: false, score: -100 };

  let score = 0;
  dietary.forEach((preference) => {
    if (preference === "vegetarian" || preference === "veg") {
      if (/vegetarian|veg/.test(haystack)) score += 8;
      if (/chicken|mutton|egg|fish|prawn|meat|non-veg/.test(haystack)) score -= 8;
    } else if (preference === "no eggs" && /egg/.test(haystack)) {
      score -= 12;
    } else if (preference === "vegan" && /chicken|mutton|egg|dairy|paneer|butter|cream/.test(haystack)) {
      score -= 9;
    } else if (haystack.includes(preference)) {
      score += 5;
    }
  });
  return { allowed: score > -50, score };
};

export const resizeImageFileToDataUrl = (file: File | null | undefined, maxSize = 320): Promise<string> => new Promise((resolve, reject) => {
  if (!file || !file.type?.startsWith("image/")) {
    reject(new Error("Please choose an image file."));
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => reject(new Error("Unable to read the image."));
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      if (!context) { reject(new Error("Unable to process the image.")); return; }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.84));
    };
    image.onerror = () => reject(new Error("That image could not be opened."));
    image.src = String(reader.result || "");
  };
  reader.readAsDataURL(file);
});
