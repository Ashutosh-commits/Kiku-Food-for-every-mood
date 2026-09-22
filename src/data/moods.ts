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
