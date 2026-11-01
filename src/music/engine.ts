/* Audio engine - one shared chain: instrument → [insert] → filter →
   volume → reverb → destination. Right-hand height drives volume,
   right-hand tilt drives the lowpass cutoff; both ramp, never step.
   Chord changes are discrete retriggers; everything else is a
   continuous parameter. */
import * as Tone from "tone";
import { INSTRUMENTS, type InstrumentDef } from "./instruments";
import { buildChord, midiName, type ChordSpec, type Degree, type KeyName, type Quality, type Triad } from "./theory";

export interface Intent {
  key: KeyName;
  degree: Degree;
  triad: Triad | null; // null = diatonic
  quality: Quality;
  octaveShift: number; // -1 | 0 | 1
  semiShift: number; // -1 | 0 | 1
  /** 0..1 right-hand height → volume */
  gain: number;
  /** 0..1 right-hand tilt → filter openness */
  filter: number;
  /** hand presence - silence when no hands */
  playing: boolean;
}

const DEFAULT_INTENT: Intent = {
  key: "C", degree: 1, triad: null, quality: "root",
  octaveShift: 0, semiShift: 0, gain: 0.5, filter: 0.5, playing: false,
};

class Engine {
  private synth: Tone.PolySynth | null = null;
  private insert: Tone.ToneAudioNode | null = null;
  private filter: Tone.Filter | null = null;
  private volume: Tone.Volume | null = null;
  private reverb: Tone.Freeverb | null = null;
  private instrument: InstrumentDef = INSTRUMENTS[0]!;
  private chord: ChordSpec | null = null;
  private started = false;

  get currentChord() { return this.chord; }
  get currentInstrument() { return this.instrument; }

  /* AudioContext can only start inside a user gesture - call from the
     Start button. */
  async start(): Promise<void> {
    if (this.started) return;
    await Tone.start();
    this.filter = new Tone.Filter(14000, "lowpass");
    this.volume = new Tone.Volume(-6);
    this.reverb = new Tone.Freeverb({ roomSize: 0.7, dampening: 2600, wet: 0.16 });
    /* The whole chain: synth → [insert] → filter → volume → reverb →
       out. filter.connect is the link that was missing - without it
       everything upstream of volume is a dead end (no sound). */
    this.filter.chain(this.volume, this.reverb, Tone.getDestination());
    this.setInstrument(this.instrument.id);
    this.started = true;
  }

  setInstrument(id: string): void {
    const def = INSTRUMENTS.find((i) => i.id === id) ?? INSTRUMENTS[0]!;
    this.instrument = def;
    if (!this.filter) return;
    const held = this.chord;
    this.synth?.releaseAll();
    this.synth?.dispose();
    this.insert?.dispose();
    const synth = def.make();
    if (def.insert) {
      this.insert = def.insert();
      synth.chain(this.insert, this.filter);
    } else {
      this.insert = null;
      synth.connect(this.filter);
    }
    this.synth = synth;
    /* keep the music unbroken across a voice swap - retrigger the held
       chord on the new voice */
    if (held) this.triggerChord(held);
  }

  /* Discrete chord retrigger on intent change; continuous params ride
     the ramps. */
  apply(intent: Intent): void {
    if (!this.started || !this.synth || !this.filter || !this.volume) return;

    /* right-hand continuous controls - rampTo keeps zipper noise out.
       Quadratic gain curve so the bottom half of the hand's travel
       isn't all inaudible; floor -38dB so "hand at bottom" is quiet
       not cut (the release only happens on !playing). */
    const db = intent.playing ? Tone.gainToDb(0.02 + 0.95 * intent.gain * intent.gain) : -80;
    this.volume.volume.rampTo(db, 0.08);
    const hz = 300 * Math.pow(2, intent.filter * 7.5); // ~300Hz..18kHz log sweep
    this.filter.frequency.rampTo(hz, 0.08);

    if (!intent.playing) {
      if (this.chord) {
        this.synth.releaseAll();
        this.chord = null;
      }
      return;
    }

    const spec = buildChord(
      intent.key, intent.degree, intent.triad, intent.quality,
      intent.octaveShift + (this.instrument.octaveBias ?? 0), intent.semiShift,
    );
    if (!this.chord || spec.name !== this.chord.name || spec.notes.join() !== this.chord.notes.join()) {
      this.triggerChord(spec);
    }
  }

  private triggerChord(spec: ChordSpec): void {
    if (!this.synth) return;
    this.synth.releaseAll();
    this.synth.triggerAttack(spec.notes.map(midiName));
    this.chord = spec;
  }

  stop(): void {
    this.synth?.releaseAll();
    this.chord = null;
  }
}

export const engine = new Engine();
export { DEFAULT_INTENT };
