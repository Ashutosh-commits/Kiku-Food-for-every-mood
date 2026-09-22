# Kiku Recipe UX Refinements

This pass turns Recipe Details into a planning surface and Cooking Mode into a guided kitchen workspace.

## Recipe Details
- Serving counts are real controls and ingredient quantities scale with the selected serving count.
- Ingredients use fractional-aware scaling for common values such as `1/2`, `1 1/2`, and `3/4`.
- Recipe metadata supports cuisine, prep time, cook time, difficulty, equipment, substitutions, nutrition, recipe-specific image assets, and themed emoji fallbacks.
- Recipe pages use the actual recipe image when supplied; they no longer reuse the Butter Chicken image for unrelated recipes.
- Equipment is surfaced in a `Before you start` preparation block.
- Method steps expose timing, heat, visual cues, and are directly tappable to start Cooking Mode at that step.
- Nutrition remains source-driven. Missing nutrition is clearly explained rather than guessed.
- Tips and substitutions are separated into usable cards.

## Cooking Mode
- Current-step ingredients are shown instead of a full grocery list dominating every step.
- Remaining ingredients are available in a compact expandable list.
- Heat, duration, and relevant equipment are shown when known.
- Timers support start, pause, resume, and reset.
- Timer completion stops without auto-advancing; the user decides whether to continue.
- A `Look for` cue explains the physical result to check before moving on.
- `Ask Kiku about this step` opens the assistant with recipe and step context.
- Cooking Mode attempts to keep the screen awake using the browser Wake Lock API when supported.
- Recipe-specific imagery is used where available; missing images use a themed recipe-specific visual instead of the wrong recipe photo.
- Responsive sizing is tuned for desktop, tablet, and mobile widths with reduced-motion support.
