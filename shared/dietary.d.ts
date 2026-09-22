export function normalizeDietaryEvidence(source?: Record<string, any>): {
  dietaryTags: string[];
  allergens: string[];
  allergenFreeFor: string[];
  dietaryVerified: boolean;
  allergenVerified: boolean;
  allergenFreeVerified: boolean;
  vegetarianVerified: boolean;
  veganVerified: boolean;
};
export function detectPotentialAllergensFromIngredients(ingredients?: any[], requestedAllergies?: string[]): string[];
export function matchesDietaryFilter(item: Record<string, any>, filters?: { dietary?: string[]; allergies?: string[]; allergenFreeOnly?: boolean }): boolean;
export function filterComparisonOffers(offers: Record<string, any>[], filters?: { dietary?: string[]; allergies?: string[]; allergenFreeOnly?: boolean }): Record<string, any>[];
