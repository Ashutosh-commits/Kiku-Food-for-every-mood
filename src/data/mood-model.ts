/**
 * On-device mood detection for Kiku's "Scan My Mood" feature.
 *
<<<<<<< HEAD
 * Uses a real,
=======
 * Replaces the previous stand-in `runMoodPrediction()` mock with a real,
>>>>>>> ed1a51580aecb4ac5c7cc1166ba8a01e928604dc
 * fully client-side signal built on MediaPipe's Face Landmarker task. This
 * satisfies Kiku's non-negotiable privacy rule: the model, its weights, and
 * every video frame it looks at stay in the browser. Nothing is uploaded.
 *
 * Why MediaPipe Face Landmarker instead of a custom-trained pixel CNN:
 * - It's Google-maintained, runs via WASM/WebGL, and is built specifically
 *   for real-time, on-device, in-browser face tracking - the exact latency
 *   and privacy profile Kiku's "scan -> result -> stop" flow needs.
 * - It outputs 52 continuous blendshape scores (mouth curvature, brow
 *   position, eye openness, etc.) instead of one hard class label. That is
 *   a much richer, more interpretable signal to build mood inference on
 *   top of than a single softmax output, and it needs far less labeled
 *   training data than training an expression classifier from raw pixels.
 *
 * Important, stated plainly: the scoring function below (blendshapes ->
 * Happy / Calm / Stressed / Tired / Excited / Cozy) is a hand-tuned
 * heuristic, not a trained classifier. There is no labeled dataset yet
 * mapping real faces to Kiku's specific six mood categories. This is a
<<<<<<< HEAD
 * real, working v1 signal, but it should be treated as a starting point. Once real (consenting, opt-in) usage data exists, the
=======
 * real, working v1 signal - not a mock - but it should be treated as a
 * starting point. Once real (consenting, opt-in) usage data exists, the
>>>>>>> ed1a51580aecb4ac5c7cc1166ba8a01e928604dc
 * `scoreMood()` function is the one place to swap in a small trained
 * classifier (e.g. a shallow MLP or logistic regression over the same
 * blendshape vector) without touching anything else in this file or in
 * App.tsx.
 */

import type { MoodName } from "../types";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export type BlendshapeMap = Record<string, number>;

export interface MoodPrediction {
  mood: MoodName;
  confidence: number; // 0-100
}

<<<<<<< HEAD
=======
type NormalizedLandmark = { x: number; y: number; z: number };

>>>>>>> ed1a51580aecb4ac5c7cc1166ba8a01e928604dc
// The MediaPipe task type isn't imported eagerly - the whole
// `@mediapipe/tasks-vision` package (WASM + JS glue) is only fetched the
// first time a scan actually needs it, via a dynamic import. This keeps it
// out of the main bundle and off the critical path for every other page.
type FaceLandmarkerInstance = {
  detectForVideo: (
    video: HTMLVideoElement,
    timestampMs: number
  ) => {
    faceBlendshapes?: { categories: { categoryName: string; score: number }[] }[];
<<<<<<< HEAD
=======
    faceLandmarks?: NormalizedLandmark[][];
>>>>>>> ed1a51580aecb4ac5c7cc1166ba8a01e928604dc
  };
};

let landmarkerPromise: Promise<FaceLandmarkerInstance> | null = null;

async function getLandmarker(): Promise<FaceLandmarkerInstance> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FilesetResolver, FaceLandmarker } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
      return FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
      }) as unknown as Promise<FaceLandmarkerInstance>;
<<<<<<< HEAD
    })().catch((error) => {
      landmarkerPromise = null;
      throw error;
    });
=======
    })();
>>>>>>> ed1a51580aecb4ac5c7cc1166ba8a01e928604dc
  }
  return landmarkerPromise;
}

/**
 * Starts loading the model in the background. Safe to call more than once
 * (a no-op after the first call) and safe to call speculatively - e.g. as
 * soon as the person scrolls into the Mood section - so the ~a few MB of
 * WASM + model weights are already warm by the time they tap "Start Scan"
 * and grant camera access. This does not touch the camera itself.
 */
export function warmUpMoodModel(): void {
  void getLandmarker().catch((error) => {
    console.warn("Kiku mood model failed to preload:", error);
  });
}

export interface FaceSignals {
  blendshapes: BlendshapeMap;
<<<<<<< HEAD
}

/**
 * Reads one frame from the given <video> element and returns its blendshape
 * scores from a single detection pass, or null if no face was found in that
 * frame (occluded, turned away,
=======
  /** Normalized (0-1) face landmark points from the same detection pass,
   * for anything that needs a face crop (e.g. the shadow model) without
   * running a second, separate face detector. */
  landmarks: NormalizedLandmark[];
}

/**
 * Reads one frame from the given <video> element and returns both its
 * blendshape scores and its raw landmark points from a single detection
 * pass, or null if no face was found in that frame (occluded, turned away,
>>>>>>> ed1a51580aecb4ac5c7cc1166ba8a01e928604dc
 * too dark, etc.). Callers should sample several frames across the scan
 * window rather than relying on a single reading.
 */
