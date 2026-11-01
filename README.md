# Gesture Studio

**Make music with your hands.** A camera-tracked, gesture-controlled chord instrument that runs entirely in the browser — no MIDI controller, no install, no samples.

[![Built with Vite](https://img.shields.io/badge/Vite-7-purple)](https://vitejs.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## Play

Open the app, allow camera access, hit **start playing**, and raise your hands:

### Left hand — the chord

| Gesture | Result |
|---|---|
| Fingers 1–4, open palm (5) | Scale degrees I, II, III, IV, V |
| Index + pinky | VI |
| Index + pinky + thumb | VII |
| Tilt inward / outward | Force major / minor |
| Top / bottom of frame | Shift ±1 semitone |
| Fist | Stop the sound |

### Right hand — the sound

| Gesture | Result |
|---|---|
| 1 / 2 / 3 / 4 fingers | Root · first inversion · seventh · dominant 7th |
| Thumb in / out | Octave up / down |
| Tilt | Filter open / dark |
| Height | Volume up / down |

## Instruments

10 fully-synthesized voices — Warm Synth, Bright Synth, Retro Synth, Strings, Horns, Piano (FM), Organ, Bass, Bells, Flute. No audio samples; everything is generated live with Tone.js.

## Features

- Real-time 2-hand tracking with fingertip + bone-chain visualization
- Live per-hand readouts (degree, triad, octave, volume) anchored to your wrists
- Interactive guide sheet that highlights the gesture you're currently performing
- 12-key transposition, pitch-shift toggles, left-hand-only mode
- Works offline once loaded — the hand model + WASM runtime are vendored, zero CDN calls
- Fully mobile responsive with safe-area-aware fullscreen camera stage

## Stack

- **Vite + React + TypeScript**
- **Tone.js** — synthesis engine (PolySynth presets, filter/volume/reverb chain)
- **MediaPipe Tasks Vision** — `HandLandmarker` (21-point hand tracking, GPU with CPU fallback)
- **phosphor-react** — icon set
- **MediaPipe hand model** — vendored in `public/models/` (Apache-2.0, courtesy of Google's MediaPipe team)

## Develop

```bash
npm install
npm run dev        # dev server (needs a camera)
npm run build      # typecheck + production build
npm run preview    # serve the production build
```

Camera access requires `localhost` or HTTPS — on a LAN host use `vite --host` over HTTPS or a tunnel.

## Deploy

Static SPA — deploy `dist/` anywhere. Vercel-ready (`vercel.json` included):

```bash
npx vercel --prod
```

## License

[MIT](LICENSE) — hand-landmarker model file is Apache-2.0 (Google MediaPipe).
