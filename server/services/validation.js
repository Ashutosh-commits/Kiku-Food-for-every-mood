import { z } from "zod";

export const regionSchema = z.object({ pincode: z.string().regex(/^[1-9]\d{5}$/), force: z.boolean().optional().default(false) });

export const compareSchema = z.object({
  location: z.string().trim().min(2).max(120).optional().nullable(),
  pincode: z.string().regex(/^[1-9]\d{5}$/).optional().nullable(),
  restaurant: z.string().trim().min(2).max(160),
  dish: z.string().trim().max(160).optional().nullable(),
  dietary: z.array(z.string().trim().min(1).max(50)).max(10).optional().default([]),
  allergies: z.array(z.string().trim().min(1).max(50)).max(20).optional().default([]),
  allergenFreeOnly: z.boolean().optional().default(false),
}).refine((value) => Boolean(value.location || value.pincode), "Provide a city/location or pincode for discovery.");

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.string().email().max(320),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({ email: z.string().email().max(320), password: z.string().min(1).max(128) });
export const googleSchema = z.object({ credential: z.string().min(20).max(10000) });
export const emailTokenSchema = z.object({ token: z.string().min(20).max(1000) });
export const forgotPasswordSchema = z.object({ email: z.string().email().max(320) });
export const resetPasswordSchema = z.object({ token: z.string().min(20).max(1000), password: z.string().min(8).max(128) });

export const profileSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  avatar: z.string().max(100_000).nullable().optional().refine((value) => value == null || /^https:\/\/[^\s]+$/i.test(value) || /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(value), "Avatar must be an HTTPS URL or a supported image data URL."),
});

export const preferencesSchema = z.object({
  dietary: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  allergies: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  cuisines: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  spiceLevel: z.enum(["mild", "medium", "spicy"]).nullable().optional(),
  budgetMin: z.number().min(0).max(100000).nullable().optional(),
  budgetMax: z.number().min(0).max(100000).nullable().optional(),
  pincode: z.string().regex(/^[1-9]\d{5}$/).nullable().optional(),
}).refine((value) => value.budgetMin == null || value.budgetMax == null || value.budgetMin <= value.budgetMax, "budgetMin must not exceed budgetMax");

export const savedSchema = z.object({
  entityType: z.enum(["dish", "restaurant", "recipe"]),
  entityKey: z.string().trim().min(1).max(240),
  entity: z.record(z.string(), z.any()).optional().refine((value) => value == null || JSON.stringify(value).length <= 20_000, "Saved item data is too large."),
});

export const activitySchema = z.object({
  type: z.enum(["search", "view_dish", "view_restaurant", "save_dish", "save_restaurant", "save_recipe", "compare", "recipe_open", "recipe_complete", "order_link_open", "mood_scan", "manual_mood_select", "recommendation_click", "unsave_dish", "unsave_restaurant", "unsave_recipe"]),
  entityType: z.string().max(40).optional().nullable(),
  entityId: z.string().max(240).optional().nullable(),
  metadata: z.record(z.string(), z.any()).optional().refine((value) => value == null || JSON.stringify(value).length <= 12_000, "Activity metadata is too large."),
});


export const dishDescriptionSchema = z.object({
  name: z.string().trim().min(1).max(160),
  restaurant: z.string().trim().max(160).optional().default(""),
  category: z.string().trim().max(100).optional().default(""),
  cuisine: z.string().trim().max(120).optional().default(""),
  provider: z.string().trim().max(40).optional().default(""),
  sourceDescription: z.string().trim().max(1500).optional().default(""),
  city: z.string().trim().max(120).optional().default(""),
  pincode: z.string().regex(/^[1-9]\d{5}$/).optional().nullable(),
});

export const recommendationSchema = z.object({
  expressionSignal: z.object({ label: z.string().max(50), confidence: z.number().min(0).max(1) }).nullable().optional(),
  manualMood: z.string().trim().max(50).nullable().optional(),
  craving: z.string().trim().max(100).nullable().optional(),
  diet: z.string().trim().max(100).nullable().optional(),
  dietary: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  allergies: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  cuisines: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  spiceLevel: z.string().trim().max(30).nullable().optional(),
  budget: z.object({ min: z.number().min(0).max(100000).nullable().optional(), max: z.number().min(0).max(100000).nullable().optional() }).optional(),
  pincode: z.string().regex(/^[1-9]\d{5}$/).nullable().optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

const recipeContextBaseSchema = z.object({
  id: z.string().max(240).nullable().optional(),
  title: z.string().trim().min(1).max(200),
  cuisine: z.string().max(120).optional().default(""),
  servings: z.string().max(80).optional().default(""),
  prepTime: z.string().max(80).nullable().optional(),
  cookTime: z.string().max(80).nullable().optional(),
  prepTimeMinutes: z.number().min(0).max(720).nullable().optional(),
  cookTimeMinutes: z.number().min(0).max(720).nullable().optional(),
  totalTimeMinutes: z.number().min(0).max(1440).nullable().optional(),
  difficulty: z.string().max(40).nullable().optional(),
  rating: z.string().max(80).optional().default(""),
  description: z.string().max(2000).optional().default(""),
  image: z.string().url().max(2000).nullable().optional(),
  source: z.string().max(80).nullable().optional(),
  provenance: z.record(z.string(), z.any()).nullable().optional(),
  nutrition: z.record(z.string(), z.any()).nullable().optional(),
  substitutions: z.array(z.object({ ingredient: z.string().max(160), substitute: z.string().max(160), note: z.string().max(500).nullable().optional() })).max(40).optional().default([]),
  ingredients: z.array(z.tuple([z.string().max(160), z.string().max(80)])).max(40),
  steps: z.array(z.object({
    name: z.string().max(120),
    instruction: z.string().max(1200),
    duration: z.number().int().min(0).max(7200).optional().default(0),
    tip: z.string().max(600).optional().default(""),
    ingredients: z.array(z.string().max(160)).max(20).optional().default([]),
    heat: z.string().max(100).nullable().optional(),
    cue: z.string().max(600).nullable().optional(),
    equipment: z.array(z.string().max(160)).max(10).optional().default([]),
  })).max(24),
  equipment: z.array(z.string().max(160)).max(20).optional().default([]),
  sourceUrl: z.string().url().max(2000).nullable().optional(),
});

const recipeContextSchema = recipeContextBaseSchema.optional().nullable();

export const assistantSchema = z.object({
  conversationId: z.string().max(120).optional().nullable(),
  message: z.string().trim().min(1).max(4000),
  recipeContext: recipeContextSchema,
});

export const recipeResearchSchema = z.object({ recipe: recipeContextBaseSchema });

export const recipeSubstitutionSchema = z.object({
  recipe: recipeContextBaseSchema,
  ingredient: z.string().trim().min(1).max(160),
  substitute: z.string().trim().min(1).max(160),
});

export function parseBody(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const error = new Error(result.error.issues.map((issue) => issue.message).join("; "));
    error.status = 400;
    error.code = "VALIDATION_ERROR";
    throw error;
  }
  return result.data;
}
