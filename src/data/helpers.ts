import { moods } from "./dishes";

export function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

// Stand-in for the real facial-expression model. It only needs to keep
// returning a { mood, confidence } shape — swap the body for the actual
// prediction call when it's ready.
export function runMoodPrediction(): { mood: string; confidence: number } {
  const pool = moods.map((item) => item.name);
  const mood = pool[Math.floor(Math.random() * pool.length)];
  const confidence = Math.round(62 + Math.random() * 30);
  return { mood, confidence };
}
