---
name: ove-react-video
description: Design and build high-end motion graphics videos using React, TypeScript (TSX), Flexbox, spring physics, and @ove/react components. Use whenever the user wants to build a video with React, improve design quality, or create SaaS launch reels, kinetic typography, bento grids, or UI explainers.
---

# Designing Videos with React (`@ove/react`)

MotionRender lets you build complete, broadcast-quality motion graphics videos as pure React components. 
Instead of computing manual pixel coordinates in JSON, you write modern **TSX with Flexbox, CSS Grid, spring physics, glassmorphism, and live media**.

---

## 1. Quick Starter (`video.tsx`)

Every React video is a default export component that accepts `props`, accompanied by an exported `config`:

```tsx
import { 
  AbsoluteFill, 
  Sequence, 
  useCurrentFrame, 
  useVideoConfig,
  springValue,
  KineticText,
  GlassCard,
  Badge,
  NumberTicker,
  AmbientGlow,
  Audio
} from 'motionrender/react';

export const config = {
  id: 'saas-launch',
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: 180, // 6 seconds at 30 fps
  background: '#090d16',
  props: {
    title: 'The Future of Video Production',
    stat: 99.9,
  }
};

export default function Video({ title, stat }: typeof config.props) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  return (
    <AbsoluteFill style={{ color: '#fff', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* 1. Atmospheric Ambient Lighting */}
      <AmbientGlow 
        orbs={[
          { x: '25%', y: '20%', size: 700, color: '#6366f1', opacity: 0.28 },
          { x: '80%', y: '80%', size: 800, color: '#ec4899', opacity: 0.22 },
        ]} 
      />

      {/* 2. Scene 1: Kinetic Headline (Frames 0 to 90) */}
      <Sequence from={0} durationInFrames={90}>
        <Audio src="sfx:whoosh" volume={0.5} />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 24, padding: 80 }}>
          <Badge dotColor="#38bdf8" delay={4}>NEXT GEN ENGINE</Badge>
          <h1 style={{ fontSize: 84, fontWeight: 800, letterSpacing: '-0.04em', margin: 0, textAlign: 'center' }}>
            <KineticText text={title} delay={8} preset="bouncy" />
          </h1>
        </AbsoluteFill>
      </Sequence>

      {/* 3. Scene 2: Glassmorphic Metric Card (Frames 90 to 180) */}
      <Sequence from={90} durationInFrames={90}>
        <Audio src="sfx:ding" volume={0.6} />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <GlassCard delay={6} style={{ width: 560, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <span style={{ fontSize: 18, color: '#94a3b8', fontWeight: 600 }}>SYSTEM ACCURACY</span>
            <div style={{ fontSize: 92, fontWeight: 900, color: '#38bdf8', letterSpacing: '-0.03em' }}>
              <NumberTicker value={stat} decimals={1} suffix="%" delay={10} preset="smooth" />
            </div>
            <p style={{ margin: 0, color: '#cbd5e1', fontSize: 16, lineHeight: 1.5 }}>
              Deterministic frame-accurate rendering powered by headless Chromium and React.
            </p>
          </GlassCard>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
}
```

---

## 2. Core Build Loop

1. **Write or edit** `video.tsx`.
2. **Build the bundle & composition**:
   ```bash
   ove build video.tsx
   ```
   * Compiles your React JSX with `esbuild`.
   * Emits `video.bundle.js` and `composition.json`.
3. **Inspect Still Frames**:
   ```bash
   ove still composition.json --frame 45 --output still-45.png
   ove still composition.json --frame 135 --output still-135.png
   ```
4. **Visual Review Sheet** (samples frames across the whole video):
   ```bash
   ove review composition.json --output review.png
   ```
5. **Render High-Quality MP4**:
   ```bash
   ove render composition.json --allow-code --output out.mp4
   ```
   *(Note: React videos execute component code during headless rendering, so `--allow-code` is required).*

---

## 3. Motion Components Kit Reference

Import directly from `motionrender/react` (or `@ove/react`):

### `<AmbientGlow orbs={[...]} blur={100} />`
Creates floating, organic gradient light orbs with continuous sine-wave drift in the background.
* `orbs`: Array of `{ x, y, size, color, opacity, speed, phase }`.
* Never leaves the canvas looking like a flat black box.

