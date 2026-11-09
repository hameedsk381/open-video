---
name: ove-code-video
description: Write an MotionRender video as TypeScript, JavaScript or React components (loops, functions, springs, generated scenes, JSX), and draw custom visuals with a code layer. Use when the video needs logic JSON cannot express: generated layouts, data-driven scenes, physics, particles, charts or custom canvas drawing.
---

# Video as code

Three tools, from safest to most powerful. The main `ove` skill has every layer and field; this page is how to write them from code.

## 1. The builder: code that generates the JSON (safe)

```js
import { createVideo, text, rect, group, sfx, sample, spring, riseIn, keyframes, tween, fadeIn } from 'motionrender/builder';

const v = createVideo({ id: 'launch', width: 1920, height: 1080, fps: 30, background: '#0b1020', motionBlur: true });
v.export({ loudness: -16 });

v.scene('intro', { seconds: 4 }, scene => {
  scene.add(text('Write the video.', { x: 160, y: 330, fontSize: 150, fontWeight: 800, color: '#f5f7fb', maxWidth: 1600, split: { by: 'words', stagger: 5, preset: 'rise' } }));
  scene.add(text('Exact, repeatable.', { x: 160, y: 560, fontSize: 48, color: '#9aa6c4', animations: riseIn(560, 30, 20, 24) }));
  scene.add(rect({ x: 160, y: 700, width: 1, height: 10, fill: '#22d3ee', animations: [sample('width', 20, 70, f => spring({ frame: f - 20, from: 1, to: 520 }))] }));
  scene.add(sfx('whoosh', { startFrame: 4 }));
});
export default v;
```

- `ove build video.mjs` (or `.ts` on Node 22.18+) writes `composition.json` beside the file, checked against the schema. Then `ove validate`, `ove review`, `ove render` as usual.
- It runs only at build time, so the video stays frame-exact. Use ordinary loops and functions to make scenes: `features.map((f, i) => ...)`, `for` loops, data from a file.
- `sample(property, from, to, fn)` turns any function of the frame into keyframes (springs, noise, sine waves, physics). `spring`, `interpolate`, `tween`, `keyframes`, `fadeIn`, `riseIn(y, distance, frames, delay)` are helpers. Animated values are absolute, so give `riseIn` the layer's own `y`; for a child of a group with a `layout`, use `0`.
- Layers without an `id` get one (`text-1`); a repeated explicit id is an error. `v.variable`, `v.component`, `v.asset`, `v.export` set the other parts. `use('component', { values }, { x, y })` places a component.
- Layer constructors: `text rect circle path image clip audio sfx group html lottie shader captions code use`.

## 2. React components (see the dedicated `ove-react-video` skill for the full component kit)

For Remotion-style videos: components that are pure functions of the frame with spring physics, glassmorphism, and kinetic typography.

```tsx
import { AbsoluteFill, Sequence, KineticText, GlassCard, AmbientGlow, Audio, useCurrentFrame, useVideoConfig } from 'motionrender/react';
export const config = { id: 'promo', width: 1920, height: 1080, fps: 30, durationInFrames: 270, background: '#0b1020', props: { title: 'Hello' } };
export default function Promo({ title }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ color: '#fff' }}>
      <AmbientGlow />
      <Sequence from={0} durationInFrames={90}>
        <Audio src="sfx:whoosh" />
        <GlassCard><KineticText text={title} /></GlassCard>
      </Sequence>
    </AbsoluteFill>
  );
}
```

- `ove build promo.tsx` (needs `react`, `react-dom`, `esbuild` installed) writes `composition.json` and `promo.bundle.js`; render with `--allow-code`. Rebuild after every edit.
- Audio and video: `<Audio src="sfx:whoosh" />` and `<Video src="..." />` are automatically scanned and promoted to native audio/video layers.
- For complete guide, component library, and spring presets, read the **`ove-react-video`** skill.

## 3. The code layer: your own drawing every frame (trusted files only)

For things no layer can draw (particles, generative art, charts from data, custom 2D scenes):

```js
code(function draw(ctx, { frame, t, fps, width, height, props, api }) {
  const rand = api.random(11);                                  // repeatable
  for (let i = 0; i < 90; i++) { ctx.globalAlpha = 0.3 + 0.3 * api.noise(i, frame / 40); /* ... */ }
}, { id: 'field', width: 1920, height: 1080, props: { color: '#22d3ee' } })
```

- `draw(ctx, args)` is called once per frame on a cleared canvas of the layer's size. `args.api` has `random(seed)`, `noise(x, y, z)`, `interpolate`, `spring`, `clamp`, `lerp`, `easings`. `Math.random` and `Date` throw: a frame must be a pure function of `frame` and `props`, or renders differ.
- The function is copied into the composition as text: it must use nothing from the surrounding file (pass data in `props`). A `src` file path works too: a `.js` file defining `function draw(ctx, args)`.
- It executes JavaScript while rendering, so `ove still|review|render|dev|thumbnail` refuse it unless you pass `--allow-code`. Pass that flag only for files you wrote or have read. The AI commands and the Studio never accept code layers; do not paste code layers from other people.
- Check with `ove still <file> --frame <n> --allow-code`, and look at frames at the start, middle and end.

## Hand-drawn, physics and p5.js

Three libraries are built in; each is drawn the same on every render and in the Player.

- **Hand-drawn (rough.js).** Any rectangle or circle takes `sketch: {}` (or `{ roughness, bowing, fillStyle, hachureGap, fillWeight, boil, seed }`): loose double-stroke outlines, and a solid fill with hand-cut edges or hatching (`hachure`, `cross-hatch`, `zigzag`, `dots`, `dashed`). A top-level `sketch` on the composition reaches every rectangle, circle and physics layer; a layer opts out with `sketch: false`. `boil: 6` redraws the lines every 6 frames like a hand-redrawn cartoon. No `--allow-code` needed.
- **Physics (matter.js).** `physics(...)` (or `{ type: 'physics' }`) is a world of bodies that fall, bounce and pile up: `bodies` (set circles and rectangles, `static` ones to land on, `at` to appear later) and `emit` (many bodies: `count`, `every` frames, `spread`, `widthJitter`, `fill` as one colour or a list). `gravity`, `walls` (`box`, `floor`, `none`) and `seed` shape it. It is simulated from the layer's first frame with fixed steps, so any frame can be drawn alone and every render agrees. No `--allow-code` needed.
- **p5.js.** `p5((p, args) => { ... }, { width, height })` runs a p5 sketch's drawing once per frame: `p` is the p5 instance, `args` is `{ frame, t, fps, width, height, props, api }`. Before each frame the random and noise seeds are set and the canvas is cleared, so `p.random()` and `p.noise()` repeat and a frame depends only on its number. Do not build a picture up from frame to frame, and use `args.t`, not `millis()` tricks, for time. Like `code`, it runs JavaScript while rendering, so it needs `--allow-code`, and the AI commands never write it. p5.js is large and is loaded only for videos that have a p5 layer.

## Choosing

Prefer the builder plus ordinary layers. Use React components when you think in components, props and JSX (charts, dashboards, lists from data); the output is drawn as HTML/SVG, so it suits text, layout and vector graphics, not pixel-level drawing. Reach for a code layer only for visuals nothing else draws, and keep it small and deterministic.
