/* Hand tracking - MediaPipe HandLandmarker over a camera frame.
   WASM runtime + 8MB model are vendored in /public (no CDN at
   runtime, version-locked to the installed tasks-vision package).
   Detection runs per-rAF in VIDEO mode. */
import { FilesetResolver, HandLandmarker, type HandLandmarkerResult, type NormalizedLandmark } from "@mediapipe/tasks-vision";

const WASM_URL = `${import.meta.env.BASE_URL}wasm`;
const MODEL_URL = `${import.meta.env.BASE_URL}models/hand_landmarker.task`;

export type Handed = "Left" | "Right";

/* Per-digit extension state - the chord grammar needs WHICH fingers
   are up (index+pinky = VI), not just a count. */
export interface DigitState {
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
  thumb: boolean;
}

export interface HandFeatures {
  handed: Handed;
  /** digits index..pinky, 0-4 */
  fingers: number;
  digits: DigitState;
  /** thumb extended outward (hitchhike) */
  thumbOut: boolean;
  /** thumb tucked toward the palm */
  thumbIn: boolean;
  /** palm roll, sign-normalized: positive = tilted inward (toward the
      body's midline), negative = outward. ~±0..0.6 rad usable range. */
  tilt: number;
  /** wrist height in frame, 0=top 1=bottom */
  height: number;
  landmarks: NormalizedLandmark[];
}

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private raf = 0;
  private lastVideoTime = -1;
  /* Per-slot landmark EMA - raw detector output jitters ~2-4px frame to
     frame; smoothing here means every downstream feature inherits it. */
  private smooth = new Map<Handed, NormalizedLandmark[]>();
  onResult: ((r: HandLandmarkerResult | null) => void) | null = null;

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    /* GPU delegate first (halves the CPU cost); Safari's WebGL path is
       flaky so fall back to CPU before giving up. */
    for (const delegate of ["GPU", "CPU"] as const) {
      try {
        this.landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.6,
          minTrackingConfidence: 0.55,
        });
        return;
      } catch (e) {
        if (delegate === "CPU") throw e;
      }
    }
  }

  async start(video: HTMLVideoElement): Promise<void> {
    this.video = video;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (!this.landmarker || !this.video || this.video.readyState < 2) return;
      if (this.video.currentTime === this.lastVideoTime) return;
      this.lastVideoTime = this.video.currentTime;
      const res = this.landmarker.detectForVideo(this.video, performance.now());
      this.smoothResult(res);
      this.onResult?.(res);
    };
    loop();
  }

  /* EMA over each landmark (alpha .55 tracks fast moves, kills jitter);
     a hand vanishing clears its slot so the next appearance doesn't
     lerp in from a stale pose. */
  private smoothResult(res: HandLandmarkerResult): void {
    const seen = new Set<Handed>();
    res.landmarks.forEach((lm, i) => {
      const handed = (res.handedness[i]?.[0]?.categoryName ?? "Right") as Handed;
      seen.add(handed);
      const prev = this.smooth.get(handed);
      if (!prev || prev.length !== lm.length) {
        this.smooth.set(handed, lm.map((p) => ({ ...p })));
      } else {
        /* Adaptive smoothing (one-euro style): heavy smoothing when the
           hand is still (kills detector jitter), light smoothing when
           moving fast (keeps tracking responsive). alpha is computed
           per-landmark from frame-to-frame speed. */
        lm.forEach((p, j) => {
          const s = prev[j]!;
          const speed = Math.hypot(p.x - s.x, p.y - s.y);
          const a = Math.min(0.9, 0.45 + speed * 7);
          s.x += (p.x - s.x) * a;
          s.y += (p.y - s.y) * a;
          s.z += ((p.z ?? 0) - (s.z ?? 0)) * a;
        });
        res.landmarks[i] = prev;
      }
    });
    for (const h of this.smooth.keys()) if (!seen.has(h)) this.smooth.delete(h);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    const stream = this.video?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (this.video) this.video.srcObject = null;
    this.video = null;
    this.smooth.clear();
  }
}