### `<GlassCard delay={n} preset="snappy">`
A frosted glass surface with spring entry:
* `background: rgba(255, 255, 255, 0.05)`
* `backdropFilter: blur(24px)`
* `border: 1px solid rgba(255, 255, 255, 0.12)`
* `boxShadow: 0 20px 50px rgba(0, 0, 0, 0.4)`

### `<KineticText text="..." delay={0} staggerDelay={3} preset="bouncy" />`
Staggers every word with natural spring physics:
* `preset`: `'bouncy'` (fun pop), `'snappy'` (modern tech), `'smooth'` (editorial), or `'gentle'`.
* `wordStyle`: Optional custom styling per word.

### `<NumberTicker value={1250} decimals={0} prefix="$" suffix="/mo" delay={10} />`
Smoothly animates numbers from 0 up to `value` using tabular numerals.

### `<Badge dot={true} dotColor="#10b981" delay={4}>`
SaaS status pill badge for kickers and category labels.

### `<DeviceFrame title="Dashboard" url="app.ove.dev" delay={8}>`
A sleek macOS browser window frame with traffic lights and URL bar.

### `<ProgressBar value={0.75} color="#38bdf8" delay={5} />`
Glowing horizontal progress bar with spring expansion.

---

## 4. Spring Physics & Animation Formulas

### `springValue(options)`
Evaluates spring damping physics directly from `frame`:

```tsx
const scale = springValue({ frame, fps, delay: 10, preset: 'bouncy', from: 0.8, to: 1.0 });
const y = springValue({ frame, fps, delay: 10, preset: 'snappy', from: 40, to: 0 });
const opacity = springValue({ frame, fps, delay: 10, from: 0, to: 1 });
```

**Preset Guide:**
* `'bouncy'`: `{ damping: 10, stiffness: 120, mass: 0.8 }` — for titles, badges, and icon pop-ins.
* `'snappy'`: `{ damping: 18, stiffness: 180, mass: 0.5 }` — for UI cards, device frames, buttons.
* `'smooth'`: `{ damping: 20, stiffness: 90, mass: 1.0 }` — for charts, progress bars, tickers.
* `'wobbly'`: `{ damping: 7, stiffness: 85, mass: 1.0 }` — playful overshoot.

### `stagger(index, framesPerItem, startDelay)`
Calculates the starting frame for staggered lists:
```tsx
const itemDelay = stagger(index, 4, 15);
```

---

## 5. Media & Timing in React

### Audio & Sound Effects
Use `<Audio />` anywhere inside a `<Sequence>`. When the sequence starts, the sound plays automatically:
```tsx
<Sequence from={0} durationInFrames={60}>
  <Audio src="sfx:whoosh" volume={0.6} />
  {/* visual content */}
</Sequence>
```
Supported sound effect presets: `sfx:whoosh`, `sfx:ding`, `sfx:click`, `sfx:pop`, `sfx:thump`, `sfx:tick`, `sfx:riser`.

### Video Footage
Use `<Video />` to place video clips under or over your components:
```tsx
<Video src="assets/background.mp4" layer="back" objectFit="cover" muted loop />
```

### Pictures & Fonts
* Place images in `assets/` and declare them in `config.assets`.
* Use `<Img src="assets/logo.png" />`.
* Inter font is built in with all weights (300 to 900).

---

## 6. Pro Design Rules for AI Video Production

1. **Always use Flexbox/Grid**: Never calculate absolute pixels like `left: 450px`. Let CSS Flexbox center and space cards cleanly.
2. **Secondary Motion**: Never let a scene stay 100% still. Combine a fast spring entry (`frame 0-20`) with subtle continuous scale or drift (`interpolate(frame, [0, 90], [1, 1.04])`).
3. **Typographic Hierarchy**:
   * Kicker / Badge: 14-16px, uppercase, letterSpacing: `0.05em`.
   * Headline: 64-96px, fontWeight: `800` or `900`, letterSpacing: `-0.04em`.
   * Body / Caption: 18-24px, color: `#94a3b8`, lineHeight: `1.6`.
4. **Pure Function Rule**: Every render MUST be a pure deterministic function of `frame`. Do NOT use `useState`, `setTimeout`, or `Math.random()`. Use `random('seed')` from `motionrender/react` for repeatable randomness.

