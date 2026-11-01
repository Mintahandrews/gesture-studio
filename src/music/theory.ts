/* Music theory - keys, scale degrees, chord voicings.
   All pitch math in semitones-from-C (MIDI-relative); Tone takes the
   note names back out at trigger time. */

export const KEYS = [
  "C", "C#/Db", "D", "D#/Eb", "E", "F",
  "F#/Gb", "G", "G#/Ab", "A", "A#/Bb", "B",
] as const;

/* semitone index of the natural form (sharps used internally) */
const KEY_SEMITONE: Record<(typeof KEYS)[number], number> = {
  "C": 0, "C#/Db": 1, "D": 2, "D#/Eb": 3, "E": 4, "F": 5,
  "F#/Gb": 6, "G": 7, "G#/Ab": 8, "A": 9, "A#/Bb": 10, "B": 11,
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export type KeyName = (typeof KEYS)[number];

/** Scale degree as dialed by the left hand: 1-7 → I..VII. */
export type Degree = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/* Diatonic quality of each degree in a major key. The left-hand tilt
   can force major/minor over this default. */
export type Triad = "major" | "minor" | "diminished";
const DIATONIC_TRIAD: Record<Degree, Triad> = {
  1: "major", 2: "minor", 3: "minor", 4: "major",
  5: "major", 6: "minor", 7: "diminished",
};

/* Right-hand finger count selects voicing/extension. */
export type Quality = "root" | "firstInv" | "seventh" | "domSeventh";

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];

const TRIAD_INTERVALS: Record<Triad, number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
};

const SEVENTH_INTERVALS: Record<Triad, number> = {
  major: 11,      // maj7
  minor: 10,      // m7
  diminished: 9,  // half-diminished (m7b5)
};

export interface ChordSpec {
  /** midi note numbers, low to high */
  notes: number[];
  /** display name e.g. "F#m7" */
  name: string;
}

/** Roman numeral label for the HUD. */
const NUMERAL = ["I", "II", "III", "IV", "V", "VI", "VII"];

/**
 * Build the chord for a degree in `key`, with quality and octave/
 * semitone shift. Voicing lands in the octave band around the key
 * root (base octave 4, ±octaveShift) so inversions stay musical.
 */
export function buildChord(
  key: KeyName,
  degree: Degree,
  forceTriad: Triad | null,
  quality: Quality,
  octaveShift: number,
  semiShift: number,
): ChordSpec {
  const keyRoot = KEY_SEMITONE[key];
  /* JS % is negative-preserving: flatting C's I would give -1 →
     NOTE_NAMES[-1] = undefined and the whole chord silences. Wrap
     positive first. */
  const wrap12 = (n: number) => ((n % 12) + 12) % 12;
  const degreeRoot = wrap12(keyRoot + MAJOR_SCALE[degree - 1] + semiShift);

  let triad = forceTriad ?? DIATONIC_TRIAD[degree];
  /* forcing minor on the vii° slot or major on it reads badly - keep
     diminished reachable only via domSeventh on VII */
  if (degree === 7 && forceTriad === "minor") triad = "diminished";

  let intervals = [...TRIAD_INTERVALS[triad]];
  let seventh = "";
  if (quality === "seventh" || quality === "domSeventh") {
    /* dom7 flattens the 7th on major triads; dim7 on VII keeps the
       half-diminished color */
    intervals.push(quality === "domSeventh" && triad === "major" ? 10 : SEVENTH_INTERVALS[triad]);
    seventh = "7";
  }

  /* drop the voicing into the octave band: key root sits in octave 4,
     degrees above the tonic spill into the same band before the shift */
  const baseMidi = 12 * (4 + octaveShift) + degreeRoot + (degreeRoot < keyRoot ? 12 : 0);
  let notes = intervals.map((i) => baseMidi + i);

  if (quality === "firstInv") notes = [...notes.slice(1), notes[0]! + 12];

  /* spread: nudge the top voice an octave up when a plain triad sits
     too close - keeps 3-note chords airy on pad-like voices */
  const rootName = NOTE_NAMES[degreeRoot];
  const qualityName = triad === "major" ? "" : triad === "minor" ? "m" : "°";
  const inv = quality === "firstInv" ? `/${NOTE_NAMES[notes[0]! % 12]}` : "";
  const name = `${rootName}${qualityName}${seventh}${inv}`;

  return { notes, name: `${name} · ${NUMERAL[degree - 1]}` };
}

/** Convert a midi number to Tone-style "C4" notation. */
export function midiName(midi: number): string {
  const oct = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[midi % 12]}${oct}`;
}
