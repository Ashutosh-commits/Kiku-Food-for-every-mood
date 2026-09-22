# Kiku Recipe System v11

## Recipe data source

Kiku no longer contains bundled sample recipe records or recipe templates in the frontend/backend runtime.

Recipe discovery and recipe details come from the configured recipe provider. The current adapter uses TheMealDB endpoints for search, random discovery, and recipe lookup.

## Missing-data enrichment

When a recipe detail response is missing useful metadata, the server can enrich only the missing fields through Kiku's recipe-enrichment service.

The enrichment flow uses the configured AI provider with web search enabled and a strict structured-output schema. It can fill:

- prep time
- cook time
- total time
- servings
- difficulty
- equipment
- nutrition only when explicitly supported by a source
- step timing / heat / cues when supported or clearly inferable from the existing step text

The canonical ingredient list and provider cooking instructions are not replaced by web content. Enrichment metadata is tracked in `provenance`.

If enrichment is unavailable, Kiku shows an honest unavailable state rather than inventing values.

## Recipe API

- `GET /api/recipes`
- `GET /api/recipes/:id`
- `POST /api/recipes/enrich`
- `POST /api/recipes/substitute`

Recipe detail responses include `dataQuality` so the UI can distinguish required data from optional metadata that could not be verified.

## Ingredient substitutions

Users can request an ingredient change from the Recipe Details page or from the active Cooking Mode step.

Kiku's assistant can also use `substituteRecipeIngredient` when an active recipe context is available.

Substitutions never silently mutate the canonical recipe. Kiku creates a temporary recipe variant containing:

- updated ingredients
- affected step instructions
- adjusted timing/heat/cues/tips when needed
- a substitution note
- provenance showing the recipe was modified by the user

Nutrition is cleared on recipe variants because changing ingredients invalidates the original nutrition values unless they are recalculated by a trusted nutrition source.

The user must explicitly apply the proposed variant.

## Privacy and safety

The recipe system does not store raw user prompts as recipe data. Provider recipe content is treated as untrusted input. Kiku does not claim allergy or medical safety for a substitution; users should verify dietary and allergy requirements independently.
