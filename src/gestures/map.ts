/* Gesture → musical intent mapping, mirroring the reference grammar:

   LEFT hand  - fingers = scale degree (I-VII, pinky+index=VI,
                pinky+index+thumb=VII), tilt = major/minor override,
                vertical zone = semitone shift
   RIGHT hand - fingers = voicing (1 root, 2 first inversion,
                3 seventh, 4 dominant/diminished 7th), thumb in/out =
                octave, tilt = filter, height = volume

   Discrete choices (degree, quality, octave, shift) are hysteresis-
   debounced - a new value must hold ~140ms before it counts, so a
   passing finger-flick doesn't stutter the chord. Continuous params
   (volume, filter) pass through smoothed. */
import type { HandFeatures } from "./hands";
import type { Degree, Quality, Triad } from "../music/theory";

export interface GestureState {
  degree: Degree;
  triad: Triad | null;
  quality: Quality;
  octaveShift: -1 | 0 | 1;
  semiShift: -1 | 0 | 1;
  gain: number;
  filter: number;
  playing: boolean;
  left: HandFeatures | null;
  right: HandFeatures | null;
}

const HOLD_MS = 140;

/* Height zones for the pitch shift: top 20% = raise, bottom 20% =
   lower, middle neutral - a dead zone in the center stops accidental
   shifts while adjusting volume on the right side. */
function zoneShift(height: number, raiseOn: boolean, lowerOn: boolean): -1 | 0 | 1 {
  if (height < 0.2) return raiseOn ? 1 : 0;
  if (height > 0.8) return lowerOn ? -1 : 0;
  return 0;
}

export class GestureMapper {
  private pending: Partial<GestureState> = {};
  private since = new Map<string, number>();
  private state: GestureState = {
    degree: 1, triad: null, quality: "root",
    octaveShift: 0, semiShift: 0, gain: 0.6, filter: 0.5, playing: false,
    left: null, right: null,
  };
  /* pitch-shift mode - set from the UI toggles (raise/lower) */
  raiseEnabled = true;
  lowerEnabled = true;
  leftOnly = false;

  private stable<K extends keyof GestureState>(key: K, value: GestureState[K]): GestureState[K] {
    if (this.state[key] === value) {
      this.since.delete(key);
      return value;
    }
    if (this.pending[key] === value) {
      if (performance.now() - (this.since.get(key) ?? 0) > HOLD_MS) {
        this.state[key] = value;
        delete this.pending[key];
        this.since.delete(key);
        return value;
      }
    } else {
      this.pending[key] = value;
      this.since.set(key, performance.now());
    }
    return this.state[key];
  }

  update(left: HandFeatures | null, right: HandFeatures | null): GestureState {
    /* Left hand: degree + quality + semitone zone */
    if (left) {
      const d = left.digits;
      /* Named shapes first - they outrank finger count:
         VI = index+pinky, VII = index+pinky+thumb (rock-horn variants).
         Then plain counts; a fist holds the last degree so muting the
         chord shape doesn't cut the note mid-bar. */
      let degree: Degree;
      if (d.index && d.pinky && d.thumb && !d.middle && !d.ring) degree = 7;
      else if (d.index && d.pinky && !d.middle && !d.ring) degree = 6;
      else if (d.index && d.middle && d.ring && d.pinky && d.thumb) degree = 5;
      else if (d.index && d.middle && d.ring && d.pinky) degree = 4;
      else if (d.index && d.middle && d.ring) degree = 3;
      else if (d.index && d.middle) degree = 2;
      else if (d.index) degree = 1;
      else degree = this.state.degree;

      this.stable("degree", degree);

      /* Fist = silence. All digits curled means "stop", not "hold" -
         lets the player mute mid-phrase without leaving the frame. */
      if (left.fingers === 0 && !d.thumb) {
        this.state.playing = false;
        this.state.left = left;
        this.state.right = right;
        return { ...this.state };
      }

      /* tilt: positive = inward = major, negative = outward = minor,
         dead zone in between = diatonic */
      const triad: Triad | null = left.tilt > 0.18 ? "major" : left.tilt < -0.18 ? "minor" : null;
      this.stable("triad", triad);

      const shift = zoneShift(left.height, this.raiseEnabled, this.lowerEnabled);
      this.stable("semiShift", shift);
    } else {
      this.stable("semiShift", 0);
      this.stable("triad", null);
    }

    /* Right hand: voicing, octave, filter, volume */
    if (right) {
      const q: Quality =
        right.fingers >= 4 ? "domSeventh"
        : right.fingers === 3 ? "seventh"
        : right.fingers === 2 ? "firstInv"
        : "root";
      this.stable("quality", q);

      const oct: -1 | 0 | 1 = right.thumbIn ? 1 : right.thumbOut ? -1 : 0;
      this.stable("octaveShift", oct);

      /* filter: inward tilt brightens, outward darkens - tilt is now
         signed positive=inward for both hands, so one mapping works */
      const f = Math.min(1, Math.max(0, 0.5 + right.tilt * 1.6));
      this.state.filter = this.state.filter + (f - this.state.filter) * 0.35;

      /* height: hand near top = loud, near bottom = quiet */
      const g = Math.min(1, Math.max(0, 1 - right.height));
      this.state.gain = this.state.gain + (g - this.state.gain) * 0.35;
    }

    const playing = this.leftOnly ? !!left : !!(left || right);
    this.state.playing = playing;
    this.state.left = left;
    this.state.right = right;
    return { ...this.state };
  }

  reset(): void {
    this.state.playing = false;
    this.state.left = null;
    this.state.right = null;
  }
}
