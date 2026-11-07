// A 15-second title film about motion itself: kinetic type, a perspective grid, layered 3D panels, light sweeps, dust and
// a sound pass. Build with `ove build examples/motion-graphics-film/video.tsx`, render with --allow-code (it is your code).
import { AbsoluteFill, Easing, Sequence, interpolate, random, spring, useCurrentFrame, useVideoConfig } from '@ove/react';
import type { CSSProperties, ReactNode } from 'react';

const INK = '#070607';
const BONE = '#f2ede4';
const EMBER = '#ff5a2b';
const MINT = '#a9f0cf';
const DISPLAY = 'Archivo, Inter, sans-serif';
const GROTESK = 'Space Grotesk, Inter, sans-serif';

export const config = {
  id: 'motion-engineering',
  name: 'Motion, Engineered',
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: 450,
  background: INK,
  export: { loudness: -16 },
  assets: [
    { id: 'vo-1', type: 'audio', src: './assets/vo-1.wav' },
    { id: 'vo-2', type: 'audio', src: './assets/vo-2.wav' },
    { id: 'vo-3', type: 'audio', src: './assets/vo-3.wav' },
    { id: 'vo-4', type: 'audio', src: './assets/vo-4.wav' },
  ],
};

// A small sound pass: hits on the cuts, a riser into the lockup, a tick and a ding on the wordmark. The voiceover sits
// above it, one line per scene, timed to the cut it introduces (scripts in voiceover/, audio in assets/).
export const layers = [
  { id: 'open', type: 'audio', src: 'sfx:whoosh', startFrame: 0, volume: 0.4 },
  { id: 'ignite', type: 'audio', src: 'sfx:thump', startFrame: 9, volume: 0.5 },
  { id: 'vo-1', type: 'audio', src: 'vo-1', startFrame: 8, volume: 1 },
  { id: 'cut-2', type: 'audio', src: 'sfx:whoosh', startFrame: 94, volume: 0.35 },
  { id: 'vo-2', type: 'audio', src: 'vo-2', startFrame: 104, volume: 1 },
  { id: 'cut-3', type: 'audio', src: 'sfx:whoosh', startFrame: 196, volume: 0.4 },
  { id: 'vo-3', type: 'audio', src: 'vo-3', startFrame: 206, volume: 1 },
  { id: 'riser', type: 'audio', src: 'sfx:riser', startFrame: 288, volume: 0.38 },
  { id: 'cut-4', type: 'audio', src: 'sfx:thump', startFrame: 308, volume: 0.5 },
  { id: 'vo-4', type: 'audio', src: 'vo-4', startFrame: 334, volume: 1 },
  { id: 'land', type: 'audio', src: 'sfx:tick', startFrame: 340, volume: 0.25 },
  { id: 'lock', type: 'audio', src: 'sfx:ding', startFrame: 374, volume: 0.2 },
];

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

const Grain = ({ opacity = 0.055 }: { opacity?: number }) => (
  <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity, mixBlendMode: 'overlay', pointerEvents: 'none' }}>
    <filter id="film-grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="2" stitchTiles="stitch" />
      <feColorMatrix type="saturate" values="0" />
    </filter>
    <rect width="100%" height="100%" filter="url(#film-grain)" />
  </svg>
);

const Vignette = () => (
  <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 72% 62% at 50% 48%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55) 100%)' }} />
);

const PerspectiveGrid = ({ frame }: { frame: number }) => {
  const travel = (frame * 3.2) % 96;
  const fadeIn = interpolate(frame, [6, 34], [0, 1], { easing: Easing.out(Easing.cubic) });
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', perspective: 900, opacity: fadeIn }}>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '56%',
          width: 3400,
          height: 2600,
          marginLeft: -1700,
          backgroundImage:
            'linear-gradient(rgba(255,90,43,0.28) 1px, rgba(0,0,0,0) 1px), linear-gradient(90deg, rgba(242,237,228,0.10) 1px, rgba(0,0,0,0) 1px)',
          backgroundSize: '96px 96px',
          transformOrigin: '50% 0%',
          transform: `rotateX(75deg) translateY(${travel}px)`,
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, #000 18%, #000 58%, rgba(0,0,0,0) 92%)',
          WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, #000 18%, #000 58%, rgba(0,0,0,0) 92%)',
        }}
      />
    </div>
  );
};