export async function readFaceSignalsFromVideo(
  video: HTMLVideoElement
): Promise<FaceSignals | null> {
  if (video.readyState < 2) return null; // not enough data decoded yet

  const landmarker = await getLandmarker();
  const result = landmarker.detectForVideo(video, performance.now());
  const categories = result?.faceBlendshapes?.[0]?.categories;
<<<<<<< HEAD
=======
  const landmarks = result?.faceLandmarks?.[0];
>>>>>>> ed1a51580aecb4ac5c7cc1166ba8a01e928604dc
  if (!categories || !categories.length) return null;

  const blendshapes: BlendshapeMap = {};
  for (const category of categories) {
    blendshapes[category.categoryName] = category.score;
  }
<<<<<<< HEAD
  return { blendshapes };
=======
  return { blendshapes, landmarks: landmarks ?? [] };
>>>>>>> ed1a51580aecb4ac5c7cc1166ba8a01e928604dc
}

/**
 * Averages several blendshape readings into one, so a single noisy frame
 * (a blink, motion blur, a half-turned head) doesn't dominate the result.
 */
export function averageBlendshapes(samples: BlendshapeMap[]): BlendshapeMap | null {
  if (!samples.length) return null;

  const totals: BlendshapeMap = {};
  for (const sample of samples) {
    for (const [key, value] of Object.entries(sample)) {
      totals[key] = (totals[key] ?? 0) + value;
    }
  }

  const averaged: BlendshapeMap = {};
  for (const [key, total] of Object.entries(totals)) {
    averaged[key] = total / samples.length;
  }
  return averaged;
}

function shape(map: BlendshapeMap, name: string): number {
  return map[name] ?? 0;
}

// "Calm" has no defining blendshape of its own - a relaxed face is mostly
// the absence of other signals. Giving it a flat baseline (rather than
// summing (1 - otherShape) terms) means it only wins when nothing else
// clears this floor, instead of structurally out-scoring genuine Stressed/
// Tired/Cozy signals just because a face is holding still. Tuned so a
// fully neutral face reads as Calm, but any clearly activated expression
// beats it.
const CALM_BASELINE = 0.3;

/**
 * Blendshape -> Kiku mood heuristic. See the file-level comment above for
 * why this is a heuristic and not (yet) a trained classifier.
 */
function scoreMood(map: BlendshapeMap): Record<MoodName, number> {
  const smile = Math.max(shape(map, "mouthSmileLeft"), shape(map, "mouthSmileRight"));
  const cheekRaise = Math.max(shape(map, "cheekSquintLeft"), shape(map, "cheekSquintRight"));
  const browDown = Math.max(shape(map, "browDownLeft"), shape(map, "browDownRight"));
  const browInnerUp = shape(map, "browInnerUp");
  const eyeWide = Math.max(shape(map, "eyeWideLeft"), shape(map, "eyeWideRight"));
  const eyeBlink = Math.max(shape(map, "eyeBlinkLeft"), shape(map, "eyeBlinkRight"));
  const jawOpen = shape(map, "jawOpen");
  const mouthFrown = Math.max(shape(map, "mouthFrownLeft"), shape(map, "mouthFrownRight"));
  const mouthPress = Math.max(shape(map, "mouthPressLeft"), shape(map, "mouthPressRight"));
  const noseSneer = Math.max(shape(map, "noseSneerLeft"), shape(map, "noseSneerRight"));

  return {
    Happy: smile * 0.7 + cheekRaise * 0.3,
    Excited: smile * 0.4 + eyeWide * 0.35 + jawOpen * 0.25,
    Stressed: browDown * 0.5 + mouthPress * 0.25 + noseSneer * 0.15 + mouthFrown * 0.15,
    Tired: eyeBlink * 0.7 + browInnerUp * 0.15 + mouthFrown * 0.15,
    Cozy: browInnerUp * 0.5 + smile * 0.3 + cheekRaise * 0.2,
    Calm: CALM_BASELINE,
  };
}

/**
 * Turns an averaged blendshape reading into a Kiku mood + confidence.
 * Falls back to a low-confidence "Calm" if no usable reading exists (e.g.
 * no face was found in any sampled frame) rather than guessing loudly -
 * the person can always retake the scan or pick a mood manually.
 */
export function predictMoodFromBlendshapes(averaged: BlendshapeMap | null): MoodPrediction {
  if (!averaged) {
    return { mood: "Calm", confidence: 40 };
  }

  const scores = scoreMood(averaged);
  const entries = Object.entries(scores) as [MoodName, number][];
  entries.sort((a, b) => b[1] - a[1]);
  const [topMood, topScore] = entries[0];
  const secondScore = entries[1]?.[1] ?? 0;

  // Confidence reflects both how strong the winning signal is and how
  // clearly it separates from the runner-up mood.
  const strength = Math.min(1, topScore);
  const margin = Math.min(1, Math.max(0, topScore - secondScore));
  const confidence = Math.round(45 + strength * 30 + margin * 25);

  return { mood: topMood, confidence: Math.min(97, Math.max(35, confidence)) };
}
