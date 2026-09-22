import { api } from "../services/api";
import { getKikuPincode } from "../stores/location-store";

const REQUEST_TIMEOUT_MS = 15000;

export interface DishOffer {
  platform: "swiggy" | "zomato";
  price: number | null;
  listed: boolean;
  dishName?: string;
  restaurantName?: string;
  restaurantUrl?: string | null;
  matchConfidence?: number;
  checkedAt?: string;
  dietaryTags?: string[];
  allergens?: string[];
  dietaryVerified?: boolean;
  allergenVerified?: boolean;
  allergenFreeVerified?: boolean;
  allergenFreeFor?: string[];
  vegetarianVerified?: boolean;
  veganVerified?: boolean;
}

export interface LiveComparisonResult {
  restaurantQuery: string | null;
  canonicalRestaurant: string | null;
  restaurantMatchConfidence: number;
  dishQuery: string | null;
  offers: DishOffer[];
  cheapestPlatform: "swiggy" | "zomato" | null;
  warnings: string[];
  checkedAt: string;
}

/** Fetches current provider menu prices only. No ETA, delivery fees, platform fees, or checkout totals are used. */
export async function fetchLiveComparison(restaurant: string, dish: string, pincode = getKikuPincode(), filters: { dietary?: string[]; allergies?: string[]; allergenFreeOnly?: boolean } = {}): Promise<LiveComparisonResult | null> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const normalizedPincode = String(pincode || "").trim();
    if (!normalizedPincode) return null;
    const data = await api.compare({ pincode: normalizedPincode, location: null, restaurant, dish, ...filters }, controller.signal);
    return data as LiveComparisonResult;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}
