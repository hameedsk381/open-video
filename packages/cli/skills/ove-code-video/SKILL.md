---
name: ove-code-video
description: Write an Open Video Engine video as TypeScript, JavaScript or React components (loops, functions, springs, generated scenes, JSX), and draw custom visuals with a code layer. Use when the video needs logic JSON cannot express: generated layouts, data-driven scenes, physics, particles, charts or custom canvas drawing.
---

# Video as code

Three tools, from safest to most powerful. The main `ove` skill has every layer and field; this page is how to write them from code.

## 1. The builder: code that generates the JSON (safe)

```js
import { createVideo, text, rect, group, sfx, sample, spring, riseIn, keyframes, tween, fadeIn } from 'open-video-engine/builder';

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

## 2. React components (your own files only)

For Remotion-style videos: components that are pure functions of the frame.

```tsx
import { AbsoluteFill, Series, interpolate, spring, useCurrentFrame, useVideoConfig } from 'open-video-engine/react';
export const config = { id: 'promo', width: 1920, height: 1080, fps: 30, durationInFrames: 270, background: '#0b1020', props: { title: 'Hello' } };
export const layers = [{ id: 'whoosh', type: 'audio', src: 'sfx:whoosh', startFrame: 4 }];   // optional plain OVE layers beside it
export default function Promo({ title }) { const frame = useCurrentFrame(); /* ...return JSX... */ }
```

- `ove build promo.tsx` (needs `react`, `react-dom`, `esbuild` installed) writes `composition.json` and `promo.bundle.js`; render with `--allow-code`. Rebuild after every edit.
- Available: `useCurrentFrame`, `useVideoConfig` (width, height, fps, durationInFrames), `Sequence` (from, durationInFrames), `Series` with `Series.Sequence`, `AbsoluteFill`, `interpolate`, `spring`, `Easing`, `random(seed)`. Inline styles, `<style>`, SVG and pure React libraries render; `useState`, effects, timers, canvas and iframes do not.
- Everything must come from the frame and the props. `Math.random()`, `Date.now()` and network calls make frames differ or fail.
- Pictures: declare each in `config.assets` ({ id, type: 'image', src }) and use `<img src="id">`. Fonts: Inter is built in; add other fonts as font assets.
- No audio from components: add sound with exported `layers` (`sfx:…`, audio files, captions).

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

## Choosing

Prefer the builder plus ordinary layers. Use React components when you think in components, props and JSX (charts, dashboards, lists from data); the output is drawn as HTML/SVG, so it suits text, layout and vector graphics, not pixel-level drawing. Reach for a code layer only for visuals nothing else draws, and keep it small and deterministic.
