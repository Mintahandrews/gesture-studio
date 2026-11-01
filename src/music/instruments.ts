/* Instrument registry - every voice is a Tone.PolySynth preset routed
   through the shared filter/volume chain. The palette covers the
   reference set (warm/bright/retro, strings, horns) plus piano, organ,
   bass, bells and flute - all synthesized, no samples, so the whole
   roster ships offline-capable. */
import * as Tone from "tone";
import {
  WaveSine, Lightning, GameController, MusicNotes, SpeakerHigh,
  PianoKeys, Sliders, SpeakerLow, Bell, Wind, type Icon,
} from "phosphor-react";

export interface InstrumentDef {
  id: string;
  label: string;
  icon: Icon;
  /** blurb shown under the picker */
  hint: string;
  make: () => Tone.PolySynth;
  /** optional insert between the synth and the shared filter
      (vibrato, chorus) - the engine wires it and disposes it */
  insert?: () => Tone.ToneAudioNode;
  /** natural octave bias - bass sits a whole octave down */
  octaveBias?: number;
}

export const INSTRUMENTS: InstrumentDef[] = [
  {
    id: "warm",
    label: "Warm Synth",
    icon: WaveSine,
    hint: "triangle waves, soft attack - the default pad",
    make: () =>
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.08, decay: 0.4, sustain: 0.7, release: 0.9 },
      }),
  },
  {
    id: "bright",
    label: "Bright Synth",
    icon: Lightning,
    hint: "sawtooth stack, open top end",
    make: () =>
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sawtooth" },
        envelope: { attack: 0.02, decay: 0.25, sustain: 0.65, release: 0.6 },
      }),
  },
  {
    id: "retro",
    label: "Retro Synth",
    icon: GameController,
    hint: "square wave - 8-bit console chords",
    make: () =>
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "square" },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.35 },
      }),
  },
  {
    id: "strings",
    label: "Strings",
    icon: MusicNotes,
    hint: "slow-bloom ensemble, wide vibrato",
    make: () =>
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sawtooth" },
        envelope: { attack: 0.5, decay: 0.4, sustain: 0.85, release: 1.4 },
      }),
    insert: () => new Tone.Vibrato(5.2, 0.25),
  },
  {
    id: "horns",
    label: "Horns",
    icon: SpeakerHigh,
    hint: "brass section - punchy swell",
    make: () =>
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fatsawtooth", spread: 40 },
        envelope: { attack: 0.09, decay: 0.3, sustain: 0.8, release: 0.5 },
      }),
  },
  {
    id: "piano",
    label: "Piano",
    icon: PianoKeys,
    hint: "FM electric piano - bell-tinged keys",
    make: () =>
      new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 1.98,
        modulationIndex: 12,
        oscillator: { type: "sine" },
        envelope: { attack: 0.005, decay: 1.2, sustain: 0.15, release: 1.6 },
        modulation: { type: "sine" },
        modulationEnvelope: { attack: 0.005, decay: 0.5, sustain: 0.2, release: 0.8 },
      }),
  },
  {
    id: "organ",
    label: "Organ",
    icon: Sliders,
    hint: "drawbar swell, endless sustain",
    make: () =>
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fatsquare", spread: 12, count: 2 },
        envelope: { attack: 0.04, decay: 0, sustain: 1, release: 0.25 },
      }),
  },
  {
    id: "bass",
    label: "Bass",
    icon: SpeakerLow,
    hint: "deep mono-style low end, sits -1 oct",
    octaveBias: -1,
    make: () =>
      new Tone.PolySynth(Tone.MonoSynth, {
        oscillator: { type: "sine" },
        filter: { Q: 2, type: "lowpass", rolloff: -12 },
        filterEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.4, baseFrequency: 400, octaves: 2 },
        envelope: { attack: 0.01, decay: 0.4, sustain: 0.7, release: 0.4 },
      }),
  },
  {
    id: "bells",
    label: "Bells",
    icon: Bell,
    hint: "metallic FM chimes, long decay",
    make: () =>
      new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 3.4,
        modulationIndex: 20,
        oscillator: { type: "sine" },
        envelope: { attack: 0.001, decay: 1.6, sustain: 0.05, release: 2.2 },
        modulation: { type: "square" },
        modulationEnvelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.5 },
      }),
  },
  {
    id: "flute",
    label: "Flute",
    icon: Wind,
    hint: "breathy sine + soft vibrato, airy leads",
    make: () =>
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sine" },
        envelope: { attack: 0.15, decay: 0.2, sustain: 0.8, release: 0.5 },
      }),
    insert: () => new Tone.Vibrato(4.6, 0.12),
  },
];