const Rings = ({ frame, fps }: { frame: number; fps: number }) => {
  const grow = clamp01(spring({ frame: frame - 4, fps, damping: 22, stiffness: 60, from: 0, to: 1 }));
  return (
    <svg width={1200} height={1200} viewBox="0 0 1200 1200" style={{ position: 'absolute', left: '50%', top: '50%', marginLeft: -600, marginTop: -600, opacity: 0.9 }}>
      <g transform={`translate(600 600) scale(${0.55 + grow * 0.45}) translate(-600 -600)`} fill="none">
        <circle cx={600} cy={600} r={430} stroke="rgba(242,237,228,0.10)" strokeWidth={1} />
        <g transform={`rotate(${frame * 0.35} 600 600)`}>
          <circle cx={600} cy={600} r={392} stroke="rgba(255,90,43,0.55)" strokeWidth={2} strokeDasharray="150 620" strokeLinecap="round" />
          <circle cx={600} cy={600} r={392} stroke="rgba(169,240,207,0.35)" strokeWidth={1} strokeDasharray="2 22" />
        </g>
        <g transform={`rotate(${-frame * 0.7} 600 600)`}>
          <circle cx={600} cy={600} r={470} stroke="rgba(242,237,228,0.16)" strokeWidth={1} strokeDasharray="1 16" />
        </g>
        <line x1={600} y1={130} x2={600} y2={170} stroke="rgba(242,237,228,0.35)" strokeWidth={2} />
        <line x1={600} y1={1030} x2={600} y2={1070} stroke="rgba(242,237,228,0.35)" strokeWidth={2} />
        <line x1={130} y1={600} x2={170} y2={600} stroke="rgba(242,237,228,0.35)" strokeWidth={2} />
        <line x1={1030} y1={600} x2={1070} y2={600} stroke="rgba(242,237,228,0.35)" strokeWidth={2} />
      </g>
    </svg>
  );
};

const Headline = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const letters = 'MOTION'.split('');
  const sweep = interpolate(frame, [34, 68], [-30, 130], { easing: Easing.inOut(Easing.cubic) });
  const sub = interpolate(frame, [46, 68], [0, 1], { easing: Easing.out(Easing.cubic) });
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'relative', fontFamily: DISPLAY, fontWeight: 900, fontSize: 300, lineHeight: 0.86, letterSpacing: '-0.055em', color: BONE, textShadow: '0 30px 120px rgba(255,90,43,0.18)' }}>
        <div style={{ display: 'flex' }}>
          {letters.map((char, i) => {
            const p = clamp01(spring({ frame: frame - 12 - i * 3, fps, damping: 17, stiffness: 92, from: 0, to: 1 }));
            return (
              <span key={i} style={{ display: 'inline-block', overflow: 'hidden', paddingBottom: '0.06em', marginBottom: '-0.06em' }}>
                <span style={{ display: 'inline-block', transform: `translateY(${(1 - p) * 108}%) rotate(${(1 - p) * 6}deg)`, filter: `blur(${(1 - p) * 18}px)`, opacity: clamp01(p * 2.4) }}>{char}</span>
              </span>
            );
          })}
        </div>
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(100deg, rgba(255,255,255,0) 42%, rgba(255,255,255,0.95) 50%, rgba(255,255,255,0) 58%)',
            backgroundSize: '280% 100%', backgroundPosition: `${sweep}% 0`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', pointerEvents: 'none',
          }}
        >
          MOTION
        </div>
      </div>
      <div style={{ marginTop: 44, display: 'flex', alignItems: 'center', gap: 18, opacity: sub, transform: `translateY(${(1 - sub) * 16}px)` }}>
        <span style={{ width: 46, height: 1, background: 'rgba(242,237,228,0.35)' }} />
        <span style={{ fontFamily: GROTESK, fontWeight: 300, fontSize: 21, letterSpacing: '0.34em', textTransform: 'uppercase', color: 'rgba(242,237,228,0.72)' }}>a study in engineered movement</span>
        <span style={{ width: 46, height: 1, background: 'rgba(242,237,228,0.35)' }} />
      </div>
    </div>
  );
};

