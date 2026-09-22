/**
 * Shadow (experimental) FER2013 emotion model.
 *
 * This does NOT affect what the user sees. It runs quietly alongside the
 * primary MediaPipe + heuristic mood-scan system purely to log a
 * comparison signal, so that once Kiku has real usage, there's actual
 * evidence to decide whether investing further in this model is worth it
 * - instead of guessing.
 *
 * Design notes:
 * - Reuses the face landmarks MediaPipe already computed for the primary
 *   scan (see mood-model.ts) to crop the face, rather than running a
 *   second face detector. Same accuracy, less compute, smaller download.
 * - The FER2013 model expects 48x48 GRAYSCALE input. Converting a video
 *   frame to grayscale via `tf.browser.fromPixels(canvas, 1)` looks
 *   correct but is not - it silently keeps only the red channel and drops
 *   green/blue instead of computing real luminance. This file does the
 *   explicit R/G/B luminance-weighted conversion instead (matching PIL's
 *   `.convert("L")`, which is almost certainly what produced the training
 *   images), verified numerically before shipping.
 * - The mapping from FER2013's 7 classes to Kiku's 6 moods below is lossy
 *   and only used to make the two systems' outputs comparable in
 *   telemetry. It is never shown to users and never affects
 *   recommendations.
 * - Every failure path here returns null rather than throwing, and this
 *   must never block, delay, or affect the primary scan result.
 *
 * Setup required before this does anything useful:
 *   1. Convert your trained model:
 *        pip install tensorflowjs
 *        tensorflowjs_converter --input_format=keras \
 *          emotion_model.h5 ./public/models/fer2013/
 *   2. Confirm class_names.json from training matches FER_CLASSES below
 *      (image_dataset_from_directory sorts class folders alphabetically,
 *      so this order should already match if you used the standard
 *      Angry/Disgust/Fear/Happy/Neutral/Sad/Surprise folder names).
 *   3. That's it - warmUpShadowModel()/getShadowPrediction() below will
 *      pick up the converted model automatically once the files exist at
 *      /public/models/fer2013/model.json.
 */

import type { MoodName } from "../types";

const SHADOW_MODEL_URL = "/models/fer2013/model.json";

const FER_CLASSES = ["Angry", "Disgust", "Fear", "Happy", "Neutral", "Sad", "Surprise"] as const;
type FerClass = (typeof FER_CLASSES)[number];

// Lossy mapping used ONLY to make the shadow model's output comparable to
// Kiku's 6 mood categories in telemetry. Not shown to users.
const FER_TO_KIKU_MOOD: Record<FerClass, MoodName> = {
  Happy: "Happy",
  Surprise: "Excited",
  Neutral: "Calm",
  Sad: "Stressed",
  Angry: "Stressed",
  Fear: "Stressed",
  Disgust: "Stressed",
};

type NormalizedLandmark = { x: number; y: number; z: number };

// Loaded lazily via dynamic import so tfjs never touches the main bundle -
// only fetched if/when a shadow prediction is actually attempted.
let modelPromise: Promise<any> | null = null;
let unavailable = false; // set once, e.g. if the model files 404

async function getShadowModel(): Promise<any> {
  if (unavailable) throw new Error("Shadow model previously failed to load");
  if (!modelPromise) {
    modelPromise = (async () => {
      const tf = await import("@tensorflow/tfjs");
      return tf.loadLayersModel(SHADOW_MODEL_URL);
    })().catch((error) => {
      unavailable = true;
      throw error;
    });
  }
  return modelPromise;
}

/**
 * Starts loading the shadow model in the background, if the converted
 * model files are present. Safe to call speculatively - failures are
 * swallowed (logged once, quietly) since this feature is optional and must
 * never surface as a user-facing error.
 */
export function warmUpShadowModel(): void {
  void getShadowModel().catch(() => {
    // Expected until the .h5 model has been converted and dropped into
    // /public/models/fer2013/ - see file header for the conversion step.
  });
}

export interface ShadowPrediction {
  ferLabel: FerClass;
  ferConfidence: number; // 0-1
  mappedMood: MoodName;
}

function cropFaceToCanvas(
  video: HTMLVideoElement,
  landmarks: NormalizedLandmark[]
): HTMLCanvasElement | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || !landmarks.length) return null;

  const xs = landmarks.map((p) => p.x);
  const ys = landmarks.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  // The landmark mesh hugs facial features tightly (eyes/nose/mouth
  // outline), not the full head - pad it out a bit so the crop looks like
  // the kind of face photo FER2013 was trained on.
  const padX = (maxX - minX) * 0.25;
  const padY = (maxY - minY) * 0.35;

  const boxX = Math.max(0, (minX - padX) * vw);
  const boxY = Math.max(0, (minY - padY) * vh);
  const boxW = Math.min(vw - boxX, (maxX - minX + padX * 2) * vw);
  const boxH = Math.min(vh - boxY, (maxY - minY + padY * 2) * vh);
  if (boxW <= 0 || boxH <= 0) return null;

  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 48;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, boxX, boxY, boxW, boxH, 0, 0, 48, 48);
  return canvas;
}

/**
 * Crops a face from the video using the landmark points from the same
 * detection pass the primary system already ran, converts it to properly
 * luminance-weighted 48x48 grayscale (matching the Python training
 * pipeline, not tf.js's channel-dropping "grayscale" shortcut), and runs
 * the shadow FER2013 model on it. Returns null on any failure - this must
 * never throw into the caller's scan flow.
 */
export async function getShadowPrediction(
  video: HTMLVideoElement,
  landmarks: NormalizedLandmark[]
): Promise<ShadowPrediction | null> {
  try {
    const canvas = cropFaceToCanvas(video, landmarks);
    if (!canvas) return null;

    const tf = await import("@tensorflow/tfjs");
    const model = await getShadowModel();

    const prediction = tf.tidy(() => {
      const rgb = tf.browser.fromPixels(canvas, 3).toFloat();
      const r = rgb.slice([0, 0, 0], [-1, -1, 1]);
      const g = rgb.slice([0, 0, 1], [-1, -1, 1]);
      const b = rgb.slice([0, 0, 2], [-1, -1, 1]);
      // ITU-R BT.601 luma weights - matches PIL's `.convert("L")`.
      const gray = r.mul(0.299).add(g.mul(0.587)).add(b.mul(0.114));
      const normalized = gray.div(255.0).expandDims(0); // [1,48,48,1]
      return model.predict(normalized);
    });

    const scores = await prediction.data();
    prediction.dispose();

    let bestIndex = 0;
    for (let i = 1; i < scores.length; i += 1) {
      if (scores[i] > scores[bestIndex]) bestIndex = i;
    }

    const ferLabel = FER_CLASSES[bestIndex];
    return {
      ferLabel,
      ferConfidence: scores[bestIndex],
      mappedMood: FER_TO_KIKU_MOOD[ferLabel],
    };
  } catch (error) {
    if (!unavailable) {
      console.warn("Kiku shadow model prediction failed (non-fatal):", error);
    }
    return null;
  }
}
