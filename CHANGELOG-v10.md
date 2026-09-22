# Kiku v10 — Recipe Details & Kitchen Mode Refinement

## Recipe Details

- Reworked the recipe experience into a practical planning dashboard instead of a decorative recipe card.
- Added real serving controls from 1–12 servings with automatic ingredient scaling.
- Added fraction-aware quantity scaling for common amounts such as `1/2`, `1 1/2`, `3/4`, and decimals.
- Added `Before you start` equipment guidance.
- Added cuisine, prep, cook, total, difficulty, and servings metadata where available.
- Added structured Method cards with timers, heat guidance, visual cues, and direct entry into the selected cooking step.
- Added source-driven Nutrition presentation that clearly explains when nutrition data is unavailable instead of inventing it.
- Added dedicated Tips & Swaps sections with recipe-specific substitutions.
- Added recipe-specific imagery support and themed visual fallbacks so unrelated recipes no longer use the Butter Chicken image.

## Cooking Mode

- Rebuilt the cooking view as a focused kitchen workspace.
- Shows only the ingredients relevant to the current step, with the rest available in a compact expandable list.
- Shows step heat, timing, equipment, and visual `Look for` cues where available.
- Timer now supports start, pause, resume, and reset.
- Timer completion no longer auto-advances; the user explicitly chooses when to continue.
- Added an explicit `Ask Kiku about this step` action with recipe/step context.
- Added browser Wake Lock support where available so the screen can remain awake while cooking.
- Added responsive desktop, tablet, and mobile refinements.
- Added reduced-motion handling for the recipe and cooking surfaces.

## Validation

- Added recipe UX contract tests for serving scaling, step-aware cooking, image fallback correctness, timer behavior, assistant context, and responsive styling.
