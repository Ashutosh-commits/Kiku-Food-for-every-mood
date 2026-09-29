export const moods = [
  { name: "Happy", icon: "😊", className: "happy" },
  { name: "Calm", icon: "☕", className: "calm" },
  { name: "Stressed", icon: "☹", className: "stressed" },
  { name: "Tired", icon: "🍔", className: "tired" },
  { name: "Excited", icon: "💖", className: "excited" },
  { name: "Cozy", icon: "🔥", className: "cozy" },
] as const;

export const moodQuotes = {
  Happy: "Bright moods pair beautifully with bold flavours.",
  Calm: "A calm mind enjoys comforting flavours.",
  Stressed: "A little comfort food eases the moment.",
  Tired: "Something quick and warm sounds about right.",
  Excited: "Let's match that energy with something fun.",
  Cozy: "Slow, warming dishes fit this moment best.",
} as const;

// Lightweight keyword hints used to softly re-rank the live recipe feed
// (title/description/tags/cuisine) toward dishes that suit a detected mood.
// This never hides recipes that don't match — it only brings closer matches
// to the top, since the underlying feed is small and mood tags aren't
// available from the recipe provider itself.
export const moodRecipeKeywords: Record<string, string[]> = {
  Happy: ["sweet", "dessert", "festive", "celebration", "treat"],
  Calm: ["tea", "soup", "light", "soothing", "herbal"],
  Stressed: ["comfort", "easy", "soothing", "warm", "simple"],
  Tired: ["quick", "easy", "one-pot", "simple", "30 minute"],
  Excited: ["spicy", "grill", "shareable", "party", "street"],
  Cozy: ["stew", "curry", "slow", "warm", "baked"],
};
