import { useCallback, useEffect, useRef, useState } from "react";
import {
  Question, HandWaving, X, CaretDown, CaretUp,
  HandPalm, HandPointing, HandFist, Peace, ThumbsUp, ThumbsDown,
  NumberCircleSix, NumberCircleSeven, NumberCircleThree, NumberCircleFour,
  ArrowArcLeft, ArrowArcRight, ArrowsVertical, SlidersHorizontal,
} from "phosphor-react";
import { engine, type Intent } from "./music/engine";
import { INSTRUMENTS } from "./music/instruments";
import { KEYS, type KeyName } from "./music/theory";
import { HandTracker, handFeatures, type HandFeatures } from "./gestures/hands";
import { GestureMapper, type GestureState } from "./gestures/map";
import type { HandLandmarkerResult } from "@mediapipe/tasks-vision";

type Phase = "landing" | "loading" | "live" | "denied";

const FINGERTIPS = [4, 8, 12, 16, 20];

export default function App() {
  const [phase, setPhase] = useState<Phase>("landing");
  const [err, setErr] = useState<string | null>(null);
  const [key, setKey] = useState<KeyName>("C");
  const [instrumentId, setInstrumentId] = useState(INSTRUMENTS[0]!.id);
  const [guide, setGuide] = useState(false);
  const [leftOnly, setLeftOnly] = useState(false);
  /* Dock collapses so the stage stays the product - starts collapsed
     on phones where the picker rows would eat a third of the frame. */
  const [dockOpen, setDockOpen] = useState(() => typeof window !== "undefined" && window.innerWidth > 640);
  /* pitch-shift direction toggles - the mapper reads live refs */
  const [raiseOn, setRaiseOn] = useState(true);
  const [lowerOn, setLowerOn] = useState(true);
  /* iOS silent-switch eats WebAudio - surface the hint once live */
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const [soundHint, setSoundHint] = useState(isIOS);
  const [gs, setGs] = useState<GestureState | null>(null);
  const [chordName, setChordName] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tracker = useRef<HandTracker | null>(null);
  const mapper = useRef(new GestureMapper());
  const keyRef = useRef(key);
  keyRef.current = key;
  const leftOnlyRef = useRef(leftOnly);
  leftOnlyRef.current = leftOnly;
  const raiseOnRef = useRef(raiseOn);
  raiseOnRef.current = raiseOn;
  const lowerOnRef = useRef(lowerOn);
  lowerOnRef.current = lowerOn;

  const onResult = useCallback((res: HandLandmarkerResult | null) => {
    let left: HandFeatures | null = null;
    let right: HandFeatures | null = null;
    if (res?.landmarks) {
      res.landmarks.forEach((lm, i) => {
        /* MediaPipe's handedness already assumes a selfie-style
           mirrored frame: "Left" IS the user's physical left hand.
           No swap needed - the earlier inversion made the chord hand
           read as the sound hand. */
        const handed = res.handedness[i]?.[0]?.categoryName === "Left" ? "Left" : "Right";
        const f = handFeatures(lm, handed);
        if (handed === "Left") left = f; else right = f;
      });
    }
    mapper.current.leftOnly = leftOnlyRef.current;
    mapper.current.raiseEnabled = raiseOnRef.current;
    mapper.current.lowerEnabled = lowerOnRef.current;
    const s = mapper.current.update(left, right);
    setGs(s);

    const intent: Intent = {
      key: keyRef.current,
      degree: s.degree,
      triad: s.triad,
      quality: s.quality,
      octaveShift: s.octaveShift,
      semiShift: s.semiShift,
      gain: s.gain,
      filter: s.filter,
      playing: s.playing,
    };
    engine.apply(intent);
    setChordName(engine.currentChord?.name ?? null);
    drawOverlay(canvasRef.current, s);
  }, []);

  const begin = async () => {
    setPhase("loading");
    setErr(null);
    /* Stage the startup so the denied screen names the actual failure -
       a camera denial and a model-load failure look identical to a
       catch-all. */
    try {
      await engine.start();
    } catch {
      setErr("audio couldn't start - check volume/silent mode and retry");
      setPhase("denied");
      return;
    }
    const t = new HandTracker();
    t.onResult = onResult;
    try {
      await t.init();
    } catch {
      setErr("hand-tracking model failed to load - refresh and retry");
      setPhase("denied");
      return;
    }
    try {
      if (!videoRef.current) throw new Error("no video element");
      await t.start(videoRef.current);
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      setErr(
        name === "NotAllowedError" ? "camera access was denied - allow it in the browser bar and retry"
        : name === "NotFoundError" || name === "OverconstrainedError" ? "no camera found on this device"
        : name === "NotReadableError" ? "camera is busy - close other apps using it and retry"
        : "camera failed to start - retry",
      );
      setPhase("denied");
      return;
    }
    tracker.current = t;
    setPhase("live");
  };

  useEffect(() => () => tracker.current?.stop(), []);

  const instrument = INSTRUMENTS.find((i) => i.id === instrumentId)!;

  return (
    <div className="app-shell" style={{ position: "fixed", inset: 0, overflow: "hidden", background: "var(--color-ink)", display: "flex" }}>
      {/* guide panel - in-flow sibling, pushes the stage instead of
          covering it: users see themselves AND the sheet together */}
      {guide && <Guide gs={gs} onClose={() => setGuide(false)} />}

      {/* stage wrapper - relative so the feed/chrome stay inside it
          when the guide panel takes column width */}
      <div className="stage" style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <video
        ref={videoRef}
        muted
        playsInline
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          objectFit: "cover", transform: "scaleX(-1)",
          opacity: phase === "live" ? 1 : 0.25, transition: "opacity .4s",
        }}
      />
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />

      {/* readability scrims - thin gradients over bright feeds so the
          HUD, chrome and dock stay legible without dimming the stage */}
      {phase === "live" && (
        <>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "18%", background: "linear-gradient(to bottom, rgba(0,0,0,.38), transparent)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "34%", background: "linear-gradient(to top, rgba(0,0,0,.42), transparent)", pointerEvents: "none" }} />
        </>
      )}

      {/* top chrome - floats over the feed */}
      <header className="chrome chrome-top" style={{ justifyContent: "space-between" }}>
        <span className="glass logo-chip">
          gesture studio
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className={`glass glass-btn ${leftOnly ? "glass-sel" : ""}`}
            onClick={() => setLeftOnly((v) => !v)}
            title="one-hand mode"
          >
            <HandWaving size={15} /> <span className="hide-sm">left hand only</span>
          </button>
          <button className="glass glass-btn" onClick={() => setGuide(true)} aria-label="guide">
            <Question size={15} />
          </button>
        </div>
      </header>

      {/* landing / error overlay */}
      {phase !== "live" && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", padding: 24, background: "rgba(253,252,252,.82)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
          <div>
            <h1 style={{ fontSize: "clamp(34px, 9vw, 56px)", marginBottom: 16, color: "var(--color-ink)" }}>
              make music with<br />your hands
            </h1>
            <p className="muted" style={{ maxWidth: 430, margin: "0 auto 24px", fontSize: 15, lineHeight: 1.55 }}>
              a camera-tracked instrument - left hand picks the chord,
              right hand shapes the sound. {INSTRUMENTS.length} voices.
            </p>
            {phase === "landing" && (
              <button className="pill pill-fill" style={{ padding: "13px 32px", fontSize: 15 }} onClick={() => void begin()}>
                start playing
              </button>
            )}
            {phase === "loading" && <p className="caption">warming up the camera + audio engine…</p>}
            {phase === "denied" && (
              <>
                <p style={{ color: "var(--color-danger)", fontSize: 13, marginBottom: 14 }}>{err}</p>
                <button className="pill" onClick={() => void begin()}>try again</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* HUD - chord readout, centered top-third over the feed */}
      {phase === "live" && (
        <div style={{ position: "absolute", top: "14%", left: 0, right: 0, textAlign: "center", pointerEvents: "none" }}>
          <div className="glass" style={{ display: "inline-block", fontFamily: "var(--font-display)", fontWeight: 300, fontSize: "clamp(24px, 6vw, 34px)", letterSpacing: "-0.02em", padding: "10px 26px", borderRadius: "var(--radius-pill)", maxWidth: "86vw" }}>
            {gs?.playing ? (chordName ?? "…") : "waiting for your hands…"}
          </div>
        </div>
      )}

      {/* bottom dock - controls float over the feed, collapsible so the
          stage keeps max visibility on small screens */}
      <footer className="chrome chrome-bottom" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
        {phase === "live" && (
          <button
            className="glass glass-btn dock-toggle"
            onClick={() => setDockOpen((v) => !v)}
            aria-label={dockOpen ? "hide controls" : "show controls"}
            aria-expanded={dockOpen}
          >
            {dockOpen ? <CaretDown size={14} /> : <CaretUp size={14} />}
            {dockOpen ? "" : `${key} · ${instrument.label}`}
          </button>
        )}
        {dockOpen && (
          <div className="glass glass-dock">
            <div className="caption dock-label">key</div>
            <div className="pill-row">
              {KEYS.map((k) => (
                <button key={k} className={`pill pill-dark ${k === key ? "pill-sel-dark" : ""}`} onClick={() => setKey(k)}>
                  {k}
                </button>
              ))}
            </div>
            <div className="caption dock-label" style={{ marginTop: 12 }}>
              voice · <span className="dock-hint">{instrument.hint}</span>
            </div>
            <div className="pill-row">
              {INSTRUMENTS.map((i) => {
                const Ico = i.icon;
                return (
                  <button
                    key={i.id}
                    className={`pill pill-dark ${i.id === instrumentId ? "pill-sel-dark" : ""}`}
                    onClick={() => { setInstrumentId(i.id); engine.setInstrument(i.id); }}
                  >
                    <Ico size={15} weight={i.id === instrumentId ? "fill" : "regular"} /> {i.label}
                  </button>
                );
              })}
            </div>
            {/* pitch-shift toggles + meters */}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className={`pill pill-dark ${raiseOn ? "pill-sel-dark" : ""}`} onClick={() => setRaiseOn((v) => !v)}>shift ↑</button>
              <button className={`pill pill-dark ${lowerOn ? "pill-sel-dark" : ""}`} onClick={() => setLowerOn((v) => !v)}>shift ↓</button>
            </div>
            <div style={{ display: "flex", gap: 18, marginTop: 14 }}>
              <span className="hud-chip hud-dark" style={{ flex: 1 }}>
                vol <span className="meter meter-dark"><i style={{ width: `${Math.round((gs?.gain ?? 0) * 100)}%` }} /></span>
              </span>
              <span className="hud-chip hud-dark" style={{ flex: 1 }}>
                flt <span className="meter meter-dark"><i style={{ width: `${Math.round((gs?.filter ?? 0) * 100)}%` }} /></span>
              </span>
            </div>
          </div>
        )}
      </footer>

      {/* iOS silent switch eats WebAudio - one-shot heads-up, bottom-right
          like the reference so it doesn't cover the HUD */}
      {phase === "live" && soundHint && (
        <div style={{ position: "absolute", bottom: "24%", right: 14, zIndex: 15, maxWidth: 240 }} className="glass glass-btn" onClick={() => setSoundHint(false)} role="button">
          <span style={{ fontSize: 12, lineHeight: 1.5 }}>
            <strong style={{ color: "var(--color-ember-orange)", display: "block", letterSpacing: "0.06em" }}>NO SOUND?</strong>
            Check that Silent Mode is off and volume is turned up. <span style={{ opacity: 0.6 }}>✕</span>
          </span>
        </div>
      )}

      </div>{/* /stage */}
    </div>
  );
}

