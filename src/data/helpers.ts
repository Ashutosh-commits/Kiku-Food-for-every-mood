export function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

// The mock random-mood stand-in that used to live here has been replaced
// by a real, fully on-device prediction backed by MediaPipe Face
// Landmarker. See ./mood-model.ts for the model loading, frame sampling,
// and blendshape -> mood scoring, and App.tsx's startMoodScan/finishScan
// for how it's wired into the scan UI.