/* -- landmark → feature math ---------------------------------------- */

/* 2D-only distances. MediaPipe's z is a synthetic estimate and jitters
   several % frame-to-frame - including it made finger reads unstable.
   The palm faces the camera in this grammar so x/y suffice. */
const dist = (a: NormalizedLandmark, b: NormalizedLandmark) =>
  Math.hypot(a.x - b.x, a.y - b.y);

/* Finger extension = BOTH checks, not one:
   1. angle at the PIP joint (mcp→pip→tip) < CURL_LIMIT - orientation-
      independent curl measure
   2. tip is further from the wrist than the PIP - kills false positives
      where a knuckle bends but the angle stays shallow
   Requiring both is what makes edge cases (half-curled fingers,
   tilted hands) read consistently instead of flickering. */
const CURL_LIMIT = 0.75;
const fingerExtended = (lm: NormalizedLandmark[], mcp: number, pip: number, tip: number) => {
  const a = lm[mcp]!, b = lm[pip]!, c = lm[tip]!;
  const v1 = { x: b.x - a.x, y: b.y - a.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const m = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  const angle = Math.acos(Math.min(1, Math.max(-1, dot / (m || 1))));
  return angle < CURL_LIMIT && dist(c, lm[0]!) > dist(b, lm[0]!) * 1.02;
};

export function handFeatures(
  landmarks: NormalizedLandmark[],
  handed: Handed,
): HandFeatures {
  const lm = landmarks;
  const digits: DigitState = {
    index: fingerExtended(lm, 5, 6, 8),
    middle: fingerExtended(lm, 9, 10, 12),
    ring: fingerExtended(lm, 13, 14, 16),
    pinky: fingerExtended(lm, 17, 18, 20),
    /* thumb reads spread, not curl - see below */
    thumb: false,
  };
  const fingers = [digits.index, digits.middle, digits.ring, digits.pinky].filter(Boolean).length;

  const thumbTip = lm[4]!;
  const indexMcp = lm[5]!;
  const pinkyMcp = lm[17]!;
  const wrist = lm[0]!;

  /* Thumb spread normalized by the wrist→middle-knuckle span, which is
     far more stable than the knuckle-to-knuckle palm width (that width
     collapses when the hand tilts in depth). Tucked ≈ <0.55 of the
     palm span, hitchhike ≈ >0.95. */
  const palmSpan = dist(wrist, lm[9]!) || 0.001;
  const thumbSpread = dist(thumbTip, indexMcp) / palmSpan;
  const thumbOut = thumbSpread > 0.95;
  const thumbIn = thumbSpread < 0.55;
  digits.thumb = thumbOut;

  /* Palm roll via the index→pinky knuckle line. atan2 lands near ±π
     for the right hand (its index knuckle sits LEFT of the pinky in
     image space) - wrap into ±90° so both hands share one axis.
     Positive roll = pinky knuckle raised above the index knuckle. */
  const knuckleDx = indexMcp.x - pinkyMcp.x;
  const knuckleDy = indexMcp.y - pinkyMcp.y;
  let roll = Math.atan2(knuckleDy, knuckleDx);
  if (roll > Math.PI / 2) roll -= Math.PI;
  else if (roll < -Math.PI / 2) roll += Math.PI;
  /* "Inward" is mirror-symmetric: for a left hand inward raises the
     pinky side (roll+), for a right hand inward raises the index side
     (roll-). Normalize so positive always = inward. */
  const tilt = handed === "Left" ? roll : -roll;

  return {
    handed,
    fingers,
    digits,
    thumbOut,
    thumbIn,
    tilt,
    height: wrist.y,
    landmarks,
  };
}

/* Landmark wiring for the skeleton overlay - MediaPipe's 21-point
   hand graph as index pairs. */
export const HAND_EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];