const Scene1 = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const push = interpolate(frame, [0, 96], [1.14, 1], { easing: Easing.out(Easing.cubic) });
  const dot = clamp01(spring({ frame, fps, damping: 12, stiffness: 150, from: 0, to: 1 }));
  const pulse = 1 + Math.sin(frame * 0.22) * 0.06;
  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      <PerspectiveGrid frame={frame} />
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${push})` }}>
        <Rings frame={frame} fps={fps} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 26, height: 26, marginLeft: -13, marginTop: -13 }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: EMBER, transform: `scale(${dot * pulse})`, boxShadow: '0 0 60px 12px rgba(255,90,43,0.45)' }} />
          <div style={{ position: 'absolute', inset: -18, borderRadius: '50%', border: '1px solid rgba(255,90,43,0.5)', transform: `scale(${dot})`, opacity: 1 - dot * 0.6 }} />
        </div>
        <Headline />
      </div>
    </AbsoluteFill>
  );
};

const LineMask = ({ p, children, style }: { p: number; children: ReactNode; style?: CSSProperties }) => (
  <div style={{ overflow: 'hidden', ...style }}>
    <div style={{ transform: `translateY(${(1 - p) * 106}%)`, opacity: clamp01(p * 2.5) }}>{children}</div>
  </div>
);

const Scene2 = () => {
  const frame = useCurrentFrame();
  const reveal = interpolate(frame, [0, 16], [100, 0], { easing: Easing.inOut(Easing.cubic) });
  const wipeOut = interpolate(frame, [88, 102], [0, 1], { easing: Easing.inOut(Easing.cubic) });
  const line1 = clamp01(spring({ frame: frame - 6, fps: 30, damping: 20, stiffness: 88, from: 0, to: 1 }));
  const line2 = clamp01(spring({ frame: frame - 14, fps: 30, damping: 20, stiffness: 88, from: 0, to: 1 }));
  const meta = interpolate(frame, [24, 42], [0, 1], { easing: Easing.out(Easing.cubic) });
  const words = ['EASING', 'TIMING', 'DEPTH', 'LIGHT', 'SPACE', 'CODE'];
  return (
    <AbsoluteFill style={{ backgroundColor: BONE }}>
      <div style={{ position: 'absolute', inset: 0, backgroundColor: BONE, clipPath: `inset(${reveal}% 0 0 0)` }} />
      <div style={{ position: 'absolute', inset: 0, clipPath: `inset(${reveal}% 0 0 0)` }}>
        <div style={{ position: 'absolute', right: -10, top: 210, fontFamily: DISPLAY, fontWeight: 900, fontSize: 500, lineHeight: 1, color: 'transparent', WebkitTextStroke: '2px rgba(7,6,7,0.11)', transform: `rotate(${mix(-8, -4, frame / 102)}deg)`, letterSpacing: '-0.04em' }}>
          02
        </div>
        <svg width={620} height={620} viewBox="0 0 620 620" style={{ position: 'absolute', right: 120, top: 250 }}>
          <g transform={`rotate(${frame * 0.5} 310 310)`} fill="none" stroke="rgba(7,6,7,0.32)">
            <circle cx={310} cy={310} r={252} strokeWidth={1.5} strokeDasharray="2 13" />
            <circle cx={310} cy={310} r={190} strokeWidth={1.5} strokeDasharray="72 26" />
          </g>
          <g transform={`rotate(${-frame * 0.9} 310 310)`} fill="none" stroke="rgba(255,90,43,0.6)">
            <circle cx={310} cy={310} r={220} strokeWidth={3} strokeDasharray="130 400" strokeLinecap="round" />
          </g>
          <circle cx={310 + Math.cos(frame * 0.055) * 252} cy={310 + Math.sin(frame * 0.055) * 252} r={8} fill={EMBER} />
          <circle cx={310} cy={310} r={4} fill={INK} />
          <path d="M310 54 v18 M310 548 v18 M54 310 h18 M548 310 h18" stroke="rgba(7,6,7,0.45)" strokeWidth={2} />
        </svg>

        <div style={{ position: 'absolute', left: 150, top: 286, fontFamily: DISPLAY, fontWeight: 900, color: INK, letterSpacing: '-0.045em', lineHeight: 0.84 }}>
          <LineMask p={line1}>
            <div style={{ fontSize: 218 }}>PURE</div>
          </LineMask>
          <LineMask p={line2} style={{ marginTop: 6 }}>
            <div style={{ fontSize: 218 }}>
              KINETIC<span style={{ color: EMBER }}>.</span>
            </div>
          </LineMask>
        </div>

        <div style={{ position: 'absolute', left: 158, top: 796, display: 'flex', alignItems: 'center', gap: 16, opacity: meta }}>
          <span style={{ width: 10, height: 10, background: EMBER }} />
          <span style={{ fontFamily: GROTESK, fontSize: 19, letterSpacing: '0.26em', color: 'rgba(7,6,7,0.62)', textTransform: 'uppercase' }}>every frame composed, not captured</span>
        </div>

        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 76, background: INK, overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', transform: `translateX(${-(frame * 7.5)}px)` }}>
            {[...words, ...words, ...words, ...words].map((word, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', fontFamily: GROTESK, fontWeight: 500, fontSize: 20, letterSpacing: '0.3em', color: BONE }}>
                {word}
                <span style={{ display: 'inline-block', width: 8, height: 8, background: EMBER, margin: '0 34px' }} />
              </span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ position: 'absolute', inset: 0, backgroundColor: INK, transformOrigin: '50% 100%', transform: `scaleY(${wipeOut})`, pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};

const Dust = ({ frame, count = 64 }: { frame: number; count?: number }) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    {Array.from({ length: count }, (_, i) => {
      const speed = 0.35 + random(`v${i}`) * 1.8;
      const size = 1 + random(`s${i}`) * 2.6;
      const y = ((random(`y${i}`) * 1240 - frame * speed) % 1240 + 1240) % 1240 - 80;
      const x = random(`x${i}`) * 1920 + Math.sin((frame + i * 40) / 46) * 14;
      return <div key={i} style={{ position: 'absolute', left: x, top: y, width: size, height: size, borderRadius: '50%', background: i % 7 === 0 ? MINT : BONE, opacity: 0.08 + random(`o${i}`) * 0.3 }} />;
    })}
    {Array.from({ length: 7 }, (_, i) => {
      const size = 9 + random(`b${i}`) * 22;
      const y = ((random(`by${i}`) * 1240 - frame * (0.5 + random(`bv${i}`)) ) % 1240 + 1240) % 1240 - 60;
      return <div key={`b${i}`} style={{ position: 'absolute', left: random(`bx${i}`) * 1920, top: y, width: size, height: size, borderRadius: '50%', background: random(`bc${i}`) > 0.6 ? 'rgba(255,90,43,0.25)' : 'rgba(242,237,228,0.16)', filter: 'blur(7px)' }} />;
    })}
  </AbsoluteFill>
);

type PanelDef = { x: number; z: number; label: string; value: number; unit: string; copy: string };

const Panel = ({ def, index, frame, fps }: { def: PanelDef; index: number; frame: number; fps: number }) => {
  const enter = clamp01(spring({ frame: frame - 14 - index * 8, fps, damping: 21, stiffness: 82, from: 0, to: 1 }));
  const count = interpolate(frame, [24 + index * 8, 56 + index * 8], [0, def.value], { easing: Easing.out(Easing.cubic) });
  return (
    <div
      style={{
        position: 'absolute', left: '50%', top: '50%', width: 470, height: 320, marginLeft: -235, marginTop: -160,
        transformStyle: 'preserve-3d', transform: `translateX(${mix(560, def.x, enter)}px) translateZ(${def.z}px) translateY(${(1 - enter) * 40}px)`,
        opacity: enter,
        background: 'linear-gradient(155deg, rgba(255,255,255,0.075) 0%, rgba(255,255,255,0.022) 55%, rgba(255,90,43,0.05) 100%)',
        border: '1px solid rgba(242,237,228,0.16)',
        boxShadow: '0 40px 90px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.14)',
        padding: '30px 34px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontFamily: GROTESK, fontSize: 13, letterSpacing: '0.24em', color: 'rgba(242,237,228,0.55)' }}>{def.label}</span>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: index === 1 ? MINT : EMBER, marginTop: 3 }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 124, lineHeight: 0.9, letterSpacing: '-0.04em', color: BONE }}>{Math.round(count)}</span>
        <span style={{ fontFamily: GROTESK, fontSize: 14, letterSpacing: '0.18em', color: 'rgba(242,237,228,0.5)' }}>{def.unit}</span>
      </div>
      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 17, lineHeight: 1.45, color: 'rgba(242,237,228,0.66)', maxWidth: 350 }}>{def.copy}</div>
    </div>
  );
};

const Scene3 = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cam = interpolate(frame, [0, 108], [0, 1], { easing: Easing.inOut(Easing.cubic) });
  const rotateY = mix(-17, -3, cam);
  const rotateX = mix(8, 1, cam);
  const zoom = mix(1.1, 1.0, cam);
  const sweep = interpolate(frame, [58, 96], [-35, 135], { easing: Easing.inOut(Easing.cubic) });
  const panels: PanelDef[] = [
    { x: -500, z: 0, label: 'FRAME RATE', value: 30, unit: 'FPS', copy: 'The clock is explicit. Any frame can be rebuilt on any machine.' },
    { x: 0, z: 90, label: 'TIMELINE', value: 450, unit: 'FRAMES', copy: 'One continuous take, cut in the edit and numbered in the file.' },
    { x: 500, z: 180, label: 'RENDERS', value: 100, unit: '% IDENTICAL', copy: 'No drift between renders. Change the formula, not the pixels.' },
  ];
  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      <Dust frame={frame} />
      <div style={{ position: 'absolute', left: -60, top: 290, fontFamily: DISPLAY, fontWeight: 900, fontSize: 460, lineHeight: 1, letterSpacing: '-0.05em', color: 'rgba(242,237,228,0.035)', transform: `translateX(${-frame * 0.35}px)` }}>DEPTH</div>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', perspective: 1500 }}>
        <div style={{ position: 'relative', width: 1920, height: 1080, transformStyle: 'preserve-3d', transform: `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${zoom})` }}>
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: 1100, height: 520, marginLeft: -550, marginTop: -260, background: 'radial-gradient(ellipse at center, rgba(255,90,43,0.20) 0%, rgba(255,90,43,0) 70%)', filter: 'blur(30px)' }} />
          {panels.map((def, i) => <Panel key={def.label} def={def} index={i} frame={frame} fps={fps} />)}
        </div>
      </div>
      <div
        style={{
          position: 'absolute', top: -200, left: `${sweep}%`, width: 220, height: 1500, transform: 'rotate(16deg)',
          background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0) 100%)',
          mixBlendMode: 'screen', pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'absolute', left: 120, bottom: 128, display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ width: 38, height: 1, background: 'rgba(242,237,228,0.3)' }} />
        <span style={{ fontFamily: GROTESK, fontSize: 14, letterSpacing: '0.3em', color: 'rgba(242,237,228,0.5)' }}>COMPOSITION / LAYERS IN SPACE</span>
      </div>
    </AbsoluteFill>
  );
};

const Scene4 = () => {
  const frame = useCurrentFrame();
  const horizon = interpolate(frame, [10, 38], [0, 1], { easing: Easing.out(Easing.cubic) });
  const rise = interpolate(frame, [14, 66], [340, 0], { easing: Easing.out(Easing.cubic) });
  const wipe = interpolate(frame, [36, 78], [0, 1], { easing: Easing.inOut(Easing.cubic) });
  const gap = mix(88, 2, interpolate(frame, [36, 92], [0, 1], { easing: Easing.out(Easing.cubic) }));
  const tagline = interpolate(frame, [72, 90], [0, 1], { easing: Easing.out(Easing.cubic) });
  const meta = interpolate(frame, [84, 102], [0, 1], { easing: Easing.out(Easing.cubic) });
  const streak = interpolate(frame, [96, 128], [-25, 125], { easing: Easing.inOut(Easing.cubic) });
  const settle = interpolate(frame, [0, 144], [1.025, 1], { easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ backgroundColor: INK, transform: `scale(${settle})` }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 646, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: '50%', top: 646, width: 780, height: 270, marginLeft: -390, marginTop: -270, borderRadius: '390px 390px 0 0', transform: `translateY(${rise * 0.85}px)`, background: 'radial-gradient(circle at 50% 100%, #ffd2b0 0%, #ff5a2b 38%, rgba(255,90,43,0.35) 66%, rgba(255,90,43,0) 84%)', filter: 'blur(3px)', opacity: 0.95 }} />
      </div>
      <div style={{ position: 'absolute', left: 120, right: 120, top: 646, height: 1, background: 'rgba(242,237,228,0.45)', transform: `scaleX(${horizon})`, boxShadow: '0 0 40px rgba(255,90,43,0.35)' }} />
      <div style={{ position: 'absolute', left: '50%', top: 620, width: 2, height: 52, marginLeft: -1, background: 'rgba(242,237,228,0.5)', transform: `scaleY(${horizon})` }} />

      <div style={{ position: 'absolute', left: 0, right: 0, top: 196, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: `${gap}px`, whiteSpace: 'nowrap', clipPath: `inset(-25% ${(1 - wipe) * 100}% -25% 0)` }}>
          {'MOTIONRENDER'.split('').map((char, i) => (
            <span key={i} style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 128, lineHeight: 1, letterSpacing: '-0.02em', color: BONE, textShadow: '0 6px 50px rgba(0,0,0,0.35)' }}>{char}</span>
          ))}
        </div>
      </div>

      <div style={{ position: 'absolute', left: 0, right: 0, top: 718, textAlign: 'center', fontFamily: GROTESK, fontWeight: 300, fontSize: 34, letterSpacing: '0.1em', color: 'rgba(242,237,228,0.82)', opacity: tagline, transform: `translateY(${(1 - tagline) * 18}px)` }}>
        Motion, engineered.
      </div>

      <div style={{ position: 'absolute', left: 0, right: 0, top: 942, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 26, opacity: meta }}>
        {['DETERMINISTIC', 'FRAME-EXACT', 'CODE-NATIVE'].map((word, i) => (
          <span key={word} style={{ display: 'inline-flex', alignItems: 'center', gap: 26, fontFamily: GROTESK, fontSize: 12.5, letterSpacing: '0.3em', color: 'rgba(242,237,228,0.5)' }}>
            {word}
            {i < 2 && <span style={{ width: 5, height: 5, background: EMBER }} />}
          </span>
        ))}
      </div>

      <div
        style={{
          position: 'absolute', top: 250, left: `${streak}%`, width: 3, height: 760, background: 'linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0.7) 50%, rgba(255,255,255,0) 100%)',
          transform: 'rotate(24deg)', filter: 'blur(1.5px)', mixBlendMode: 'screen', opacity: 0.6,
        }}
      />
    </AbsoluteFill>
  );
};

const Chrome = () => {
  const frame = useCurrentFrame();
  const onBone = frame >= 96 && frame < 198;
  const color = onBone ? INK : BONE;
  const scene = frame < 96 ? '01' : frame < 198 ? '02' : frame < 306 ? '03' : '04';
  const seconds = Math.floor(frame / 30);
  const timecode = `00:00:${String(seconds).padStart(2, '0')}:${String(frame % 30).padStart(2, '0')}`;
  const hide = interpolate(frame, [306, 334], [0, 1], { easing: Easing.inOut(Easing.cubic) });
  const corner = (style: CSSProperties) => <div style={{ position: 'absolute', width: 20, height: 20, borderColor: `${color}55`, borderStyle: 'solid', borderWidth: 0, ...style }} />;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', color, opacity: 1 - hide }}>
      <div style={{ position: 'absolute', left: 56, top: 48, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <span style={{ fontFamily: GROTESK, fontWeight: 600, fontSize: 14, letterSpacing: '0.32em' }}>MOTIONRENDER</span>
        <span style={{ fontFamily: GROTESK, fontWeight: 300, fontSize: 11, letterSpacing: '0.26em', opacity: 0.55 }}>STUDY 01 — ENGINEERED MOTION</span>
      </div>
      <div style={{ position: 'absolute', right: 56, top: 48, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 7 }}>
        <span style={{ fontFamily: GROTESK, fontWeight: 500, fontSize: 13, letterSpacing: '0.22em' }}>{scene} / 04</span>
        <span style={{ fontFamily: GROTESK, fontWeight: 300, fontSize: 11, letterSpacing: '0.2em', opacity: 0.55 }}>{timecode}</span>
      </div>
      {!onBone && (
        <>
          <div style={{ position: 'absolute', left: 56, bottom: 48, fontFamily: GROTESK, fontWeight: 300, fontSize: 11, letterSpacing: '0.26em', opacity: 0.5 }}>1920 × 1080 / 30 FPS</div>
          <div style={{ position: 'absolute', right: 56, bottom: 48, fontFamily: GROTESK, fontWeight: 300, fontSize: 11, letterSpacing: '0.26em', opacity: 0.5 }}>RENDERED FROM CODE</div>
        </>
      )}
      {corner({ left: 28, top: 28, borderLeftWidth: 1, borderTopWidth: 1 })}
      {corner({ right: 28, top: 28, borderRightWidth: 1, borderTopWidth: 1 })}
      {corner({ left: 28, bottom: 28, borderLeftWidth: 1, borderBottomWidth: 1 })}
      {corner({ right: 28, bottom: 28, borderRightWidth: 1, borderBottomWidth: 1 })}
    </div>
  );
};

export default function Video() {
  const frame = useCurrentFrame();
  const onBone = frame >= 96 && frame < 198;
  const fadeOut = interpolate(frame, [434, 449], [0, 1], { easing: Easing.inOut(Easing.cubic) });
  return (
    <AbsoluteFill style={{ backgroundColor: INK, overflow: 'hidden', fontFamily: 'Inter, sans-serif' }}>
      <Sequence from={0} durationInFrames={96}><Scene1 /></Sequence>
      <Sequence from={96} durationInFrames={102}><Scene2 /></Sequence>
      <Sequence from={198} durationInFrames={108}><Scene3 /></Sequence>
      <Sequence from={306} durationInFrames={144}><Scene4 /></Sequence>
      <Chrome />
      {!onBone && <Vignette />}
      <Grain />
      <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: fadeOut, pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
}