/* landmark skeleton - spark colors: violet left, ember right, glow
   dots on the fingertips like the reference tracker */
function drawOverlay(
  canvas: HTMLCanvasElement | null,
  s: GestureState,
) {
  const left = s.left, right = s.right;
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth * dpr;
  const h = canvas.clientHeight * dpr;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  ctx.clearRect(0, 0, cw, ch);

  const draw = (f: HandFeatures | null, color: string) => {
    if (!f) return;
    /* Landmarks are in RAW frame coords; the video is CSS-mirrored, so
       flip x here or the skeleton lands on the wrong side.
       Minimal dot style (like the reference): soft dots on every
       landmark, fingertips slightly bigger - no bones cluttering the
       feed. Dots tint with the hand color so left/right still reads. */
    const px = (p: { x: number; y: number }) => [(1 - p.x) * cw, p.y * ch] as const;
    const tips = new Set([4, 8, 12, 16, 20]);

    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.85;
    f.landmarks.forEach((p, i) => {
      const [x, y] = px(p);
      /* soft shadow so dots stay visible on light skin/sky */
      ctx.beginPath();
      ctx.arc(x, y, tips.has(i) ? 5.5 : 4, 0, Math.PI * 2);
      ctx.fill();
    });
    /* fingertip halo in the hand's color - the playable ends read
       brighter without a bone skeleton */
    ctx.fillStyle = color;
    for (const t of tips) {
      const [x, y] = px(f.landmarks[t]!);
      ctx.globalAlpha = 0.3;
      ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  /* Per-hand label chips - what this hand is doing right now, anchored
     just above the wrist. Left names the chord quality state, right
     names the shaping params. */
  const label = (f: HandFeatures | null, color: string, lines: string[]) => {
    if (!f) return;
    const wrist = f.landmarks[0]!;
    const lx = (1 - wrist.x) * cw;
    const ly = Math.max(26, wrist.y * ch - 44);
    ctx.font = "600 11px ui-monospace, monospace";
    const wMax = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 20;
    const hLine = 16;
    const h = lines.length * hLine + 12;
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.beginPath();
    ctx.roundRect(lx - wMax / 2, ly - h, wMax, h, 9);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(lx - wMax / 2, ly - h, wMax, h, 9);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    lines.forEach((l, i) => ctx.fillText(l, lx, ly - h + 18 + i * hLine));
  };

  draw(left, "#0447ff");
  draw(right, "#ff4704");
  if (left) {
    const t = s.triad === "major" ? "maj" : s.triad === "minor" ? "min" : "dia";
    label(left, "#7aa5ff", [`deg ${["","I","II","III","IV","V","VI","VII"][s.degree]} · ${t}${s.semiShift !== 0 ? ` · ${s.semiShift > 0 ? "↑" : "↓"}1` : ""}`]);
  }
  if (right) {
    label(right, "#ff8a5c", [`oct ${s.octaveShift > 0 ? "+1" : s.octaveShift < 0 ? "-1" : "0"} · vol ${Math.round(s.gain * 100)}%`]);
  }
}

/* The gesture reference sheet - a persistent side sheet (glass over
   the live feed, never blocks the stage) with live highlighting: the
   row matching what your hands are currently doing glows. */
function Guide({ gs, onClose }: { gs: GestureState | null; onClose: () => void }) {
  const left = gs?.left ?? null;
  const right = gs?.right ?? null;
  /* live-match predicates - a row lights up when its gesture is the
     one currently detected on that hand */
  const degActive = (n: number) => !!left && gs?.degree === n;
  const triadActive = (t: string) => !!left && gs?.triad === t;
  const qActive = (q: string) => !!right && gs?.quality === q;
  const shiftActive = !!left && gs?.semiShift !== 0;
  const octActive = !!right && gs?.octaveShift !== 0;
  const filterActive = !!right && Math.abs(right.tilt) > 0.18;

  return (
    <div className="guide-sheet">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ fontSize: 28 }}>how to play</h2>
        <button className="pill pill-ghost" onClick={onClose} aria-label="close guide"><X size={16} /></button>
      </div>
      <div className="guide-scroll">
        <GSection title="left hand - the chord">
          <GRow on={degActive(1) || degActive(2) || degActive(3) || degActive(4) || degActive(5)} icon={<HandPalm size={18} />} k="fingers" v="1-4 → I, II, III, IV · 5 → V" live={left ? `now: ${["", "I", "II", "III", "IV", "V", "VI", "VII"][gs?.degree ?? 0]}` : undefined} />
          <GRow on={degActive(6)} icon={<NumberCircleSix size={18} />} k="index + pinky" v="VI" />
          <GRow on={degActive(7)} icon={<NumberCircleSeven size={18} />} k="index + pinky + thumb" v="VII" />
          <GRow on={triadActive("major")} icon={<ArrowArcLeft size={18} />} k="tilt inward" v="force major" />
          <GRow on={triadActive("minor")} icon={<ArrowArcRight size={18} />} k="tilt outward" v="force minor" />
          <GRow on={shiftActive} icon={<ArrowsVertical size={18} />} k="top / bottom of frame" v="shift ±1 semitone" live={left ? `now: ${gs?.semiShift === 1 ? "raising" : gs?.semiShift === -1 ? "lowering" : "level"}` : undefined} />
          <GRow on={!!left && left.fingers === 0 && !left.digits.thumb} icon={<HandFist size={18} />} k="fist" v="stop the sound" />
        </GSection>
        <GSection title="right hand - the sound">
          <GRow on={qActive("root")} icon={<HandPointing size={18} />} k="1 finger" v="root position" />
          <GRow on={qActive("firstInv")} icon={<Peace size={18} />} k="2 fingers" v="first inversion" />
          <GRow on={qActive("seventh")} icon={<NumberCircleThree size={18} />} k="3 fingers" v="seventh chord" />
          <GRow on={qActive("domSeventh")} icon={<NumberCircleFour size={18} />} k="4 fingers" v="dominant / dim 7th" />
          <GRow on={octActive} icon={<><ThumbsUp size={16} /><ThumbsDown size={16} /></>} k="thumb in / out" v="octave up / down" live={right ? `now: ${gs?.octaveShift === 1 ? "up" : gs?.octaveShift === -1 ? "down" : "level"}` : undefined} />
          <GRow on={filterActive} icon={<SlidersHorizontal size={18} />} k="tilt" v="filter open / dark" />
          <GRow on={!!right} icon={<ArrowsVertical size={18} />} k="height" v="volume up / down" live={right ? `now: ${Math.round((gs?.gain ?? 0) * 100)}%` : undefined} />
        </GSection>
        <p className="guide-tip">
          tip: keep your palm facing the camera and give each chord a beat
          to settle - quick flicks are debounced so they won't stutter.
        </p>
      </div>
    </div>
  );
}

function GSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div className="caption" style={{ marginBottom: 6 }}>{title}</div>
      <div style={{ borderTop: "1px solid var(--color-stone)" }}>{children}</div>
    </div>
  );
}

/* `on` = this row's gesture is live on the hand right now - the row
   lights up so you learn by watching which row answers you. */
function GRow({ icon, k, v, on, live }: { icon?: React.ReactNode; k: string; v: string; on?: boolean; live?: string }) {
  return (
    <div className={`guide-row ${on ? "guide-row-on" : ""}`}>
      <span className="guide-row-key">
        <span style={{ display: "inline-flex", gap: 2 }}>{icon}</span>
        {k}
      </span>
      <span className="guide-row-val">{v}{live ? <em className="guide-live">{live}</em> : null}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div className="caption" style={{ marginBottom: 6 }}>{title}</div>
      <div style={{ borderTop: "1px solid var(--color-stone)" }}>{children}</div>
    </div>
  );
}

function Row({ icon, k, v }: { icon?: React.ReactNode; k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "7px 0", borderBottom: "1px solid var(--color-stone)", fontSize: 14 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-graphite)", display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span style={{ display: "inline-flex", color: "var(--color-smoke)", gap: 2 }}>{icon}</span>
        {k}
      </span>
      <span className="muted">{v}</span>
    </div>
  );
}
